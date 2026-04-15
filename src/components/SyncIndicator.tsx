'use client';

import { useState, useEffect } from 'react';
import { getSyncState, onSyncChange, retryAllFailed, clearFailures } from '@/lib/sync-status';

export default function SyncIndicator() {
  const [sync, setSync] = useState(getSyncState);

  useEffect(() => {
    return onSyncChange(() => setSync(getSyncState()));
  }, []);

  // Nothing to show when idle
  if (sync.state === 'idle') return null;

  if (sync.state === 'syncing') {
    return (
      <div className="flex items-center gap-2 px-4 py-2 mx-3 rounded-lg bg-blue-500/10 mb-2">
        <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
        <span className="text-[10px] text-blue-300 font-medium">
          Sincronizando{sync.pending > 1 ? ` (${sync.pending})` : ''}...
        </span>
      </div>
    );
  }

  // Error state
  return (
    <div className="mx-3 mb-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
        <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wide">
          {sync.failures} sin sincronizar
        </span>
      </div>
      <p className="text-[10px] text-amber-400/70 mb-2">
        Los datos están guardados localmente. La nube se actualizará al reconectar.
      </p>
      <div className="flex gap-2">
        <button
          onClick={retryAllFailed}
          className="text-[9px] font-bold text-amber-300 uppercase tracking-wide hover:text-amber-200 transition-colors"
        >
          Reintentar
        </button>
        <button
          onClick={clearFailures}
          className="text-[9px] font-bold text-amber-500/60 uppercase tracking-wide hover:text-amber-400 transition-colors"
        >
          Ignorar
        </button>
      </div>
    </div>
  );
}
