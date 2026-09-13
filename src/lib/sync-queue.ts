'use client';

import { EXTRA_BACKUP_KEYS, KEYS, safeSetItem, type StoreStorageKey } from './store';

export type SyncTable =
  | 'clientes'
  | 'proveedores'
  | 'ingresos'
  | 'egresos'
  | 'pedidos'
  | 'productos'
  | 'cotizaciones'
  | 'egresos_recurrentes'
  | 'inventario'
  | 'disenos'
  | 'plantillas'
  | 'config'
  | 'finance_entries'
  | 'recurrentes_log';

export type SyncAction = 'upsert' | 'delete' | 'recurrente_log' | 'recurrente_egreso';

export interface SyncQueueEntry {
  id: string;
  table: SyncTable;
  localKey: string;
  action: SyncAction;
  recordId: string;
  payload?: unknown;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  lastError?: string;
}

export interface VersionedRecord {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  serverUpdatedAt?: string;
}

export const SYNC_QUEUE_KEY = EXTRA_BACKUP_KEYS.syncQueue;
export const SYNC_PULL_PAUSED_UNTIL_KEY = EXTRA_BACKUP_KEYS.syncPullPausedUntil;

const TABLE_TO_LOCAL_KEY: Record<SyncTable, string> = {
  clientes: KEYS.clientes,
  proveedores: KEYS.proveedores,
  ingresos: KEYS.ingresos,
  egresos: KEYS.egresos,
  pedidos: KEYS.pedidos,
  productos: KEYS.productos,
  cotizaciones: KEYS.cotizaciones,
  egresos_recurrentes: KEYS.egresosRecurrentes,
  inventario: KEYS.inventario,
  disenos: KEYS.disenos,
  plantillas: KEYS.plantillas,
  config: KEYS.config,
  finance_entries: KEYS.financeEntries,
  recurrentes_log: KEYS.recurrentesLog,
};

export function localKeyForTable(table: SyncTable): string {
  return TABLE_TO_LOCAL_KEY[table];
}

function nowIso(): string {
  return new Date().toISOString();
}

function operationId(table: SyncTable, recordId: string, action: SyncAction): string {
  return `${table}:${recordId}:${action}:${crypto.randomUUID()}`;
}

function parseQueue(raw: string | null): SyncQueueEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SyncQueueEntry[]) : [];
  } catch {
    return [];
  }
}

export function readSyncQueue(): SyncQueueEntry[] {
  if (typeof window === 'undefined') return [];
  return parseQueue(localStorage.getItem(SYNC_QUEUE_KEY));
}

function writeSyncQueue(queue: SyncQueueEntry[]): void {
  if (typeof window === 'undefined') return;
  safeSetItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new Event('studio24:sync-queue'));
}

export function hasPendingSync(): boolean {
  return readSyncQueue().length > 0;
}

export function hasPendingForLocalKey(localKey: string): boolean {
  return readSyncQueue().some((op) => op.localKey === localKey);
}

export function getPendingRecordIds(localKey: string): { upserts: Set<string>; deletes: Set<string> } {
  const upserts = new Set<string>();
  const deletes = new Set<string>();
  readSyncQueue()
    .filter((op) => op.localKey === localKey)
    .forEach((op) => {
      if (op.action === 'delete') deletes.add(op.recordId);
      if (op.action === 'upsert' || op.action === 'recurrente_egreso') upserts.add(op.recordId);
    });
  return { upserts, deletes };
}

export function enqueueUpsert<T extends VersionedRecord>(table: SyncTable, item: T): void {
  const localKey = localKeyForTable(table);
  const timestamp = nowIso();
  const previous = readSyncQueue().find((op) => op.table === table && op.recordId === item.id);
  if (previous?.action === 'recurrente_egreso') {
    throw new Error('Espera a que el gasto recurrente termine de sincronizar antes de editarlo');
  }
  const entry: SyncQueueEntry = {
    id: operationId(table, item.id, 'upsert'),
    table,
    localKey,
    action: 'upsert',
    recordId: item.id,
    payload:
      previous?.action === 'upsert'
        ? { ...item, serverUpdatedAt: (previous.payload as VersionedRecord).serverUpdatedAt }
        : item,
    createdAt: timestamp,
    updatedAt: timestamp,
    attempts: 0,
  };
  const queue = readSyncQueue().filter((op) => !(op.table === table && op.recordId === item.id));
  queue.push(entry);
  writeSyncQueue(queue);
}

export function enqueueDelete(table: SyncTable, recordId: string): void {
  const localKey = localKeyForTable(table);
  const timestamp = nowIso();
  const entry: SyncQueueEntry = {
    id: operationId(table, recordId, 'delete'),
    table,
    localKey,
    action: 'delete',
    recordId,
    payload: readLocalArray<VersionedRecord>(localKey).find((item) => item.id === recordId),
    createdAt: timestamp,
    updatedAt: timestamp,
    attempts: 0,
  };
  const queue = readSyncQueue().filter((op) => !(op.table === table && op.recordId === recordId));
  queue.push(entry);
  writeSyncQueue(queue);
}

