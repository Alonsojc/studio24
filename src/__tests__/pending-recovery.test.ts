import { beforeEach, expect, it, vi } from 'vitest';
import {
  ACTIVE_USER_KEY,
  KEYS,
  bindLocalDataToUser,
  clearSensitiveLocalData,
  preservePendingUserData,
  safeSetItem,
} from '@/lib/store';
import { enqueueUpsert, readSyncQueue } from '@/lib/sync-queue';
const recovery = vi.hoisted(() => ({ data: new Map<string, string>(), save: vi.fn() }));
vi.mock('@/lib/db', () => ({
  mirrorToIDB: vi.fn(),
  removeFromIDB: vi.fn(),
  clearStudioDB: vi.fn(),
  saveUserRecovery: recovery.save,
  readUserRecovery: async (owner: string) => recovery.data.get(owner),
  deleteUserRecovery: async (owner: string) => recovery.data.delete(owner),
}));
beforeEach(() => {
  localStorage.clear();
  recovery.data.clear();
  recovery.save.mockImplementation(async (owner, raw) => recovery.data.set(owner, raw));
});
it('falls back to IndexedDB if localStorage cannot hold a recovery snapshot', async () => {
  localStorage.setItem(ACTIVE_USER_KEY, 'owner');
  safeSetItem(KEYS.clientes, JSON.stringify([{ id: 'pending', nombre: 'Protected' }]));
  enqueueUpsert('clientes', { id: 'pending', nombre: 'Protected' });
  const original = Storage.prototype.setItem;
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key.startsWith('studio24_recovery_')) throw new DOMException('Full', 'QuotaExceededError');
    return original.call(this, key, value);
  });
  try {
    await preservePendingUserData();
    expect(recovery.save).toHaveBeenCalledOnce();
    clearSensitiveLocalData();
    await bindLocalDataToUser('owner');
    expect(readSyncQueue()).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(KEYS.clientes)!)[0].nombre).toBe('Protected');
    expect(recovery.data.size).toBe(0);
  } finally {
    spy.mockRestore();
  }
});
