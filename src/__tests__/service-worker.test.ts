import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(resolve('public/sw.js'), 'utf8');

function worker(fetchMock = vi.fn()) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const cache = { addAll: vi.fn().mockResolvedValue(undefined), put: vi.fn() };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    match: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue(['studio24-v5', 'studio24-v6', 'jacaranda-v1']),
    delete: vi.fn().mockResolvedValue(true),
  };
  runInNewContext(source, {
    URL,
    Response,
    caches,
    fetch: fetchMock,
    self: {
      location: { origin: 'https://alonsojc.github.io' },
      addEventListener: (name: string, handler: (event: unknown) => void) => (handlers[name] = handler),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() },
    },
  });
  return { handlers, caches };
}

function navigation(url = 'https://alonsojc.github.io/studio24/clientes') {
  return { url, method: 'GET', mode: 'navigate', headers: new Headers({ accept: 'text/html' }) };
}

describe('service worker connection recovery', () => {
  it('returns a retry page instead of rejecting navigation when the network fails', async () => {
    const { handlers, caches } = worker(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const respondWith = vi.fn();
    handlers.fetch({ request: navigation(), respondWith });
    const response = await respondWith.mock.calls[0][0];
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toContain('Reintentar');
    expect(caches.open).not.toHaveBeenCalled();
  });

  it('passes through fresh HTML without caching it', async () => {
    const response = new Response('Clientes');
    const fetchMock = vi.fn().mockResolvedValue(response);
    const { handlers, caches } = worker(fetchMock);
    const request = navigation();
    const respondWith = vi.fn();
    handlers.fetch({ request, respondWith });
    expect(await respondWith.mock.calls[0][0]).toBe(response);
    expect(fetchMock).toHaveBeenCalledWith(request, { cache: 'no-store' });
    expect(caches.open).not.toHaveBeenCalled();
  });

  it('does not intercept other apps or Supabase', () => {
    const fetchMock = vi.fn();
    const { handlers } = worker(fetchMock);
    const respondWith = vi.fn();
    handlers.fetch({ request: navigation('https://alonsojc.github.io/jacaranda/'), respondWith });
    handlers.fetch({ request: navigation('https://example.com/studio24/clientes'), respondWith });
    handlers.fetch({ request: navigation('https://project.supabase.co/rest/v1/clientes'), respondWith });
    expect(respondWith).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('only removes older Studio24 caches during activation', async () => {
    const { handlers, caches } = worker();
    const waitUntil = vi.fn();
    handlers.activate({ waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(caches.delete).toHaveBeenCalledExactlyOnceWith('studio24-v5');
  });
});
