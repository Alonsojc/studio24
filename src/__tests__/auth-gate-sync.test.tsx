import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthGate from '@/components/AuthGate';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  pullFromCloud: vi.fn(),
  flushPendingSync: vi.fn(),
  bindLocalDataToUser: vi.fn(),
  hasLocalBusinessData: vi.fn(),
  reportError: vi.fn(),
  preservePendingUserData: vi.fn(),
  clearSensitiveLocalData: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange } },
}));
vi.mock('@/lib/store-cloud', () => ({ pullFromCloud: mocks.pullFromCloud }));
vi.mock('@/lib/sync-flush', () => ({ flushPendingSync: mocks.flushPendingSync }));
vi.mock('@/lib/store', () => ({
  bindLocalDataToUser: mocks.bindLocalDataToUser,
  hasLocalBusinessData: mocks.hasLocalBusinessData,
  clearSensitiveLocalData: mocks.clearSensitiveLocalData,
  preservePendingUserData: mocks.preservePendingUserData,
  ACTIVE_TEAM_KEY: 'bordados_active_team_id',
}));
vi.mock('@/lib/sentry', () => ({ reportError: mocks.reportError }));
vi.mock('@/lib/auth', () => ({ signIn: vi.fn(), signUp: vi.fn(), resetPassword: vi.fn() }));

describe('AuthGate background sync', () => {
  let container: HTMLDivElement;
  let root: Root;
  let authCallback: (event: string, session: unknown) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    vi.useFakeTimers();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    mocks.onAuthStateChange.mockImplementation((callback) => {
      authCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mocks.bindLocalDataToUser.mockReturnValue(false);
    mocks.hasLocalBusinessData.mockReturnValue(true);
    mocks.flushPendingSync.mockResolvedValue(0);
    sessionStorage.setItem('bordados_boot_synced_user-1', '1');
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('keeps one background pull in flight without reporting a connection timeout', async () => {
    let completePull!: () => void;
    mocks.pullFromCloud.mockImplementation(() => new Promise<void>((resolve) => (completePull = resolve)));

    await act(async () =>
      root.render(
        <AuthGate>
          <div>Aplicacion</div>
        </AuthGate>,
      ),
    );
    expect(container.textContent).toContain('Aplicacion');
    expect(mocks.pullFromCloud).toHaveBeenCalledTimes(1);

    await act(async () => {
      authCallback('SIGNED_IN', { user: { id: 'user-1' } });
      await vi.advanceTimersByTimeAsync(9_000);
    });
    expect(mocks.pullFromCloud).toHaveBeenCalledTimes(1);
    expect(mocks.reportError).not.toHaveBeenCalled();

    await act(async () => completePull());
    expect(sessionStorage.getItem('bordados_boot_synced_user-1')).toBe('1');
  });

  it('reports an actual background pull failure', async () => {
    mocks.pullFromCloud.mockRejectedValue(new Error('Supabase no disponible'));
    await act(async () =>
      root.render(
        <AuthGate>
          <div>Aplicacion</div>
        </AuthGate>,
      ),
    );
    expect(mocks.reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Supabase no disponible' }), {
      kind: 'authBootstrapPullFromCloud',
    });
    expect(container.textContent).toContain('Aplicacion');
  });
  it('uses an existing team cache in a new tab without awaiting the cloud download', async () => {
    sessionStorage.clear();
    localStorage.setItem('bordados_active_team_id', 'team');
    mocks.pullFromCloud.mockImplementation(() => new Promise(() => {}));
    await act(async () =>
      root.render(
        <AuthGate>
          <div>Aplicacion</div>
        </AuthGate>,
      ),
    );
    expect(container.textContent).toContain('Aplicacion');
    expect(mocks.pullFromCloud).toHaveBeenCalledWith({ replaceEmpty: false, bootstrap: true });
  });
  it('preserves pending data before clearing a lost session', async () => {
    mocks.pullFromCloud.mockResolvedValue(0);
    await act(async () =>
      root.render(
        <AuthGate>
          <div>Aplicacion</div>
        </AuthGate>,
      ),
    );
    await act(async () => {
      authCallback('SIGNED_OUT', null);
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.preservePendingUserData).toHaveBeenCalledOnce();
    expect(mocks.preservePendingUserData.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.clearSensitiveLocalData.mock.invocationCallOrder[0],
    );
    expect(container.textContent).not.toContain('Aplicacion');
  });
});
