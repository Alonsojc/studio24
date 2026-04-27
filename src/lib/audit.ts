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

export interface AuditLogFilters {
  limit?: number;
  tableName?: string;
  actorId?: string;
}

const SENSITIVE_AUDIT_KEY_PATTERN =
  /(password|secret|token|key|authorization|cookie|clabe|cuenta|numero_cuenta|rfc|email|telefono|phone|xml|pdf|logo|foto|fotos|archivo)/i;

export function isSensitiveAuditKey(key: string): boolean {
  return SENSITIVE_AUDIT_KEY_PATTERN.test(key);
}

export function redactAuditPayload(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[Truncated]';
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => redactAuditPayload(item, depth + 1));

  const clean: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    clean[key] = isSensitiveAuditKey(key) ? '[Filtrado]' : redactAuditPayload(nested, depth + 1);
  }
  return clean;
}

export async function getAuditLog(filters: number | AuditLogFilters = 100): Promise<AuditLogEntry[]> {
  const { supabase } = await import('./supabase');
  const opts = typeof filters === 'number' ? { limit: filters } : filters;
  const limit = opts.limit ?? 100;
  const safeLimit = Math.min(Math.max(limit, 1), 250);
  let query = supabase
    .from('audit_log')
    .select('id, table_name, record_id, action, actor_id, old_data, new_data, created_at')
    .order('created_at', { ascending: false });

  if (opts.tableName) query = query.eq('table_name', opts.tableName);
  if (opts.actorId) query = query.eq('actor_id', opts.actorId);

  const { data, error } = await query.limit(safeLimit);
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

export function getAuditChangedFields(entry: Pick<AuditLogEntry, 'oldData' | 'newData'>): {
  visible: string[];
  sensitiveCount: number;
} {
  const oldData = entry.oldData || {};
  const newData = entry.newData || {};
  const changed = Object.keys(newData).filter((key) => JSON.stringify(oldData[key]) !== JSON.stringify(newData[key]));
  return {
    visible: changed.filter((key) => !isSensitiveAuditKey(key)),
    sensitiveCount: changed.filter(isSensitiveAuditKey).length,
  };
}

export function summarizeAuditChange(entry: Pick<AuditLogEntry, 'action' | 'oldData' | 'newData'>): string {
  if (entry.action === 'INSERT') return 'Registro creado';
  if (entry.action === 'DELETE') return 'Registro eliminado';
  const changed = getAuditChangedFields(entry);
  const parts = changed.visible.slice(0, 6);
  if (changed.sensitiveCount > 0)
    parts.push(
      `${changed.sensitiveCount} sensible${changed.sensitiveCount > 1 ? 's' : ''} filtrado${changed.sensitiveCount > 1 ? 's' : ''}`,
    );
  if (parts.length === 0) return 'Sin cambios visibles';
  const remaining = changed.visible.length - 6;
  return parts.join(', ') + (remaining > 0 ? ` +${remaining}` : '');
}

export function auditLogToCSV(entries: AuditLogEntry[]): { headers: string[]; rows: string[][] } {
  return {
    headers: ['Fecha', 'Acción', 'Tabla', 'Registro', 'Cambio', 'Usuario'],
    rows: entries.map((entry) => [
      entry.createdAt,
      entry.action,
      entry.tableName,
      entry.recordId,
      summarizeAuditChange(entry),
      entry.actorId || 'sistema',
    ]),
  };
}
