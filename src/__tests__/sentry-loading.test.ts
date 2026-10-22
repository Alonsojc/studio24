import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('non-blocking monitoring startup', () => {
  const init = vi.fn();
  const setUser = vi.fn();
  const captureException = vi.fn();
  const captureMessage = vi.fn();
  let release: () => void;
  let failImport: boolean;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', `https://${'a'.repeat(32)}@example.sentry.io/123`);
    vi.stubEnv('NEXT_PUBLIC_SENTRY_RELEASE', 'test-release');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    failImport = false;
    const gate = new Promise<void>((resolve) => (release = resolve));
    vi.doMock('@sentry/browser', async () => {
      await gate;
      if (failImport) throw new Error('Monitoring download failed');
      return { init, setUser, captureException, captureMessage };
    });
  });

  afterEach(() => {
    vi.doUnmock('@sentry/browser');
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('shares one SDK load and retains sanitized errors during the download', async () => {
    const sentry = await import('@/lib/sentry');
    const loading = sentry.initSentry();
    expect(sentry.initSentry()).toBe(loading);
    const error = new Error('Startup failed');
    sentry.identifySentryUser({ id: 'user-1', email: 'private@example.invalid' });
    sentry.reportError(error, { kind: 'startup', token: 'secret' });
    expect(init).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
    release();
    await loading;
    expect(init).toHaveBeenCalledOnce();
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ release: 'test-release' }));
    expect(setUser).toHaveBeenCalledWith({ id: 'user-1' });
    expect(captureException).toHaveBeenCalledExactlyOnceWith(error, {
      contexts: { app: { kind: 'startup', token: '[Filtered]' } },
    });
    sentry.reportError('Later failure');
    expect(captureMessage).toHaveBeenCalledWith('Later failure', { level: 'error' });
    expect(captureException.mock.calls[0][1]).not.toHaveProperty('user.email');
  });

  it('does not retain a signed-out identity while the chunk is loading', async () => {
    const sentry = await import('@/lib/sentry');
    const loading = sentry.initSentry();
    sentry.identifySentryUser({ id: 'old-user' });
    sentry.identifySentryUser(null);
    release();
    await loading;
    expect(setUser).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('bounds the early error queue', async () => {
    const sentry = await import('@/lib/sentry');
    const loading = sentry.initSentry();
    for (let i = 0; i < 30; i++) sentry.reportError(`failure-${i}`);
    release();
    await loading;
    expect(captureMessage).toHaveBeenCalledTimes(20);
    expect(captureMessage.mock.calls[0][0]).toBe('failure-10');
    expect(captureMessage.mock.calls[19][0]).toBe('failure-29');
  });

  it('does not load the SDK when the DSN is missing or invalid', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
    const sentry = await import('@/lib/sentry');
    await sentry.initSentry();
    sentry.reportError(new Error('No monitoring configured'));
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'invalid');
    await sentry.initSentry();
    expect(init).not.toHaveBeenCalled();
    release();
  });

  it('contains a monitoring download failure without rejecting app startup', async () => {
    const sentry = await import('@/lib/sentry');
    const loading = sentry.initSentry();
    failImport = true;
    release();
    await expect(loading).resolves.toBeUndefined();
    expect(init).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('[sentryInit]', expect.any(Error));
  });
});
