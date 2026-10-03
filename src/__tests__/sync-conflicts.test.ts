import { beforeEach, expect, it, vi } from 'vitest';
import { resolveConflict } from '@/lib/sync-conflicts';
import { ACTIVE_USER_KEY, KEYS } from '@/lib/store';
import {
  enqueueUpsert,
  markSyncQueueEntryFailed,
  readSyncQueue,
  writeLocalJSON,
  readLocalArray,
} from '@/lib/sync-queue';

const remote = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/lib/teams', () => ({ getMyTeamId: async () => 'team' }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const query = { select: () => query, eq: () => query, maybeSingle: remote.read };
      return query;
    },
  },
}));
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  localStorage.setItem(ACTIVE_USER_KEY, 'owner');
  remote.read.mockResolvedValue({ data: { id: 'one', nombre: 'Cloud', updated_at: 'v2' }, error: null });
});

function twoConflicts() {
  enqueueUpsert('clientes', { id: 'one', nombre: 'Old', serverUpdatedAt: 'v1' });
  enqueueUpsert('clientes', { id: 'one', nombre: 'New', serverUpdatedAt: 'v1' });
  const entries = readSyncQueue();
  for (const entry of entries) markSyncQueueEntryFailed(entry.id, new Error('CONFLICT'));
  return entries;
}

it('a newer edit supersedes older conflicts only after it is persisted', () => {
  const entries = twoConflicts();
  enqueueUpsert('clientes', { id: 'one', nombre: 'Newest', serverUpdatedAt: 'v1' });
  expect(readSyncQueue()).toHaveLength(1);
  expect(readSyncQueue()[0].payload).toMatchObject({ nombre: 'Newest' });
  expect(entries.some((entry) => entry.id === readSyncQueue()[0].id)).toBe(false);
});
it('rejects an older selected conflict without replacing a newer edit', async () => {
  const entries = twoConflicts();
  await expect(resolveConflict(entries[0].id, 'local', { id: 'one', serverUpdatedAt: 'v2' })).rejects.toThrow(
    'mas reciente',
  );
  expect(readSyncQueue()).toHaveLength(2);
});
it('preserves conflicts when the newer operation cannot be saved', () => {
  const entries = twoConflicts();
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Full', 'QuotaExceededError');
  });
  try {
    expect(() => enqueueUpsert('clientes', { id: 'one', nombre: 'Newest' })).toThrow();
    expect(readSyncQueue().map((entry) => entry.id)).toEqual(entries.map((entry) => entry.id));
  } finally {
    spy.mockRestore();
  }
});
it('resolves the latest local edit once using the reviewed server version', async () => {
  const entries = twoConflicts();
  await resolveConflict(entries[1].id, 'local', { id: 'one', serverUpdatedAt: 'v2' });
  expect(readSyncQueue()).toHaveLength(1);
  expect(readSyncQueue()[0].payload).toMatchObject({ nombre: 'New', serverUpdatedAt: 'v2' });
  expect(readSyncQueue()[0].lastError).toBeUndefined();
  expect(localStorage.getItem(`bordados_conflict_backup_${entries[0].id}`)).not.toBeNull();
});
it('choosing cloud for the latest conflict removes obsolete pending copies', async () => {
  const entries = twoConflicts();
  writeLocalJSON(KEYS.clientes, [{ id: 'one', nombre: 'New' }]);
  await resolveConflict(entries[1].id, 'cloud', { id: 'one', serverUpdatedAt: 'v2' });
  expect(readSyncQueue()).toHaveLength(0);
  expect(readLocalArray(KEYS.clientes)[0]).toMatchObject({ nombre: 'Cloud', serverUpdatedAt: 'v2' });
});
