'use client';

import { supabase } from './supabase';
import { ACTIVE_USER_KEY, getPedidos, KEYS } from './store';
import { fromCloudRecord } from './store-cloud';
import { mergeCloudList, readSyncQueue, writeLocalJSON } from './sync-queue';
import { useCloudResource } from './useCloudStore';
import type { EstadoPedido, EstadoPago, Pedido } from './types';

export const ORDER_PAGE_SIZE = 50;
export type OrderScope = 'active' | 'all';
export interface OrderPage {
  rows: Pedido[];
  total: number;
  summary: {
    activeCount: number;
    activeTotal: number;
    statuses: Partial<Record<EstadoPedido, number>>;
    payments: Partial<Record<EstadoPago, { count: number; total: number; paid: number }>>;
  };
}
const emptySummary: OrderPage['summary'] = { activeCount: 0, activeTotal: 0, statuses: {}, payments: {} };
const matches = (row: Pedido, scope: OrderScope) => scope === 'all' || !['entregado', 'cancelado'].includes(row.estado);
const sort = (a: Pedido, b: Pedido) =>
  Number(b.urgente) - Number(a.urgente) || b.fechaPedido.localeCompare(a.fechaPedido) || b.id.localeCompare(a.id);

function localPage(key: string, scope: OrderScope, page: number): OrderPage {
  const local = getPedidos();
  let cached: OrderPage | null = null;
  try {
    cached = typeof window === 'undefined' ? null : JSON.parse(localStorage.getItem(key) || 'null');
  } catch {}
  if (!cached?.rows)
    return {
      rows: local
        .filter((row) => matches(row, scope))
        .sort(sort)
        .slice(page * ORDER_PAGE_SIZE, (page + 1) * ORDER_PAGE_SIZE),
      total: 0,
      summary: emptySummary,
    };
  return resolveLocal(cached, scope, page);
}
function resolveLocal(data: OrderPage, scope: OrderScope, page: number): OrderPage {
  const local = new Map(mergeCloudList(KEYS.pedidos, getPedidos(), data.rows).map((row) => [row.id, row]));
  const rows = new Map(
    data.rows.flatMap((row) => {
      const current = local.get(row.id);
      return current && matches(current, scope) ? [[row.id, current] as const] : [];
    }),
  );
  const removed = data.rows.length - rows.size;
  let additions = 0;
  if (page === 0)
    for (const op of readSyncQueue()) {
      if (
        op.table === 'pedidos' &&
        op.action === 'upsert' &&
        !(op.payload as { serverUpdatedAt?: string } | undefined)?.serverUpdatedAt
      ) {
        const row = local.get(op.recordId);
        if (row && matches(row, scope) && !rows.has(row.id)) {
          rows.set(row.id, row);
          additions++;
        }
      }
    }
  return {
    ...data,
    total: Math.max(0, data.total + additions - removed),
    rows: [...rows.values()].filter((row) => matches(row, scope)).sort(sort),
  };
}
export async function fetchOrderPage(scope: OrderScope, page: number): Promise<OrderPage> {
  const owner = localStorage.getItem(ACTIVE_USER_KEY);
  const rows: Pedido[] = [];
  const start = page * ORDER_PAGE_SIZE;
  let total = 0;
  while (rows.length < ORDER_PAGE_SIZE) {
    let query = supabase
      .from('pedidos')
      .select('*', { count: 'exact' })
      .order('urgente', { ascending: false })
      .order('fecha_pedido', { ascending: false })
      .order('id', { ascending: false })
      .range(start + rows.length, start + ORDER_PAGE_SIZE - 1);
    if (scope === 'active') query = query.not('estado', 'in', '(entregado,cancelado)');
    const result = await query;
    if (result.error) throw result.error;
    if (typeof result.count !== 'number') throw new Error('Total de pedidos sin confirmar');
    total = result.count;
    if (!result.data?.length) break;
    rows.push(...result.data.map((row) => fromCloudRecord<Pedido>(row)));
    if (start + rows.length >= total) break;
  }
  const { data, error } = await supabase.rpc('get_order_summary', { p_scope: scope });
  if (error) throw error;
  if (!data || typeof data.activeCount !== 'number') throw new Error('Resumen de pedidos sin confirmar');
  if (owner !== localStorage.getItem(ACTIVE_USER_KEY)) throw new Error('La sesion cambio');
  writeLocalJSON(KEYS.pedidos, mergeCloudList(KEYS.pedidos, getPedidos(), rows));
  return { rows, total, summary: data };
}
export function usePedidoPage(scope: OrderScope, page: number) {
  const key = `bordados_order_page:${scope}:${page}`;
  return useCloudResource(
    () => localPage(key, scope, page),
    () => fetchOrderPage(scope, page),
    key,
    [scope, page],
    (_local, cloud) => resolveLocal(cloud, scope, page),
    [KEYS.pedidos],
  );
}
