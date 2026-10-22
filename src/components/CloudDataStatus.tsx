'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { CloudCheck, CloudOff, RefreshCw } from 'lucide-react';
import { cloudReadsSnapshot, cloudReadsServerSnapshot, subscribeCloudReads } from '@/lib/cloud-read-status';
import { getSyncState, onSyncChange } from '@/lib/sync-status';

export default function CloudDataStatus({ children }: { children: React.ReactNode }) {
  const reads = useSyncExternalStore(subscribeCloudReads, cloudReadsSnapshot, cloudReadsServerSnapshot);
  const [sync, setSync] = useState(getSyncState);
  useEffect(() => onSyncChange(() => setSync(getSyncState())), []);
  const blocked = reads.some((read) => !read.hasSnapshot && (read.loading || read.error));
  const failed = reads.filter((read) => read.error);
  const loading = reads.some((read) => read.loading);
  const dates = reads
    .map((read) => read.updatedAt)
    .filter((value): value is string => Boolean(value))
    .sort();
  const retry = () => reads.forEach((read) => read.retry());
  return (
    <>
      {reads.length > 0 && (
        <div
          className={`mb-5 flex min-h-9 flex-wrap items-center gap-2 text-xs ${failed.length ? 'text-amber-800' : 'text-neutral-500'}`}
          role="status"
          aria-live="polite"
        >
          {failed.length ? <CloudOff size={15} /> : <CloudCheck size={15} />}
          <span>
            {sync.pending > 0
              ? `${sync.pending} cambios guardados en este dispositivo, pendientes de confirmar en nube.`
              : failed.length
                ? `${failed[0].error}${blocked ? '. Datos sin confirmar.' : '. Mostrando datos guardados.'}`
                : loading
                  ? 'Actualizando datos...'
                  : dates.length
                    ? `Confirmado en nube · ${new Date(dates[0]).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
                    : 'Datos guardados en este dispositivo'}
          </span>
          {failed.length > 0 && (
            <button
              type="button"
              onClick={retry}
              className="inline-flex min-h-9 items-center gap-1.5 font-semibold"
              title="Reintentar consulta"
              aria-label="Reintentar consulta"
            >
              <RefreshCw size={14} />
              Reintentar
            </button>
          )}
        </div>
      )}
      {blocked && (
        <div className="py-12 text-sm text-neutral-500" role="status">
          {failed.length ? 'No se pudo consultar esta informacion.' : 'Consultando informacion...'}
        </div>
      )}
      <div hidden={blocked}>{children}</div>
    </>
  );
}
