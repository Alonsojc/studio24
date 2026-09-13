import { beforeEach, describe, it, expect, vi } from 'vitest';
import { ACTIVE_TEAM_KEY, EXTRA_BACKUP_KEYS, exportAllData } from '@/lib/store';
import { getFinanceEntries, saveFinanceEntry, migrateLegacyFinance, apartadoStatuses } from '@/lib/finance-entries';
import { readSyncQueue } from '@/lib/sync-queue';
vi.mock('@/lib/sync-status', () => ({ trackSync: vi.fn() }));
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(ACTIVE_TEAM_KEY, 'team');
});
describe('team finance records', () => {
  it('records the amount and date, while keeping donation separate from fiscal losses', () => {
    const entry = saveFinanceEntry('donacion', '2026-09', 25.125, true);
    expect(entry).toMatchObject({ id: 'team:donacion:2026-09', amount: 25.13, separated: true });
    expect(entry.separatedAt).toBeTruthy();
    expect(getFinanceEntries()).toHaveLength(1);
    expect(readSyncQueue()).toHaveLength(1);
    expect(JSON.parse(exportAllData()).financeEntries[0]).toEqual(entry);
    expect(apartadoStatuses([entry])).toEqual({ '2026-09': { donacion: true } });
  });
  it('updates the same logical entry instead of adding another', () => {
    saveFinanceEntry('reinversion', '2026-anual', 100, true);
    saveFinanceEntry('reinversion', '2026-anual', 100, false);
    expect(getFinanceEntries()).toHaveLength(1);
    expect(getFinanceEntries()[0].separated).toBe(false);
  });
  it('migrates legacy marks once without inventing historical dates or amounts', () => {
    localStorage.setItem(EXTRA_BACKUP_KEYS.apartadosUtilidad, '{"2026-09":{"donacion":true}}');
    localStorage.setItem(EXTRA_BACKUP_KEYS.perdidasFiscales, '[{"year":2025,"monto":200}]');
    migrateLegacyFinance();
    migrateLegacyFinance();
    expect(getFinanceEntries()).toHaveLength(2);
    expect(getFinanceEntries()[0]).toMatchObject({ amount: 0, separatedAt: null });
    expect(getFinanceEntries()[1]).toMatchObject({ kind: 'perdida', amount: 200 });
  });
  it('rejects invalid amounts and periods before writing', () => {
    expect(() => saveFinanceEntry('donacion', '2026-13', 20)).toThrow();
    expect(() => saveFinanceEntry('donacion', '2026-09', NaN)).toThrow();
    expect(readSyncQueue()).toEqual([]);
  });
});
