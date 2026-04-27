'use client';

import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { getAuditLog, summarizeAuditChange, type AuditLogEntry } from '@/lib/audit';
import { formatDate } from '@/lib/helpers';

const actionColor: Record<AuditLogEntry['action'], string> = {
  INSERT: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
};

function formatDateTime(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${formatDate(date.toISOString().slice(0, 10))} ${date.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export default function AuditoriaPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setEntries(await getAuditLog(150));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la auditoría');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  return (
    <div>
      <PageHeader
        title="Auditoría"
        description="Cambios recientes en datos sensibles"
        action={
          <button
            onClick={reload}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase bg-[#0a0a0a] text-white hover:bg-[#222] transition-colors disabled:opacity-50"
          >
            {loading ? 'Cargando...' : 'Actualizar'}
          </button>
        }
      />

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 text-xs p-4 mb-6">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[30vh]">
          <div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState title="Sin eventos" description="Todavía no hay cambios registrados en audit_log." />
      ) : (
        <div className="bg-white rounded-2xl border border-neutral-100 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-neutral-100">
                <th className="px-5 py-3 text-left text-[9px] font-bold tracking-[0.12em] text-neutral-400 uppercase">
                  Fecha
                </th>
                <th className="px-5 py-3 text-left text-[9px] font-bold tracking-[0.12em] text-neutral-400 uppercase">
                  Acción
                </th>
                <th className="px-5 py-3 text-left text-[9px] font-bold tracking-[0.12em] text-neutral-400 uppercase">
                  Tabla
                </th>
                <th className="px-5 py-3 text-left text-[9px] font-bold tracking-[0.12em] text-neutral-400 uppercase">
                  Registro
                </th>
                <th className="px-5 py-3 text-left text-[9px] font-bold tracking-[0.12em] text-neutral-400 uppercase">
                  Cambio
                </th>
                <th className="px-5 py-3 text-left text-[9px] font-bold tracking-[0.12em] text-neutral-400 uppercase">
                  Usuario
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-neutral-50 hover:bg-neutral-50/60">
                  <td className="px-5 py-4 text-xs text-neutral-500 whitespace-nowrap">
                    {formatDateTime(entry.createdAt)}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase ${actionColor[entry.action]}`}
                    >
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs font-bold text-[#0a0a0a]">{entry.tableName}</td>
                  <td className="px-5 py-4 text-xs text-neutral-500 max-w-[180px] truncate">{entry.recordId}</td>
                  <td className="px-5 py-4 text-xs text-neutral-600 max-w-[280px] truncate">
                    {summarizeAuditChange(entry)}
                  </td>
                  <td className="px-5 py-4 text-xs text-neutral-400 max-w-[200px] truncate">
                    {entry.actorId || 'sistema'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
