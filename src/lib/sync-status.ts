'use client';
import { reportError } from './sentry';
import { readSyncQueue } from './sync-queue';

let active = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function onSyncChange(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('studio24:sync-queue', listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('studio24:sync-queue', listener);
    window.removeEventListener('storage', listener);
  };
}
export function getSyncState(): {
  state: 'idle' | 'syncing' | 'error';
  pending: number;
  failures: number;
  message: string;
} {
  const queue = readSyncQueue();
  return {
    state: active ? 'syncing' : queue.length ? 'error' : 'idle',
    pending: queue.length,
    failures: queue.length,
    message: queue.find((entry) => entry.lastError)?.lastError || '',
  };
}
export async function retryAllFailed(): Promise<void> {
  active++;
  notify();
  try {
    await (await import('./sync-flush')).flushPendingSync();
  } catch (error) {
    reportError(error, { kind: 'cloudSyncFailed' });
  } finally {
    active--;
    notify();
  }
}
export function trackSync(cloudFn: () => Promise<unknown>): void {
  active++;
  notify();
  void cloudFn()
    .catch((error) => reportError(error, { kind: 'cloudSyncFailed' }))
    .finally(() => {
      active--;
      notify();
    });
}
