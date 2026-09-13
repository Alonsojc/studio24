'use client';

import { KEYS, EXTRA_BACKUP_KEYS, ACTIVE_TEAM_KEY } from './store';
import { enqueueUpsert, readLocalArray, writeLocalJSON, type VersionedRecord } from './sync-queue';
import { trackSync } from './sync-status';

export type ApartadoKind = 'reinversion' | 'donacion';
export interface FinanceEntry extends VersionedRecord {
  kind: ApartadoKind | 'perdida';
  period: string;
  amount: number;
  separated: boolean;
  separatedAt?: string | null;
  actorId?: string | null;
}
export type ApartadoStatusMap = Record<string, Partial<Record<ApartadoKind, boolean>>>;
export const getFinanceEntries = () => readLocalArray<FinanceEntry>(KEYS.financeEntries);

function financeId(kind: FinanceEntry['kind'], period: string): string {
  const teamId = localStorage.getItem(ACTIVE_TEAM_KEY);
  if (!teamId) throw new Error('Espera a que termine la sincronizacion del equipo');
  return `${teamId}:${kind}:${period}`;
}

export function saveFinanceEntry(
  kind: FinanceEntry['kind'],
  period: string,
  amount: number,
  separated = false,
): FinanceEntry {
  if (!Number.isFinite(amount) || amount < 0 || !/^\d{4}(-(0[1-9]|1[0-2])|-anual)?$/.test(period))
    throw new Error('Importe o periodo invalido');
  const items = getFinanceEntries();
  const previous = items.find((item) => item.kind === kind && item.period === period);
  const timestamp = new Date().toISOString();
  const entry: FinanceEntry = {
    ...previous,
    id: previous?.id || financeId(kind, period),
    kind,
    period,
    amount: Math.round(amount * 100) / 100,
    separated,
    separatedAt: separated ? timestamp : null,
    createdAt: previous?.createdAt || timestamp,
    updatedAt: timestamp,
  };
  enqueueUpsert('finance_entries', entry);
  writeLocalJSON(KEYS.financeEntries, [...items.filter((item) => item.id !== entry.id), entry]);
  trackSync(async () => (await import('./sync-flush')).flushPendingSync());
  return entry;
}

export function apartadoStatuses(entries: FinanceEntry[]): ApartadoStatusMap {
  const result: ApartadoStatusMap = {};
  for (const item of entries)
    if (item.kind !== 'perdida') {
      result[item.period] = { ...result[item.period], [item.kind]: item.separated };
    }
  return result;
}

// Legacy marks have no amount/date evidence; preserve the mark without inventing either.
export function migrateLegacyFinance(): void {
  const entries = getFinanceEntries();
  const add = (kind: FinanceEntry['kind'], period: string, amount: number, separated: boolean) => {
    if (entries.some((entry) => entry.kind === kind && entry.period === period)) return;
    const entry: FinanceEntry = { id: financeId(kind, period), kind, period, amount, separated, separatedAt: null };
    entries.push(entry);
    enqueueUpsert('finance_entries', entry);
  };
  const marks = JSON.parse(localStorage.getItem(EXTRA_BACKUP_KEYS.apartadosUtilidad) || '{}');
  for (const [period, value] of Object.entries(marks)) {
    if (!/^\d{4}(-(0[1-9]|1[0-2])|-anual)$/.test(period) || !value || typeof value !== 'object') continue;
    for (const kind of ['reinversion', 'donacion'] as const)
      if ((value as Record<string, unknown>)[kind] === true) add(kind, period, 0, true);
  }
  const losses = readLocalArray<{ year: number; monto: number }>(EXTRA_BACKUP_KEYS.perdidasFiscales);
  for (const loss of losses)
    if (
      Number.isInteger(loss.year) &&
      /^\d{4}$/.test(String(loss.year)) &&
      Number.isFinite(loss.monto) &&
      loss.monto >= 0
    )
      add('perdida', String(loss.year), loss.monto, false);
  writeLocalJSON(KEYS.financeEntries, entries);
}
