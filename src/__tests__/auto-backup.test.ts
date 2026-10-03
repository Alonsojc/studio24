import { beforeEach, expect, it, vi } from 'vitest';
import { autoBackupIfDue, getBackupStatus } from '@/lib/auto-backup';
const api = vi.hoisted(() => ({ export: vi.fn(), flush: vi.fn(), upload: vi.fn(), pending: vi.fn() }));
vi.mock('@/lib/store-cloud', () => ({ exportCloudBackup: api.export }));
vi.mock('@/lib/sync-flush', () => ({ flushPendingSync: api.flush }));
vi.mock('@/lib/sync-queue', () => ({ hasPendingSync: api.pending }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
    storage: { from: () => ({ upload: api.upload, list: async () => ({ data: [] }) }) },
  },
}));
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('bordados_active_user_id', 'owner');
  vi.clearAllMocks();
  api.pending.mockReturnValue(false);
  api.flush.mockResolvedValue(0);
  api.export.mockResolvedValue('{"clientes":[],"backupMetadata":{"source":"cloud-team"}}');
  api.upload.mockResolvedValue({ error: null });
});
it('exports cloud data and confirms success only after upload', async () => {
  const result = await autoBackupIfDue(true);
  expect(result?.state).toBe('success');
  expect(api.export).toHaveBeenCalledOnce();
  expect(api.upload).toHaveBeenCalledOnce();
  expect(getBackupStatus()?.source).toBe('cloud-team');
});
it('reports upload failures without recording a successful backup date', async () => {
  api.upload.mockResolvedValue({ error: new Error('Storage unavailable') });
  expect((await autoBackupIfDue(true))?.state).toBe('error');
  expect(getBackupStatus()?.message).toBe('Storage unavailable');
  expect(localStorage.getItem('bordados_last_backup')).toBeNull();
});
it('does not claim a cloud backup includes unsynchronized changes', async () => {
  api.pending.mockReturnValue(true);
  expect((await autoBackupIfDue(true))?.state).toBe('error');
  expect(api.export).not.toHaveBeenCalled();
  expect(api.upload).not.toHaveBeenCalled();
});