export function enqueueRecurrenteLog(logKey: string): void {
  const timestamp = nowIso();
  const entry: SyncQueueEntry = {
    id: operationId('recurrentes_log', logKey, 'recurrente_log'),
    table: 'recurrentes_log',
    localKey: KEYS.recurrentesLog,
    action: 'recurrente_log',
    recordId: logKey,
    payload: { key: logKey },
    createdAt: timestamp,
    updatedAt: timestamp,
    attempts: 0,
  };
  const queue = readSyncQueue().filter((op) => op.id !== entry.id);
  queue.push(entry);
  writeSyncQueue(queue);
}

export function enqueueRecurrenteEgreso(payload: unknown, egresoId: string): void {
  const timestamp = nowIso();
  const entry: SyncQueueEntry = {
    id: operationId('egresos', egresoId, 'recurrente_egreso'),
    table: 'egresos',
    localKey: KEYS.egresos,
    action: 'recurrente_egreso',
    recordId: egresoId,
    payload,
    createdAt: timestamp,
    updatedAt: timestamp,
    attempts: 0,
  };
  const queue = readSyncQueue().filter((op) => op.id !== entry.id);
  queue.push(entry);
  writeSyncQueue(queue);
}

export function removeSyncQueueEntry(id: string): void {
  writeSyncQueue(readSyncQueue().filter((op) => op.id !== id));
}

export function acknowledgeSync(entry: SyncQueueEntry, result?: VersionedRecord): void {
  const queue = readSyncQueue().filter((op) => op.id !== entry.id);
  if (result) {
    for (const op of queue) {
      if (op.table === entry.table && op.recordId === entry.recordId && op.payload) {
        op.payload = {
          ...(op.payload as Record<string, unknown>),
          serverUpdatedAt: result.serverUpdatedAt || result.updatedAt,
        };
      }
    }
    const items = readLocalArray<VersionedRecord>(entry.localKey);
    const pending = queue.some((op) => op.table === entry.table && op.recordId === entry.recordId);
    if (entry.table === 'config' && !pending) {
      writeLocalJSON(entry.localKey, result);
    } else if (entry.table !== 'config') {
      writeLocalJSON(
        entry.localKey,
        items.map((item) =>
          item.id !== entry.recordId
            ? item
            : pending
              ? { ...item, serverUpdatedAt: result.serverUpdatedAt || result.updatedAt }
              : result,
        ),
      );
    }
  }
  writeSyncQueue(queue);
}

export const TOMBSTONES_KEY = 'bordados_deleted_records';

export function rememberDeleted(localKey: string, ids: string[]): void {
  const tombstones = JSON.parse(localStorage.getItem(TOMBSTONES_KEY) || '{}') as Record<string, string[]>;
  tombstones[localKey] = [...new Set([...(tombstones[localKey] || []), ...ids])];
  writeLocalJSON(TOMBSTONES_KEY, tombstones);
}

export function markSyncQueueEntryFailed(id: string, error: unknown): void {
  const message =
    error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Error de sincronización';
  writeSyncQueue(
    readSyncQueue().map((op) =>
      op.id === id ? { ...op, attempts: op.attempts + 1, lastError: message, updatedAt: nowIso() } : op,
    ),
  );
}

function versionOf(record: VersionedRecord): number {
  const value = record.updatedAt || record.createdAt || '';
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mergeCloudList<T extends VersionedRecord>(localKey: string, localData: T[], cloudData: T[]): T[] {
  const { deletes, upserts } = getPendingRecordIds(localKey);
  const tombstones = JSON.parse(localStorage.getItem(TOMBSTONES_KEY) || '{}') as Record<string, string[]>;
  for (const id of tombstones[localKey] || []) deletes.add(id);
  const merged = new Map<string, T>();

  cloudData.forEach((item) => {
    if (!deletes.has(item.id)) merged.set(item.id, item);
  });

  localData.forEach((item) => {
    if (deletes.has(item.id)) return;
    const existing = merged.get(item.id);
    if (!existing || versionOf(item) > versionOf(existing) || upserts.has(item.id)) {
      merged.set(item.id, item);
    }
  });

  return Array.from(merged.values());
}

export function mergeCloudObject<T extends Record<string, unknown>>(localKey: string, localData: T, cloudData: T): T {
  if (hasPendingForLocalKey(localKey)) return localData;
  const localUpdated = Date.parse(String(localData.updatedAt || ''));
  const cloudUpdated = Date.parse(String(cloudData.updatedAt || ''));
  if (Number.isFinite(localUpdated) && Number.isFinite(cloudUpdated) && localUpdated > cloudUpdated) return localData;
  return { ...localData, ...cloudData };
}

export function writeLocalJSON(key: string, value: unknown): void {
  safeSetItem(key, JSON.stringify(value));
}

export function readLocalArray<T>(key: StoreStorageKey | string): T[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function pauseCloudPulls(ms = 120_000): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SYNC_PULL_PAUSED_UNTIL_KEY, String(Date.now() + ms));
}

export function shouldSkipCloudPull(): boolean {
  if (typeof window === 'undefined') return false;
  const until = parseInt(localStorage.getItem(SYNC_PULL_PAUSED_UNTIL_KEY) || '0', 10);
  return Number.isFinite(until) && until > Date.now();
}
