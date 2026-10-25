'use client';

import { ACTIVE_USER_KEY, ACTIVE_TEAM_KEY, KEYS, getClientes } from './store';
import { supabase } from './supabase';
import { fromCloudRecord } from './store-cloud';
import { mergeCloudList, writeLocalJSON } from './sync-queue';
import { useCloudResource } from './useCloudStore';
import type { Cliente } from './types';
import type { CustomerStats, CustomerSort, CustomerOrderFilter } from './customer-list';

export interface DirectoryOptions {
  page: number;
  search: string;
  sort: CustomerSort;
  orders: CustomerOrderFilter;
  onlyDebtors: boolean;
}
export interface CustomerDirectory {
  rows: { cliente: Cliente; stats: CustomerStats }[];
  total: number;
  registered: number;
}
const empty: CustomerDirectory = { rows: [], total: 0, registered: 0 };

export async function fetchCustomerDirectory(options: DirectoryOptions): Promise<CustomerDirectory> {
  const owner = localStorage.getItem(ACTIVE_USER_KEY);
  const team = localStorage.getItem(ACTIVE_TEAM_KEY);
  const { data, error } = await supabase
    .rpc('get_customer_directory', {
      p_page: options.page,
      p_search: options.search,
      p_sort: options.sort,
      p_orders: options.orders,
      p_debtors: options.onlyDebtors,
    })
    .abortSignal(AbortSignal.timeout(15000));
  if (error) throw error;
  if (!data || !Array.isArray(data.rows) || typeof data.total !== 'number' || typeof data.registered !== 'number')
    throw new Error('Directorio sin confirmar');
  if (owner !== localStorage.getItem(ACTIVE_USER_KEY) || team !== localStorage.getItem(ACTIVE_TEAM_KEY))
    throw new Error('La sesion cambio');
  const rows = data.rows.map((raw: Record<string, unknown>) => {
    const { incomeCents, incomeCount, pendingCents, orderCount, activeOrderCount, ...cliente } = fromCloudRecord<
      Cliente & CustomerStats
    >(raw);
    const stats = { incomeCents, incomeCount, pendingCents, orderCount, activeOrderCount };
    if (Object.values(stats).some((n) => typeof n !== 'number' || !Number.isFinite(n)))
      throw new Error('Resumen incompleto');
    return { cliente, stats };
  });
  const merged = mergeCloudList(
    KEYS.clientes,
    getClientes(),
    rows.map((row: { cliente: Cliente }) => row.cliente),
  );
  writeLocalJSON(KEYS.clientes, merged);
  const current = new Map(merged.map((row) => [row.id, row]));
  return {
    rows: rows.map((row: CustomerDirectory['rows'][number]) => ({
      ...row,
      cliente: current.get(row.cliente.id) || row.cliente,
    })),
    total: data.total,
    registered: data.registered,
  };
}

export function useCustomerDirectory(options: DirectoryOptions) {
  const key = `bordados_customer_directory:${JSON.stringify(options)}`;
  const local = () => {
    try {
      const saved = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem(key) || 'null') : null;
      if (!saved?.rows) return empty;
      const current = new Map(getClientes().map((row) => [row.id, row]));
      return {
        ...saved,
        rows: saved.rows.map((row: CustomerDirectory['rows'][number]) => ({
          ...row,
          cliente: current.get(row.cliente.id) || row.cliente,
        })),
      } as CustomerDirectory;
    } catch {
      return empty;
    }
  };
  return useCloudResource(
    local,
    () => fetchCustomerDirectory(options),
    key,
    [],
    (_local, cloud) => cloud,
    [KEYS.clientes],
  );
}
