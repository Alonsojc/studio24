'use client';

/**
 * Tracks cloud sync status and failed operations.
 * Provides retry logic with exponential backoff and a
 * reactive listener so UI components can show sync state.
 */

type SyncState = 'idle' | 'syncing' | 'error';

interface FailedOp {
  id: number;
  fn: () => Promise<unknown>;
  error: string;
  retries: number;
  timestamp: number;
}

let state: SyncState = 'idle';
let pending = 0;
let failedOps: FailedOp[] = [];
let opCounter = 0;
const MAX_RETRIES = 3;
const listeners: Set<() => void> = new Set();

function notify() {
  listeners.forEach((fn) => fn());
}

export function onSyncChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSyncState(): { state: SyncState; pending: number; failures: number } {
  return { state, pending, failures: failedOps.length };
}

export function clearFailures(): void {
  failedOps = [];
  if (pending === 0) state = 'idle';
  notify();
}

async function retryOp(op: FailedOp): Promise<boolean> {
  try {
    await op.fn();
    return true;
  } catch {
    return false;
  }
}

export async function retryAllFailed(): Promise<void> {
  const ops = [...failedOps];
  failedOps = [];
  state = 'syncing';
  pending += ops.length;
  notify();

  for (const op of ops) {
    const ok = await retryOp(op);
    pending--;
    if (!ok) {
      failedOps.push({ ...op, retries: op.retries + 1, timestamp: Date.now() });
    }
    notify();
  }

  state = failedOps.length > 0 ? 'error' : pending > 0 ? 'syncing' : 'idle';
  notify();
}

/**
 * Execute a cloud sync operation with automatic retry.
 * Called by store-sync.ts instead of raw .catch().
 */
export function trackSync(cloudFn: () => Promise<unknown>): void {
  pending++;
  state = 'syncing';
  notify();

  const opId = ++opCounter;

  const attempt = (retries: number, delay: number) => {
    cloudFn()
      .then(() => {
        pending--;
        if (pending === 0 && failedOps.length === 0) state = 'idle';
        notify();
      })
      .catch((err) => {
        if (retries < MAX_RETRIES) {
          // Retry with exponential backoff
          setTimeout(() => attempt(retries + 1, delay * 2), delay);
        } else {
          // Give up — record as failed
          pending--;
          failedOps.push({
            id: opId,
            fn: cloudFn,
            error: err?.message || 'Error de sincronización',
            retries,
            timestamp: Date.now(),
          });
          state = 'error';
          notify();
        }
      });
  };

  attempt(0, 2000);
}
