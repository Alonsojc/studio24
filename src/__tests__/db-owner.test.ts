import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mirrorToIDB, clearStudioDB, restoreFromIDB, readUserRecovery } from '@/lib/db';
const api = { open: vi.fn(() => ({})), deleteDatabase: vi.fn(() => ({})) };
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal('indexedDB', api);
});
afterEach(() => vi.unstubAllGlobals());
it('opens a separate database for each authenticated user', () => {
  localStorage.setItem('bordados_active_user_id', 'alice');
  mirrorToIDB('bordados_clientes', '[]');
  localStorage.setItem('bordados_active_user_id', 'bob');
  mirrorToIDB('bordados_clientes', '[]');
  expect(api.open.mock.calls).toEqual([
    ['studio24_db_alice', 1],
    ['studio24_db_bob', 1],
  ]);
});
it('does not open an unowned cache and only removes the requested user database', async () => {
  expect(await restoreFromIDB()).toBe(false);
  expect(api.open).not.toHaveBeenCalled();
  clearStudioDB('alice');
  expect(api.deleteDatabase).toHaveBeenCalledExactlyOnceWith('studio24_db_alice');
});
it('bounds a blocked recovery database request', async () => {
  vi.useFakeTimers();
  try {
    const pending = expect(readUserRecovery('alice')).rejects.toThrow('no responde');
    await vi.advanceTimersByTimeAsync(4000);
    await pending;
  } finally {
    vi.useRealTimers();
  }
});
