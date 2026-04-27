'use client';

import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import Modal from '@/components/Modal';
import { auditLogToCSV, getAuditLog, redactAuditPayload, summarizeAuditChange, type AuditLogEntry } from '@/lib/audit';
import { formatDate } from '@/lib/helpers';
import { downloadCSV } from '@/lib/csv';
import { inputClass, labelClass } from '@/lib/styles';

const actionColor: Record<AuditLogEntry['action'], string> = {
  INSERT: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
};

const auditTables = [
  'clientes',
  'pedidos',
  'ingresos',
  'egresos',
  'proveedores',
  'productos',
  'cotizaciones',
  'inventario',
  'disenos',
  'plantillas',
  'config',
  'egresos_recurrentes',
];

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
  const [tableFilter, setTableFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setEntries(
        await getAuditLog({
          limit: 150,
          tableName: tableFilter || undefined,
          actorId: actorFilter.trim() || undefined,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la auditoría');
    }
    setLoading(false);
  }, [actorFilter, tableFilter]);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  const exportCSV = () => {
    const { headers, rows } = auditLogToCSV(entries);
    downloadCSV('auditoria_studio24', headers, rows);
  };

  return (
    <div>
      <PageHeader
        title="Auditoría"
        description="Cambios recientes en datos sensibles"
        action={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={exportCSV}
              disabled={loading || entries.length === 0}
              className="px-4 py-2.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase border border-neutral-200 text-[#0a0a0a] hover:border-[#c72a09] transition-colors disabled:opacity-50"
            >
              Exportar CSV
            </button>
            <button
              onClick={reload}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase bg-[#0a0a0a] text-white hover:bg-[#222] transition-colors disabled:opacity-50"
            >
              {loading ? 'Cargando...' : 'Actualizar'}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr_auto] gap-3 mb-6">
        <div>
          <label className={labelClass}>Tabla</label>
          <select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} className={inputClass}>
            <option value="">Todas</option>
            {auditTables.map((table) => (
              <option key={table} value={table}>
                {table}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Usuario</label>
          <input
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            placeholder="UUID del usuario"
            className={inputClass}
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={reload}
            disabled={loading}
            className="h-[42px] px-4 rounded-xl text-xs font-bold tracking-[0.05em] uppercase border border-neutral-200 text-neutral-600 hover:text-[#0a0a0a] hover:border-neutral-300 disabled:opacity-50"
          >
            Filtrar
          </button>
        </div>
      </div>

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
                <th className="px-5 py-3"></th>
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
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => setSelectedEntry(entry)}
                      className="text-[10px] font-bold uppercase tracking-wide text-[#c72a09] hover:underline"
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!selectedEntry} onClose={() => setSelectedEntry(null)} title="Detalle de auditoría">
        {selectedEntry && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <p className={labelClass}>Fecha</p>
                <p className="font-semibold text-[#0a0a0a]">{formatDateTime(selectedEntry.createdAt)}</p>
              </div>
              <div>
                <p className={labelClass}>Acción</p>
                <p className="font-semibold text-[#0a0a0a]">{selectedEntry.action}</p>
              </div>
              <div>
                <p className={labelClass}>Tabla</p>
                <p className="font-semibold text-[#0a0a0a]">{selectedEntry.tableName}</p>
              </div>
              <div>
                <p className={labelClass}>Usuario</p>
                <p className="font-semibold text-[#0a0a0a] break-all">{selectedEntry.actorId || 'sistema'}</p>
              </div>
            </div>
            <div>
              <p className={labelClass}>Registro</p>
              <p className="text-xs text-neutral-600 break-all">{selectedEntry.recordId}</p>
            </div>
            <div>
              <p className={labelClass}>Cambio</p>
              <p className="text-xs text-neutral-600">{summarizeAuditChange(selectedEntry)}</p>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <p className={labelClass}>Antes</p>
                <pre className="max-h-52 overflow-auto rounded-xl bg-neutral-50 p-3 text-[11px] text-neutral-600">
                  {JSON.stringify(redactAuditPayload(selectedEntry.oldData), null, 2)}
                </pre>
              </div>
              <div>
                <p className={labelClass}>Después</p>
                <pre className="max-h-52 overflow-auto rounded-xl bg-neutral-50 p-3 text-[11px] text-neutral-600">
                  {JSON.stringify(redactAuditPayload(selectedEntry.newData), null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
