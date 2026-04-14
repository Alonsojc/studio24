'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Hook genérico para cargar datos de Supabase.
 * Maneja loading, error, y reload.
 *
 * Uso:
 *   const { data: clientes, loading, reload } = useCloud(cloudGetClientes);
 */
export function useCloud<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos');
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
