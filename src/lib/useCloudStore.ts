'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Cloud-first data hook.
 * 1. Returns localStorage data immediately (fast, synchronous)
 * 2. Fetches from Supabase in background
 * 3. Merges cloud data into state + updates localStorage cache
 * 4. Falls back to localStorage if Supabase fails (offline)
 */
export function useCloudStore<T>(
  localReader: () => T[],
  cloudFetcher: () => Promise<T[]>,
  localKey: string,
): { data: T[]; loading: boolean; reload: () => void } {
  const isClient = typeof window !== 'undefined';
  const [data, setData] = useState<T[]>(() => (isClient ? localReader() : []));
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const cloudData = await cloudFetcher();
        if (!cancelled && mountedRef.current) {
          setData(cloudData);
          localStorage.setItem(localKey, JSON.stringify(cloudData));
        }
      } catch {
        // Offline — keep localStorage data
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = useCallback(() => {
    setData(localReader());
    setLoading(true);
    cloudFetcher()
      .then((cloudData) => {
        setData(cloudData);
        localStorage.setItem(localKey, JSON.stringify(cloudData));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [localReader, cloudFetcher, localKey]);

  return { data, loading, reload };
}

/**
 * Same as useCloudStore but for single-object data (like config).
 */
export function useCloudStoreOne<T>(
  localReader: () => T,
  cloudFetcher: () => Promise<T>,
  localKey: string,
): { data: T; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T>(() => localReader());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cloudData = await cloudFetcher();
        if (!cancelled) {
          setData(cloudData);
          localStorage.setItem(localKey, JSON.stringify(cloudData));
        }
      } catch {
        // Offline — keep localStorage data
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = useCallback(() => {
    setData(localReader());
    cloudFetcher()
      .then((cloudData) => {
        setData(cloudData);
        localStorage.setItem(localKey, JSON.stringify(cloudData));
      })
      .catch(() => {});
  }, [localReader, cloudFetcher, localKey]);

  return { data, loading, reload };
}
