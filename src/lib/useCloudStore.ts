'use client';

import { useState, useEffect, useCallback, useRef, type DependencyList } from 'react';
import { mergeCloudList, mergeCloudObject, writeLocalJSON } from './sync-queue';

function useLocalChanges<T>(key: string, reader: () => T, setter: (value: T) => void) {
  const readerRef = useRef(reader);
  useEffect(() => {
    readerRef.current = reader;
  });
  useEffect(() => {
    const update = (event: Event) => {
      const changedKey = event instanceof StorageEvent ? event.key : (event as CustomEvent).detail;
      if (!changedKey || changedKey === key) setter(readerRef.current());
    };
    window.addEventListener('studio24:local-change', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('studio24:local-change', update);
      window.removeEventListener('storage', update);
    };
  }, [key, setter]);
}

function hasLocalSnapshot(localKey: string): boolean {
  return typeof window !== 'undefined' && localStorage.getItem(localKey) !== null;
}

/**
 * Local-first data hook.
 * 1. Returns localStorage data immediately (fast, synchronous)
 * 2. Fetches from Supabase in background
 * 3. Merges cloud data into state + updates localStorage cache
 * 4. Falls back to localStorage if Supabase fails (offline)
 */
export function useCloudStore<T extends { id: string; createdAt?: string; updatedAt?: string }>(
  localReader: () => T[],
  cloudFetcher: () => Promise<T[]>,
  localKey: string,
  deps: DependencyList = [],
): { data: T[]; loading: boolean; syncing: boolean; reload: () => void } {
  const isClient = typeof window !== 'undefined';
  const [data, setData] = useState<T[]>(() => (isClient ? localReader() : []));
  const [loading, setLoading] = useState(() => isClient && !hasLocalSnapshot(localKey));
  const [syncing, setSyncing] = useState(false);
  useLocalChanges(localKey, localReader, setData);
  const mountedRef = useRef(false);
  const depsKey = deps.map(String).join('|');

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    (async () => {
      setSyncing(true);
      try {
        const cloudData = await cloudFetcher();
        if (!cancelled && mountedRef.current) {
          const localData = localReader();
          const merged = mergeCloudList(localKey, localData as never[], cloudData as never[]) as T[];
          setData(merged);
          writeLocalJSON(localKey, merged);
        }
      } catch {
        // Offline — keep localStorage data
      }
      if (!cancelled) {
        setLoading(false);
        setSyncing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // localReader/cloudFetcher are often inline page closures; deps controls
    // intentional refetches such as selected year/month.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localKey, depsKey]);

  const reload = useCallback(() => {
    setData(localReader());
    setSyncing(true);
    cloudFetcher()
      .then((cloudData) => {
        const merged = mergeCloudList(localKey, localReader() as never[], cloudData as never[]) as T[];
        setData(merged);
        writeLocalJSON(localKey, merged);
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setSyncing(false);
      });
  }, [localReader, cloudFetcher, localKey]);

  return { data, loading, syncing, reload };
}

/**
 * Same as useCloudStore but for single-object data (like config).
 */
export function useCloudStoreOne<T>(
  localReader: () => T,
  cloudFetcher: () => Promise<T>,
  localKey: string,
  deps: DependencyList = [],
): { data: T; loading: boolean; syncing: boolean; reload: () => void } {
  const [data, setData] = useState<T>(() => localReader());
  const [loading, setLoading] = useState(() => !hasLocalSnapshot(localKey));
  const [syncing, setSyncing] = useState(false);
  useLocalChanges(localKey, localReader, setData);
  const depsKey = deps.map(String).join('|');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSyncing(true);
      try {
        const cloudData = await cloudFetcher();
        if (!cancelled) {
          const merged = mergeCloudObject(
            localKey,
            localReader() as Record<string, unknown>,
            cloudData as Record<string, unknown>,
          ) as T;
          setData(merged);
          writeLocalJSON(localKey, merged);
        }
      } catch {
        // Offline — keep localStorage data
      }
      if (!cancelled) {
        setLoading(false);
        setSyncing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localKey, depsKey]);

  const reload = useCallback(() => {
    setData(localReader());
    setSyncing(true);
    cloudFetcher()
      .then((cloudData) => {
        const merged = mergeCloudObject(
          localKey,
          localReader() as Record<string, unknown>,
          cloudData as Record<string, unknown>,
        ) as T;
        setData(merged);
        writeLocalJSON(localKey, merged);
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setSyncing(false);
      });
  }, [localReader, cloudFetcher, localKey]);

  return { data, loading, syncing, reload };
}
