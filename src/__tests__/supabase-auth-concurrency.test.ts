import { Buffer } from 'node:buffer';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

function sessionFor(userId: string, refreshToken: string): Session {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: expiresAt, aud: 'authenticated' })).toString(
    'base64url',
  );
  return {
    access_token: `${header}.${payload}.test-signature`,
    refresh_token: refreshToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    user: { id: userId, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' },
  };
}

describe('Supabase auth concurrency regression', () => {
  const userA = '10000000-0000-0000-0000-000000000001';
  const userB = '10000000-0000-0000-0000-000000000002';
  let clients: SupabaseClient[];
  let values: Map<string, string>;
  let storageKey: string;
  let locksDescriptor: PropertyDescriptor | undefined;
  const requestLock = vi.fn();

  const stored = () => JSON.parse(values.get(storageKey) || 'null') as Session | null;
  const save = (session: Session) => values.set(storageKey, JSON.stringify(session));
  const clientWith = (fetcher: typeof fetch) => {
    const client = createClient('https://auth-test.example.invalid', 'test-anon-key', {
      auth: {
        storageKey,
        storage: {
          getItem: (key) => values.get(key) ?? null,
          setItem: (key, value) => void values.set(key, value),
          removeItem: (key) => void values.delete(key),
        },
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: fetcher },
    });
    clients.push(client);
    return client;
  };

  beforeEach(() => {
    clients = [];
    values = new Map();
    storageKey = `test-auth-${crypto.randomUUID()}`;
    vi.stubGlobal('BroadcastChannel', undefined);
    locksDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
    requestLock.mockReset();
    requestLock.mockRejectedValue(
      new DOMException("Lock broken by another request with the 'steal' option.", 'AbortError'),
    );
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: requestLock } });
    save(sessionFor(userA, 'original-refresh'));
  });

  afterEach(async () => {
    for (const client of clients) {
      await client.auth.stopAutoRefresh();
      // dispose is provided by the upgraded SDK, but not the affected old version.
      await (client.auth as typeof client.auth & { dispose?: () => Promise<void> }).dispose?.();
    }
    if (locksDescriptor) Object.defineProperty(navigator, 'locks', locksDescriptor);
    else Reflect.deleteProperty(navigator, 'locks');
    vi.unstubAllGlobals();
  });

  it('reads and verifies a session even if the browser auth lock would be stolen', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(sessionFor(userA, 'x').user));
    const client = clientWith(fetcher);
    const session = await client.auth.getSession();
    const user = await client.auth.getUser();
    expect(session.error).toBeNull();
    expect(session.data.session?.user.id).toBe(userA);
    expect(user.data.user?.id).toBe(userA);
    expect(user.error).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(requestLock).not.toHaveBeenCalled();
  });

  it('does not block session reads behind a slow user verification', async () => {
    const started = deferred();
    const release = deferred();
    const client = clientWith(async () => {
      started.resolve();
      await release.promise;
      return Response.json(sessionFor(userA, 'x').user);
    });
    await client.auth.getSession();
    const verification = client.auth.getUser();
    try {
      await started.promise;
      const session = await client.auth.getSession();
      expect(session.data.session?.user.id).toBe(userA);
      expect(requestLock).not.toHaveBeenCalled();
    } finally {
      release.resolve();
      await verification;
    }
  });

  it('does not resurrect a session when a refresh arrives after sign-out', async () => {
    const started = deferred();
    const release = deferred();
    const client = clientWith(async (input) => {
      if (String(input).includes('/token')) {
        started.resolve();
        await release.promise;
        return Response.json(sessionFor(userA, 'late-refresh'));
      }
      return Response.json({});
    });
    await client.auth.getSession();
    const refresh = client.auth.refreshSession();
    try {
      await started.promise;
      const signedOut = await client.auth.signOut({ scope: 'local' });
      expect(signedOut.error).toBeNull();
    } finally {
      release.resolve();
      await refresh;
    }
    expect(stored()).toBeNull();
    expect((await client.auth.getSession()).data.session).toBeNull();
  });

  it('preserves the newer session saved by another tab over a late refresh', async () => {
    const started = deferred();
    const release = deferred();
    const client = clientWith(async () => {
      started.resolve();
      await release.promise;
      return Response.json(sessionFor(userA, 'stale-refresh'));
    });
    await client.auth.getSession();
    const refresh = client.auth.refreshSession();
    try {
      await started.promise;
      save(sessionFor(userB, 'new-account-refresh'));
    } finally {
      release.resolve();
      await refresh;
    }
    expect(stored()?.user.id).toBe(userB);
    expect(stored()?.refresh_token).toBe('new-account-refresh');
    expect((await client.auth.getSession()).data.session?.user.id).toBe(userB);
  });
});
