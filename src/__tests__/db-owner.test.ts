import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mirrorToIDB, clearStudioDB, restoreFromIDB, readUserRecovery } from '@/lib/db';
const api = { open: vi.fn(() => ({})), deleteDatabase: vi.fn(() => ({})) };
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  api.open.mockReset().mockImplementation(() => ({}));
  vi.stubGlobal('indexedDB', api);
});
afterEach(() => vi.unstubAllGlobals());

function readableCache(values: Record<string, string>, beforeRead?: (key: string) => void) {
  const rows = new Map(Object.entries(values));
  api.open.mockImplementation(() => {
    const request = {
      onsuccess: null as (() => void) | null,
      result: {
        close: vi.fn(),
        transaction: () => {
          const tx = {
            oncomplete: null as (() => void) | null,
            objectStore: () => ({
              get: (key: string) => {
                const operation = { result: rows.get(key), onsuccess: null as (() => void) | null };
                queueMicrotask(() => {
                  beforeRead?.(key);
                  operation.onsuccess?.();
                  tx.oncomplete?.();
                });
                return operation;
              },
              getAllKeys: () => {
                const operation = { result: [...rows.keys()], onsuccess: null as (() => void) | null };
                queueMicrotask(() => {
                  operation.onsuccess?.();
                  tx.oncomplete?.();
                });
                return operation;
              },
              put: (value: string, key: string) => {
                rows.set(key, value);
                queueMicrotask(() => tx.oncomplete?.());
              },
            }),
          };
          return tx;
        },
      },
    };
    queueMicrotask(() => request.onsuccess?.());
    return request;
  });
}

it('does not report a restore when IndexedDB only contains the owner marker', async () => {
  localStorage.setItem('bordados_active_user_id', 'alice');
  readableCache({ bordados_active_user_id: 'alice' });
  expect(await restoreFromIDB()).toBe(false);
  expect(await restoreFromIDB()).toBe(false);
});

it('restores owned data in place and notifies mounted local-first views', async () => {
  localStorage.setItem('bordados_active_user_id', 'alice');
  const value = JSON.stringify([{ id: 'pending-client', nombre: 'Cliente de prueba' }]);
  readableCache({ bordados_active_user_id: 'alice', bordados_clientes: value });
  const notify = vi.fn();
  window.addEventListener('studio24:local-change', notify);
  try {
    expect(await restoreFromIDB()).toBe(true);
    expect(localStorage.getItem('bordados_clientes')).toBe(value);
    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0][0].detail).toBe('bordados_clientes');
    expect(await restoreFromIDB()).toBe(false);
  } finally {
    window.removeEventListener('studio24:local-change', notify);
  }
});

it('does not overwrite local changes arriving during recovery', async () => {
  localStorage.setItem('bordados_active_user_id', 'alice');
  readableCache({ bordados_active_user_id: 'alice', bordados_clientes: '[{"id":"old"}]' }, (key) => {
    if (key === 'bordados_clientes') localStorage.setItem(key, '[{"id":"new"}]');
  });
  expect(await restoreFromIDB()).toBe(false);
  expect(localStorage.getItem('bordados_clientes')).toBe('[{"id":"new"}]');
});

it('stops recovery if the authenticated account changes', async () => {
  localStorage.setItem('bordados_active_user_id', 'alice');
  readableCache({ bordados_active_user_id: 'alice', bordados_clientes: '[{"id":"alice-client"}]' }, (key) => {
    if (key === 'bordados_clientes') localStorage.setItem('bordados_active_user_id', 'bob');
  });
  expect(await restoreFromIDB()).toBe(false);
  expect(localStorage.getItem('bordados_active_user_id')).toBe('bob');
  expect(localStorage.getItem('bordados_clientes')).toBeNull();
});
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
