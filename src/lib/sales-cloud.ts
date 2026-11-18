'use client';

import { invalidateCloudCache } from './cloud-cache';
import { reportError } from './sentry';
import { ACTIVE_TEAM_KEY, ACTIVE_USER_KEY, KEYS } from './store';
import { fromCloudRecord } from './store-cloud';
import { supabase } from './supabase';
import { flushPendingSync } from './sync-flush';
import { mergeCloudList, readLocalArray, readSyncQueue, writeLocalJSON, type VersionedRecord } from './sync-queue';
import type { Cotizacion, FormaPago, Ingreso, Pedido } from './types';

type Row = Record<string, unknown>;
type RecordRef = { table: 'cotizaciones' | 'ingresos' | 'pedidos'; id: string };

function confirmedVersion(record: VersionedRecord): string {
  if (!record.serverUpdatedAt || record.updatedAt !== record.serverUpdatedAt)
    throw new Error('Actualiza el registro sincronizado antes de continuar.');
  return record.serverUpdatedAt;
}

async function salesRpc<T>(name: string, refs: RecordRef[], params: () => Row, accept: (data: T) => void): Promise<T> {
  const owner = localStorage.getItem(ACTIVE_USER_KEY);
  const team = localStorage.getItem(ACTIVE_TEAM_KEY);
  const sameSession = () =>
    owner === localStorage.getItem(ACTIVE_USER_KEY) && team === localStorage.getItem(ACTIVE_TEAM_KEY);
  if (!owner || !team || navigator.onLine === false) throw new Error('Se necesita conexión con Studio 24.');
  const pending = () =>
    readSyncQueue().some((op) => refs.some((ref) => ref.table === op.table && ref.id === op.recordId));
  if (pending()) await flushPendingSync().catch(() => {});
  if (!sameSession()) throw new Error('La sesión cambió.');
  if (pending()) throw new Error('Resuelve primero los cambios pendientes de este registro.');
  const { data, error } = await supabase.rpc(name, params()).abortSignal(AbortSignal.timeout(15000));
  if (!sameSession()) throw new Error('La sesión cambió.');
  if (error)
    throw new Error(
      error.code === 'PGRST202'
        ? 'Esta acción requiere actualizar la base de datos.'
        : error.code && error.message
          ? error.message
          : 'No se pudo confirmar. Reintenta la misma acción para consultar el resultado.',
    );
  if (!data) throw new Error('No se recibió confirmación de la nube. Reintenta la misma acción.');
  invalidateCloudCache();
  try {
    accept(data as T);
  } catch (error) {
    reportError(error, { kind: 'salesOperationCache' });
  }
  return data as T;
}

function cacheSalesRows(key: string, rows: Row[]) {
  writeLocalJSON(
    key,
    mergeCloudList(key, readLocalArray<VersionedRecord>(key), rows.map(fromCloudRecord<VersionedRecord>)),
  );
}

export async function convertQuote(quote: Cotizacion, clientId: string) {
  const result = await salesRpc<{ quote: Row; order: Row; created: boolean }>(
    'convert_quote_to_order',
    [{ table: 'cotizaciones', id: quote.id }],
    () => ({ p_quote: quote.id, p_client: clientId, p_expected: confirmedVersion(quote) }),
    (data) => {
      cacheSalesRows(KEYS.cotizaciones, [data.quote]);
      cacheSalesRows(KEYS.pedidos, [data.order]);
    },
  );
  return { order: fromCloudRecord<Pedido>(result.order), created: result.created };
}

export async function registerOrderIncome(order: Pedido, ivaIncluded: boolean, date: string, method: FormaPago | '') {
  return salesRpc<{ rows: Row[]; created: boolean }>(
    'register_order_income',
    [{ table: 'pedidos', id: order.id }],
    () => ({
      p_order: order.id,
      p_expected: confirmedVersion(order),
      p_iva: ivaIncluded,
      p_legacy_date: date || null,
      p_legacy_method: method || null,
    }),
    (data) => cacheSalesRows(KEYS.ingresos, data.rows),
  );
}

export async function linkOrderIncome(income: Ingreso, order: Pedido | null, alreadyCounted: boolean) {
  const refs: RecordRef[] = [{ table: 'ingresos', id: income.id }];
  const orderId = order?.id || income.pedidoId;
  if (orderId) refs.push({ table: 'pedidos', id: orderId });
  return salesRpc<{ income: Row; order: Row | null }>(
    'link_order_income',
    refs,
    () => ({
      p_income: income.id,
      p_order: order?.id || null,
      p_counted: alreadyCounted,
      p_expected: confirmedVersion(income),
      p_order_version: order ? confirmedVersion(order) : null,
    }),
    (data) => {
      cacheSalesRows(KEYS.ingresos, [data.income]);
      if (data.order) cacheSalesRows(KEYS.pedidos, [data.order]);
    },
  );
}

export function orderPath(orderId: string) {
  return `/pedidos?pedido=${encodeURIComponent(orderId)}`;
}
