import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mirrorToIDB, clearStudioDB, restoreFromIDB } from '@/lib/db';
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
