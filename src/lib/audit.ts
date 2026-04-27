'use client';

export interface AuditLogEntry {
  id: number;
  tableName: string;
  recordId: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  actorId: string | null;
  createdAt: string;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
}

export async function getAuditLog(limit = 100): Promise<AuditLogEntry[]> {
  const { supabase } = await import('./supabase');
  const safeLimit = Math.min(Math.max(limit, 1), 250);
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, table_name, record_id, action, actor_id, old_data, new_data, created_at')
    .order('created_at', { ascending: false })
    .limit(safeLimit);
  if (error) throw error;
  return (data || []).map((row) => ({
    id: Number(row.id),
    tableName: String(row.table_name || ''),
    recordId: String(row.record_id || ''),
    action: row.action as AuditLogEntry['action'],
    actorId: (row.actor_id as string | null) || null,
    createdAt: String(row.created_at || ''),
    oldData: (row.old_data as Record<string, unknown> | null) || null,
    newData: (row.new_data as Record<string, unknown> | null) || null,
  }));
}

export function summarizeAuditChange(entry: Pick<AuditLogEntry, 'action' | 'oldData' | 'newData'>): string {
  if (entry.action === 'INSERT') return 'Registro creado';
  if (entry.action === 'DELETE') return 'Registro eliminado';
  const oldData = entry.oldData || {};
  const newData = entry.newData || {};
  const changed = Object.keys(newData).filter((key) => JSON.stringify(oldData[key]) !== JSON.stringify(newData[key]));
  if (changed.length === 0) return 'Sin cambios visibles';
  return changed.slice(0, 6).join(', ') + (changed.length > 6 ? ` +${changed.length - 6}` : '');
}
