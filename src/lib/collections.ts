'use client';

import type { Pedido } from './types';
import { supabase } from './supabase';
import { ACTIVE_USER_KEY, KEYS, getPedidos } from './store';
import { fromCloudRecord } from './store-cloud';
import { mergeCloudList, readSyncQueue, writeLocalJSON } from './sync-queue';
import { flushPendingSync } from './sync-flush';
import { invalidateCloudCache } from './cloud-cache';
import { formatCurrency } from './helpers';

export interface CollectionRow extends Pedido {
  clienteNombre: string | null;
  clienteTelefono: string | null;
  lastPaymentDate: string | null;
  pending: number;
}
export interface CollectionPage {
  rows: CollectionRow[];
  total: number;
  totalPending: number;
  overduePending: number;
  overdueCount: number;
  followupCount: number;
}
export const emptyCollections: CollectionPage = {
  rows: [],
  total: 0,
  totalPending: 0,
  overduePending: 0,
  overdueCount: 0,
  followupCount: 0,
};
export type CollectionFilter = 'all' | 'overdue' | 'followup';
export async function fetchCollections(
  page: number,
  search: string,
  filter: CollectionFilter,
): Promise<CollectionPage> {
  const owner = localStorage.getItem(ACTIVE_USER_KEY);
  const { data, error } = await supabase.rpc('get_collections', { p_page: page, p_search: search, p_filter: filter });
  if (error) throw error;
  if (!data || !Array.isArray(data.rows) || typeof data.total !== 'number') throw new Error('Cobranza sin confirmar');
  if (owner !== localStorage.getItem(ACTIVE_USER_KEY)) throw new Error('La sesion cambio');
  return { ...data, rows: data.rows.map((row: Record<string, unknown>) => fromCloudRecord<CollectionRow>(row)) };
}
export function daysOverdue(due: string | null | undefined, today: string): number {
  if (!due || due >= today) return 0;
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86400000);
}
export function collectionAccountPath(row: Pick<CollectionRow, 'clienteId' | 'clienteNombre'>): string | null {
  if (!row.clienteId || !row.clienteNombre?.trim()) return null;
  return `/clientes/cuenta?cliente=${encodeURIComponent(row.clienteId)}`;
}
export function collectionWhatsApp(row: CollectionRow): string | null {
  const phone = (row.clienteTelefono || '').replace(/\D/g, '');
  if (phone.length < 10 || phone.length > 15) return null;
  const message = `Hola ${row.clienteNombre || ''}, te comparto el seguimiento de tu pedido ${row.descripcion}. El saldo pendiente es ${formatCurrency(row.pending)}. ¿Nos ayudas a confirmar tu fecha de pago? Gracias.`;
  return `https://wa.me/${phone.length === 10 ? `52${phone}` : phone}?text=${encodeURIComponent(message)}`;
}
export async function saveCollectionFollowup(
  row: CollectionRow,
  due: string,
  next: string,
  notes: string,
): Promise<void> {
  const owner = localStorage.getItem(ACTIVE_USER_KEY);
  await flushPendingSync();
  if (readSyncQueue().some((entry) => entry.table === 'pedidos' && entry.recordId === row.id))
    throw new Error('Confirma los cambios pendientes del pedido antes de guardar el seguimiento');
  if (owner !== localStorage.getItem(ACTIVE_USER_KEY)) throw new Error('La sesion cambio');
  const { data, error } = await supabase.rpc('save_collection_followup', {
    p_id: row.id,
    p_expected: (row as CollectionRow & { serverUpdatedAt?: string }).serverUpdatedAt || row.updatedAt,
    p_due: due || null,
    p_next: next || null,
    p_notes: notes,
  });
  if (error) throw new Error(error.message);
  if (owner !== localStorage.getItem(ACTIVE_USER_KEY)) throw new Error('La sesion cambio');
  const pedido = fromCloudRecord<Pedido>(data);
  writeLocalJSON(KEYS.pedidos, mergeCloudList(KEYS.pedidos, getPedidos(), [pedido]));
  invalidateCloudCache();
}
