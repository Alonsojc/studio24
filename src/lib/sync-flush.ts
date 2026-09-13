'use client';

import {
  cloudAddRecurrenteLog,
  cloudCreateRecurrenteEgreso,
  cloudWriteRecord,
  cloudDeleteRecord,
  type CloudRecurrenteEgresoInput,
} from './store-cloud';
import { ACTIVE_USER_KEY, KEYS } from './store';
import {
  acknowledgeSync,
  markSyncQueueEntryFailed,
  readSyncQueue,
  readLocalArray,
  rememberDeleted,
  writeLocalJSON,
  type SyncQueueEntry,
  type VersionedRecord,
} from './sync-queue';

let inFlight: Promise<number> | null = null;

async function send(entry: SyncQueueEntry): Promise<VersionedRecord | undefined> {
  const owner = localStorage.getItem(ACTIVE_USER_KEY);
  if (entry.action === 'upsert') {
    if (!entry.payload) throw new Error('Cambio sin contenido');
    return cloudWriteRecord(entry.table, entry.payload as VersionedRecord, entry.id);
  }
  if (entry.action === 'delete') {
    await cloudDeleteRecord(
      entry.table,
      entry.recordId,
      (entry.payload as VersionedRecord | undefined)?.serverUpdatedAt,
    );
    if (owner === localStorage.getItem(ACTIVE_USER_KEY)) rememberDeleted(entry.localKey, [entry.recordId]);
  } else if (entry.action === 'recurrente_log') {
    await cloudAddRecurrenteLog(entry.recordId);
  } else if (entry.action === 'recurrente_egreso') {
    const result = await cloudCreateRecurrenteEgreso(entry.payload as CloudRecurrenteEgresoInput);
    if (owner !== localStorage.getItem(ACTIVE_USER_KEY)) return;
    const items = readLocalArray<VersionedRecord>(KEYS.egresos).filter(
      (row) => row.id !== entry.recordId && row.id !== result.egreso?.id,
    );
    // Reconcile with the canonical expense after retries or another device's insert.
    if (result.egreso && !readSyncQueue().some((op) => op.recordId === entry.recordId && op.action === 'delete'))
      items.push(result.egreso);
    if (result.created && !result.egreso) throw new Error('Falta el egreso confirmado por el servidor');
    writeLocalJSON(KEYS.egresos, items);
    return result.egreso;
  } else {
    throw new Error('Operacion de sincronizacion desconocida');
  }
}

async function drain(): Promise<number> {
  const owner = localStorage.getItem(ACTIVE_USER_KEY);
  const tried = new Set<string>();
  let synced = 0;
  let lastError: unknown;
  while (owner === localStorage.getItem(ACTIVE_USER_KEY)) {
    const entry = readSyncQueue().find((op) => !tried.has(op.id));
    if (!entry) break;
    tried.add(entry.id);
    try {
      const result = await send(entry);
      if (owner !== localStorage.getItem(ACTIVE_USER_KEY)) break;
      acknowledgeSync(entry, result);
      synced++;
    } catch (error) {
      if (owner !== localStorage.getItem(ACTIVE_USER_KEY)) break;
      markSyncQueueEntryFailed(entry.id, error);
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return synced;
}

export function flushPendingSync(): Promise<number> {
  if (inFlight) return inFlight;
  const run = () => drain();
  // Only one tab may drain the persistent queue at a time.
  const promise = Promise.resolve(
    typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request('studio24-sync', run) : run(),
  )
    .then((value) => value)
    .finally(() => {
      inFlight = null;
    });
  inFlight = promise;
  return promise;
}
