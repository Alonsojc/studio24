'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { readSyncQueue, type SyncQueueEntry, type VersionedRecord } from '@/lib/sync-queue';
import { readConflictRemote, resolveConflict } from '@/lib/sync-conflicts';
import { retryAllFailed } from '@/lib/sync-status';

export default function SyncConflicts() {
  const [selected, setSelected] = useState<{ entry: SyncQueueEntry; remote: VersionedRecord | null } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!selected) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setSelected(null);
    };
    window.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', close);
    };
  }, [selected, busy]);
  const entries = readSyncQueue().filter((entry) => entry.lastError?.includes('CONFLICT'));
  const choose = async (choice: 'cloud' | 'local') => {
    if (
      !selected ||
      !confirm(
        choice === 'cloud'
          ? 'Usar la version de la nube y descartar este cambio local?'
          : 'Aplicar el cambio local sobre la version revisada?',
      )
    )
      return;
    setBusy(true);
    try {
      await resolveConflict(selected.entry.id, choice, selected.remote);
      setSelected(null);
      await retryAllFailed();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo resolver');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {entries.map((entry) => (
        <button
          key={entry.id}
          className="block text-xs text-amber-300 mt-2"
          onClick={async () => {
            try {
              setSelected({ entry, remote: await readConflictRemote(entry) });
            } catch {
              alert('No se pudo consultar la nube');
            }
          }}
        >
          Revisar {entry.table}: {entry.recordId.slice(0, 8)}
        </button>
      ))}
      {selected &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Conflicto de sincronizacion"
          >
            <div className="bg-white text-neutral-900 rounded-lg p-5 w-full max-w-3xl max-h-[85vh] overflow-auto">
              <h2 className="font-bold">Revisar versiones</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                <section>
                  <h3 className="text-sm font-semibold">Cambio local</h3>
                  <pre className="text-xs whitespace-pre-wrap break-all">
                    {JSON.stringify(selected.entry.payload, null, 2)}
                  </pre>
                </section>
                <section>
                  <h3 className="text-sm font-semibold">Nube</h3>
                  <pre className="text-xs whitespace-pre-wrap break-all">
                    {selected.remote ? JSON.stringify(selected.remote, null, 2) : 'Registro eliminado'}
                  </pre>
                </section>
              </div>
              <div className="flex flex-wrap gap-4 mt-5 text-sm font-semibold">
                <button disabled={busy} onClick={() => void choose('cloud')}>
                  Usar nube
                </button>
                <button disabled={busy || !selected.remote} onClick={() => void choose('local')}>
                  Usar cambio local
                </button>
                <button disabled={busy} onClick={() => setSelected(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
