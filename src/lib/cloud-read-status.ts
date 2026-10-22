'use client';

export interface CloudReadStatus {
  loading: boolean;
  hasSnapshot: boolean;
  error: string;
  updatedAt: string | null;
  retry: () => void;
}
const readers = new Map<string, CloudReadStatus>();
const listeners = new Set<() => void>();
const empty: CloudReadStatus[] = [];
let snapshot = empty;
export const cloudReadsSnapshot = () => snapshot;
export const cloudReadsServerSnapshot = () => empty;
export function subscribeCloudReads(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function publish() {
  snapshot = [...readers.values()];
  listeners.forEach((listener) => listener());
}
export function setCloudRead(id: string, status: CloudReadStatus) {
  readers.set(id, status);
  publish();
}
export function removeCloudRead(id: string) {
  readers.delete(id);
  publish();
}
export async function boundedRead<T>(read: () => Promise<T>, timeoutMs = 20000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('La consulta tardo demasiado. Reintenta.')), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
