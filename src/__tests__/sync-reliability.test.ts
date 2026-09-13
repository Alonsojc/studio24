import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVE_USER_KEY, KEYS, importAllData, previewImportData } from '@/lib/store';
import {
  enqueueUpsert,
  enqueueDelete,
  enqueueRecurrenteEgreso,
  readSyncQueue,
  readLocalArray,
  writeLocalJSON,
  mergeCloudList,
  rememberDeleted,
} from '@/lib/sync-queue';
import { flushPendingSync } from '@/lib/sync-flush';
import { cachedCloudRequest, invalidateCloudCache } from '@/lib/cloud-cache';

const cloud = vi.hoisted(() => ({ write: vi.fn(), remove: vi.fn(), recurring: vi.fn() }));
vi.mock('@/lib/store-cloud', () => ({
  cloudWriteRecord: cloud.write,
  cloudDeleteRecord: cloud.remove,
  cloudCreateRecurrenteEgreso: cloud.recurring,
  cloudAddRecurrenteLog: vi.fn(),
}));
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  invalidateCloudCache();
  localStorage.setItem(ACTIVE_USER_KEY, 'owner');
});

describe('durable synchronization', () => {
  it('does not acknowledge a newer save while the earlier request is running', async () => {
    let finish!: (value: unknown) => void;
    const started = new Promise<void>((resolve) =>
      cloud.write.mockImplementationOnce(() => {
        resolve();
        return new Promise((r) => {
          finish = r;
        });
      }),
    );
    cloud.write.mockImplementationOnce(async (_table, item) => ({ ...item, serverUpdatedAt: 'v2' }));
    const first = { id: 'one', nombre: 'First', serverUpdatedAt: 'v0' };
    writeLocalJSON(KEYS.clientes, [first]);
    enqueueUpsert('clientes', first);
    const running = flushPendingSync();
    await started;
    const second = { ...first, nombre: 'Second' };
    writeLocalJSON(KEYS.clientes, [second]);
    enqueueUpsert('clientes', second);
    finish({ ...first, serverUpdatedAt: 'v1' });
    await running;
    expect(cloud.write).toHaveBeenCalledTimes(2);
    expect(cloud.write.mock.calls[1][1]).toMatchObject({ nombre: 'Second', serverUpdatedAt: 'v1' });
    expect(readSyncQueue()).toHaveLength(0);
    expect(readLocalArray(KEYS.clientes)).toEqual([{ ...second, serverUpdatedAt: 'v2' }]);
  });
  it('retains conflict and continues independent records', async () => {
    cloud.write.mockRejectedValueOnce(new Error('CONFLICT: newer')).mockResolvedValueOnce({ id: 'two' });
    enqueueUpsert('clientes', { id: 'one' });
    enqueueUpsert('clientes', { id: 'two' });
    await expect(flushPendingSync()).rejects.toThrow('CONFLICT');
    expect(readSyncQueue()).toHaveLength(1);
    expect(readSyncQueue()[0]).toMatchObject({ recordId: 'one', attempts: 1, lastError: 'CONFLICT: newer' });
  });
  it('keeps a pending local record even when the cloud clock is newer', () => {
    const local = { id: 'one', updatedAt: '2026-01-01', nombre: 'Pending' };
    enqueueUpsert('clientes', local);
    expect(mergeCloudList(KEYS.clientes, [local], [{ ...local, updatedAt: '2027-01-01', nombre: 'Remote' }])).toEqual([
      local,
    ]);
  });
  it('does not resurrect cached deletions on subsequent pulls', () => {
    rememberDeleted(KEYS.clientes, ['one']);
    expect(mergeCloudList(KEYS.clientes, [{ id: 'one' }], [])).toEqual([]);
    expect(mergeCloudList(KEYS.clientes, [{ id: 'one' }], [{ id: 'one' }])).toEqual([]);
  });
  it('removes a temporary recurring record when the server already processed the month', async () => {
    writeLocalJSON(KEYS.egresos, [{ id: 'temp' }]);
    enqueueRecurrenteEgreso({}, 'temp');
    cloud.recurring.mockResolvedValue({ created: false, egreso: { id: 'canonical' } });
    await flushPendingSync();
    expect(readLocalArray(KEYS.egresos)).toEqual([{ id: 'canonical' }]);
    expect(readSyncQueue()).toHaveLength(0);
  });
  it('preserves the version for deletes', async () => {
    writeLocalJSON(KEYS.clientes, [{ id: 'one', serverUpdatedAt: 'v1' }]);
    enqueueDelete('clientes', 'one');
    cloud.remove.mockResolvedValue(undefined);
    await flushPendingSync();
    expect(cloud.remove).toHaveBeenCalledWith('clientes', 'one', 'v1');
  });
  it('ignores restored executable queue operations and deletion markers', () => {
    importAllData(
      JSON.stringify({
        syncQueue: [{ action: 'delete', recordId: 'real' }],
        deletedRecords: { [KEYS.clientes]: ['real'] },
      }),
    );
    expect(readSyncQueue()).toEqual([]);
    expect(mergeCloudList(KEYS.clientes, [], [{ id: 'real' }])).toEqual([{ id: 'real' }]);
  });
  it('rejects duplicate or missing record identifiers before restore', () => {
    expect(() => previewImportData('{"clientes":[{"id":"a"},{"id":"a"}]}')).toThrow();
    expect(() => previewImportData('{"clientes":[null]}')).toThrow();
  });
  it('deduplicates reads and invalidates the cache explicitly', async () => {
    const fetcher = vi.fn(async () => ['result']);
    await cachedCloudRequest('key', fetcher);
    await cachedCloudRequest('key', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    invalidateCloudCache();
    await cachedCloudRequest('key', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    localStorage.setItem(ACTIVE_USER_KEY, 'other');
    await cachedCloudRequest('key', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
