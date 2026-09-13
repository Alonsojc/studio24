'use client';
import { supabase } from './supabase';
import { ACTIVE_USER_KEY } from './store';
import { getMyTeamId } from './teams';
import { invalidateCloudCache } from './cloud-cache';
import {
  readSyncQueue,
  removeSyncQueueEntry,
  enqueueUpsert,
  enqueueDelete,
  writeLocalJSON,
  readLocalArray,
  rememberDeleted,
  type VersionedRecord,
  type SyncQueueEntry,
} from './sync-queue';

export async function readConflictRemote(entry: SyncQueueEntry): Promise<VersionedRecord | null> {
  const team = await getMyTeamId();
  if (!team) throw new Error('Equipo no disponible');
  const { data, error } = await supabase
    .from(entry.table)
    .select('*')
    .eq('team_id', team)
    .eq(entry.table === 'config' ? 'team_id' : 'id', entry.table === 'config' ? team : entry.recordId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const result: Record<string, unknown> = { serverUpdatedAt: data.updated_at };
  for (const [key, value] of Object.entries(data)) {
    if (['user_id', 'team_id', 'sync_operation'].includes(key)) continue;
    const camel =
      key === 'uuid_cfdi'
        ? 'uuidCFDI'
        : key === 'con_iva'
          ? 'conIVA'
          : key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camel] = value;
  }
  return { ...result, id: entry.recordId } as VersionedRecord;
}

export async function resolveConflict(
  id: string,
  choice: 'cloud' | 'local',
  reviewedRemote: VersionedRecord | null,
): Promise<void> {
  const owner = localStorage.getItem(ACTIVE_USER_KEY);
  const entry = readSyncQueue().find((op) => op.id === id);
  if (!entry) throw new Error('El cambio ya no esta pendiente');
  const remote = await readConflictRemote(entry);
  if (owner !== localStorage.getItem(ACTIVE_USER_KEY)) throw new Error('La sesion cambio');
  if (remote?.serverUpdatedAt !== reviewedRemote?.serverUpdatedAt)
    throw new Error('La nube cambio otra vez. Revisa la nueva version.');
  if (choice === 'local' && !remote)
    throw new Error('El registro fue eliminado. Conserva la copia local en un respaldo antes de descartarla.');
  // Keep a per-operation recovery copy before resolving an explicit user choice.
  if (!readSyncQueue().some((op) => op.id === entry.id))
    throw new Error('Hay un cambio local mas reciente. Vuelve a revisarlo.');
  localStorage.setItem(`bordados_conflict_backup_${id}`, JSON.stringify(entry));
  if (choice === 'cloud') {
    removeSyncQueueEntry(entry.id);
    if (entry.table === 'config') writeLocalJSON(entry.localKey, remote || {});
    else {
      const items = readLocalArray<VersionedRecord>(entry.localKey).filter((item) => item.id !== entry.recordId);
      if (remote) items.push(remote);
      else rememberDeleted(entry.localKey, [entry.recordId]);
      writeLocalJSON(entry.localKey, items);
    }
  } else {
    removeSyncQueueEntry(entry.id);
    const item = { ...(entry.payload as VersionedRecord), serverUpdatedAt: remote!.serverUpdatedAt };
    if (entry.action === 'delete') {
      writeLocalJSON(entry.localKey, [
        ...readLocalArray<VersionedRecord>(entry.localKey).filter((row) => row.id !== item.id),
        item,
      ]);
      enqueueDelete(entry.table, entry.recordId);
      writeLocalJSON(
        entry.localKey,
        readLocalArray<VersionedRecord>(entry.localKey).filter((row) => row.id !== item.id),
      );
    } else enqueueUpsert(entry.table, item);
  }
  invalidateCloudCache();
}
