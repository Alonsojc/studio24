'use client';

import { useState, useEffect, useCallback, useRef, useId, type DependencyList } from 'react';
import { mergeCloudList, mergeCloudObject, writeLocalJSON } from './sync-queue';
import { ACTIVE_USER_KEY } from './store';
import { boundedRead, removeCloudRead, setCloudRead } from './cloud-read-status';
import { invalidateCloudCache } from './cloud-cache';

/** Only the current request and session can commit a cloud response. */
export function useCloudResource<T>(
  localReader: () => T,
  cloudFetcher: () => Promise<T>,
  localKey: string,
  deps: DependencyList = [],
  merge: (local: T, cloud: T) => T = (_local, cloud) => cloud,
  watchKeys: string[] = [],
) {
  const id = useId();
  const depsKey = deps.map(String).join('|');
  const [data, setData] = useState(localReader);
  const [state, setState] = useState({
    loading: true,
    syncing: false,
    error: '',
    hasSnapshot: false,
    updatedAt: null as string | null,
  });
  const latest = useRef({ localReader, cloudFetcher, merge, watchKeys });
  useEffect(() => {
    latest.current = { localReader, cloudFetcher, merge, watchKeys };
  });
  const revision = useRef(0);
  const reloadRef = useRef<() => void>(() => {});
  const load = useCallback(async () => {
    const request = ++revision.current;
    const owner = localStorage.getItem(ACTIVE_USER_KEY);
    const timeKey = `bordados_read_at:${owner}:${localKey}:${depsKey}`;
    const updatedAt = localStorage.getItem(timeKey);
    const hasSnapshot = localStorage.getItem(localKey) !== null && (!depsKey || Boolean(updatedAt));
    const pending = { loading: !hasSnapshot, syncing: true, error: '', hasSnapshot, updatedAt };
    setData(latest.current.localReader());
    setState(pending);
    setCloudRead(id, { ...pending, loading: true, retry: () => reloadRef.current() });
    try {
      const cloud = await boundedRead(latest.current.cloudFetcher);
      if (request !== revision.current || owner !== localStorage.getItem(ACTIVE_USER_KEY)) return;
      const value = latest.current.merge(latest.current.localReader(), cloud);
      writeLocalJSON(localKey, value);
      const confirmedAt = new Date().toISOString();
      localStorage.setItem(timeKey, confirmedAt);
      setData(value);
      const next = { loading: false, syncing: false, error: '', hasSnapshot: true, updatedAt: confirmedAt };
      setState(next);
      setCloudRead(id, { ...next, retry: () => reloadRef.current() });
    } catch (error) {
      if (request !== revision.current || owner !== localStorage.getItem(ACTIVE_USER_KEY)) return;
      const message = navigator.onLine === false ? 'Sin conexion' : 'No se pudieron confirmar los datos';
      const next = {
        loading: false,
        syncing: false,
        error: error instanceof Error && error.message.includes('tardo demasiado') ? error.message : message,
        hasSnapshot,
        updatedAt,
      };
      setState(next);
      setCloudRead(id, { ...next, retry: () => reloadRef.current() });
    }
  }, [id, localKey, depsKey]);
  const reload = useCallback(() => {
    invalidateCloudCache();
    void load();
  }, [load]);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);
  useEffect(() => {
    void load();
    const requests = revision;
    const update = (event: Event) => {
      const key = event instanceof StorageEvent ? event.key : (event as CustomEvent).detail;
      if (!key || key === localKey || latest.current.watchKeys.includes(key)) setData(latest.current.localReader());
    };
    window.addEventListener('studio24:local-change', update);
    window.addEventListener('storage', update);
    window.addEventListener('online', reload);
    return () => {
      ++requests.current;
      removeCloudRead(id);
      window.removeEventListener('studio24:local-change', update);
      window.removeEventListener('storage', update);
      window.removeEventListener('online', reload);
    };
  }, [id, localKey, load, reload]);
  return { data, ...state, reload };
}

export function useCloudStore<T extends { id: string; createdAt?: string; updatedAt?: string }>(
  localReader: () => T[],
  cloudFetcher: () => Promise<T[]>,
  localKey: string,
  deps: DependencyList = [],
) {
  return useCloudResource(
    localReader,
    cloudFetcher,
    localKey,
    deps,
    (local, cloud) => mergeCloudList(localKey, local as never[], cloud as never[]) as T[],
  );
}
export function useCloudStoreOne<T>(
  localReader: () => T,
  cloudFetcher: () => Promise<T>,
  localKey: string,
  deps: DependencyList = [],
) {
  return useCloudResource(
    localReader,
    cloudFetcher,
    localKey,
    deps,
    (local, cloud) =>
      mergeCloudObject(localKey, local as Record<string, unknown>, cloud as Record<string, unknown>) as T,
  );
}
