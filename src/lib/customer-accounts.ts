'use client';

import type { Cliente, FormaPago, Ingreso, Pedido } from './types';
import type { VersionedRecord } from './sync-queue';
import { mergeCloudList, readSyncQueue, writeLocalJSON } from './sync-queue';
import { ACTIVE_USER_KEY, CUSTOMER_COMMAND_PREFIX, KEYS, getItems, safeSetItem, storageKeys } from './store';
import { fromCloudRecord } from './store-cloud';
import { removeFromIDB } from './db';
import { supabase } from './supabase';
import { invalidateCloudCache } from './cloud-cache';
import { flushPendingSync } from './sync-flush';
import { calculatePedidoPaidAmount } from './business-rules';
import { reportError } from './sentry';
import { uploadCustomerReceipt } from './customer-receipts';

export interface CustomerAdvance extends VersionedRecord {
  folio?: number;
  clienteId: string;
  ingresoId: string;
  source: 'new' | 'existing';
  fecha: string;
  amount: number;
  formaPago: FormaPago;
  referencia: string;
  notas: string;
  voidedAt: string | null;
  receiptPath?: string;
}
export type CustomerMovementKind = 'deposit' | 'apply' | 'reverse_application' | 'cancel';
export interface CustomerMovement extends VersionedRecord {
  sequence: number;
  clienteId: string;
  advanceId: string;
  pedidoId: string | null;
  pedidoDescripcion: string;
  kind: CustomerMovementKind;
  fecha: string;
  amount: number;
  referencia: string;
  notas: string;
  reversesId: string | null;
  operationId: string;
}
export interface CustomerAccount {
  cliente?: Cliente;
  advances: CustomerAdvance[];
  movements: CustomerMovement[];
  pedidos: Pedido[];
  ingresos: Ingreso[];
}
export interface CustomerCommand {
  id: string;
  owner: string;
  action: 'receive' | 'apply' | 'reverse_application' | 'cancel';
  data: {
    clienteId: string;
    fecha: string;
    source?: 'new' | 'existing';
    ingresoId?: string;
    amount?: number;
    formaPago?: FormaPago;
    advanceId?: string;
    pedidoId?: string;
    movementId?: string;
    referencia?: string;
    notas?: string;
    receiptPath?: string;
  };
}
export const movementLabel: Record<CustomerMovementKind, string> = {
  deposit: 'Adelanto recibido',
  apply: 'Aplicacion a pedido',
  reverse_application: 'Aplicacion revertida',
  cancel: 'Adelanto anulado',
};
export const toCents = (amount: number) => Math.round(amount * 100);
export function customerAccountToday(now = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export const movementCredit = (movement: CustomerMovement) =>
  ['deposit', 'reverse_application'].includes(movement.kind);
export const movementDelta = (movement: CustomerMovement) =>
  toCents(movement.amount) * (movementCredit(movement) ? 1 : -1);
export const accountBalance = (movements: CustomerMovement[]) =>
  movements.reduce((sum, movement) => sum + movementDelta(movement), 0) / 100;
export const advanceBalance = (advanceId: string, movements: CustomerMovement[]) =>
  accountBalance(movements.filter((movement) => movement.advanceId === advanceId));
export const pendingOrderAmount = (pedido: Pedido) =>
  pedido.estado === 'cancelado'
    ? 0
    : Math.max(0, toCents(pedido.montoTotal) - toCents(calculatePedidoPaidAmount(pedido))) / 100;
export function availableIncomes(account: CustomerAccount): Ingreso[] {
  const used = new Set(account.advances.filter((advance) => !advance.voidedAt).map((advance) => advance.ingresoId));
  return account.ingresos.filter((income) => !income.pedidoId && income.montoTotal > 0 && !used.has(income.id));
}

export function buildCustomerStatement(account: CustomerAccount, from = '', to = '') {
  if (from && to && from > to) throw new Error('La fecha inicial debe ser anterior a la final');
  const movements = [...account.movements].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.sequence - b.sequence);
  const openingCents = movements
    .filter((movement) => from && movement.fecha < from)
    .reduce((sum, movement) => sum + movementDelta(movement), 0);
  let balanceCents = openingCents;
  const rows = movements
    .filter((movement) => (!from || movement.fecha >= from) && (!to || movement.fecha <= to))
    .map((movement) => {
      balanceCents += movementDelta(movement);
      return {
        ...movement,
        credit: movementCredit(movement) ? movement.amount : 0,
        debit: movementCredit(movement) ? 0 : movement.amount,
        balance: balanceCents / 100,
      };
    });
  return {
    from,
    to,
    opening: openingCents / 100,
    closing: balanceCents / 100,
    rows,
    outstanding: account.pedidos.reduce((sum, pedido) => sum + toCents(pendingOrderAmount(pedido)), 0) / 100,
  };
}
export type CustomerStatement = ReturnType<typeof buildCustomerStatement>;

export function cachedCustomerAccount(clienteId: string): CustomerAccount {
  return {
    cliente: getItems<Cliente>(KEYS.clientes).find((row) => row.id === clienteId),
    advances: getItems<CustomerAdvance>(KEYS.customerAdvances).filter((row) => row.clienteId === clienteId),
    movements: getItems<CustomerMovement>(KEYS.customerMovements).filter((row) => row.clienteId === clienteId),
    pedidos: getItems<Pedido>(KEYS.pedidos).filter((row) => row.clienteId === clienteId),
    ingresos: getItems<Ingreso>(KEYS.ingresos).filter((row) => row.clienteId === clienteId),
  };
}
function decodeAccount(data: unknown): CustomerAccount {
  const raw = data as Record<string, Record<string, unknown>[]> | null;
  if (!raw || !['advances', 'movements', 'pedidos', 'ingresos'].every((key) => Array.isArray(raw[key])))
    throw new Error('No se recibio la cuenta completa. Actualiza antes de continuar.');
  return {
    cliente: raw.cliente ? fromCloudRecord<Cliente>(raw.cliente as unknown as Record<string, unknown>) : undefined,
    advances: raw.advances.map((row) => fromCloudRecord<CustomerAdvance>(row)),
    movements: raw.movements.map((row) => fromCloudRecord<CustomerMovement>(row)),
    pedidos: raw.pedidos.map((row) => fromCloudRecord<Pedido>(row)),
    ingresos: raw.ingresos.map((row) => fromCloudRecord<Ingreso>(row)),
  };
}
function cacheAccount(clienteId: string, account: CustomerAccount): void {
  for (const [key, rows] of [
    [KEYS.customerAdvances, account.advances],
    [KEYS.customerMovements, account.movements],
    [KEYS.pedidos, account.pedidos],
    [KEYS.ingresos, account.ingresos],
  ] as const) {
    const local = getItems<VersionedRecord & { clienteId?: string }>(key);
    const merged =
      key === KEYS.customerAdvances || key === KEYS.customerMovements
        ? [...local.filter((row) => row.clienteId !== clienteId), ...rows]
        : mergeCloudList(key, local, rows);
    writeLocalJSON(key, merged);
  }
}
function errorMessage(error: { message?: string; code?: string }): string {
  if (error.code === 'PGRST202' || error.code === '42P01')
    return 'La cuenta de clientes requiere actualizar la base de datos. No se registro ningun movimiento.';
  return error.message || 'No se pudo confirmar el movimiento. Reintenta la misma operacion.';
}
export async function loadCustomerAccount(clienteId: string): Promise<CustomerAccount> {
  const owner = localStorage.getItem(ACTIVE_USER_KEY);
  const { data, error } = await supabase
    .rpc('get_customer_account', { p_cliente_id: clienteId })
    .abortSignal(AbortSignal.timeout(15000));
  if (owner !== localStorage.getItem(ACTIVE_USER_KEY)) throw new Error('La sesion cambio');
  if (error) throw new Error(errorMessage(error));
  const account = decodeAccount(data);
  try {
    cacheAccount(clienteId, account);
  } catch (error) {
    reportError(error, { kind: 'customerAccountCache' });
  }
  return account;
}
export function pendingCustomerCommands(clienteId: string): CustomerCommand[] {
  const owner = localStorage.getItem(ACTIVE_USER_KEY);
  return storageKeys()
    .filter((key) => key.startsWith(CUSTOMER_COMMAND_PREFIX))
    .flatMap((key) => {
      try {
        const command = JSON.parse(localStorage.getItem(key) || 'null') as CustomerCommand | null;
        return command?.owner === owner && command.data.clienteId === clienteId ? [command] : [];
      } catch {
        return [];
      }
    });
}
export function newCustomerCommand(action: CustomerCommand['action'], data: CustomerCommand['data']): CustomerCommand {
  const owner = localStorage.getItem(ACTIVE_USER_KEY);
  if (!owner) throw new Error('Sesion requerida');
  return { id: crypto.randomUUID(), owner, action, data };
}
async function runCustomerCommandUnlocked(command: CustomerCommand, receipt?: File): Promise<CustomerAccount> {
  if (command.owner !== localStorage.getItem(ACTIVE_USER_KEY)) throw new Error('La sesion cambio');
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    throw new Error('Necesitas conexion para confirmar un movimiento de saldo');
  if (pendingCustomerCommands(command.data.clienteId).some((pending) => pending.id !== command.id))
    throw new Error('Primero reintenta el movimiento que esta sin confirmacion. No se creo otro movimiento.');
  await flushPendingSync();
  if (readSyncQueue().length)
    throw new Error('Resuelve los cambios de sincronizacion pendientes antes de mover saldos');
  if (command.owner !== localStorage.getItem(ACTIVE_USER_KEY)) throw new Error('La sesion cambio');
  const key = CUSTOMER_COMMAND_PREFIX + command.id;
  if (receipt && command.action === 'receive')
    command.data.receiptPath = await uploadCustomerReceipt(command.id, receipt);
  if (command.owner !== localStorage.getItem(ACTIVE_USER_KEY)) throw new Error('La sesion cambio');
  safeSetItem(key, JSON.stringify(command));
  const { data, error } = await supabase
    .rpc('customer_account_command', { p_action: command.action, p_operation: command.id, p_data: command.data })
    .abortSignal(AbortSignal.timeout(20000));
  if (command.owner !== localStorage.getItem(ACTIVE_USER_KEY)) throw new Error('La sesion cambio');
  if (error) {
    // SQL validation failures rolled back. Network failures retain the idempotency
    // key: retrying must recover a possible commit, never create a second receipt.
    if (
      ['P0001', '22007', '22008', '22P02', '23505', '23514', '23503', '42501', 'PGRST202', '42P01'].includes(error.code)
    ) {
      localStorage.removeItem(key);
      removeFromIDB(key);
    }
    throw new Error(errorMessage(error));
  }
  const account = decodeAccount(data);
  localStorage.removeItem(key);
  removeFromIDB(key);
  invalidateCloudCache();
  try {
    cacheAccount(command.data.clienteId, account);
  } catch (error) {
    reportError(error, { kind: 'customerAccountCache' });
  }
  return account;
}
export async function runCustomerCommand(command: CustomerCommand, receipt?: File): Promise<CustomerAccount> {
  const run = () => runCustomerCommandUnlocked(command, receipt);
  return typeof navigator !== 'undefined' && navigator.locks
    ? await navigator.locks.request(`studio24-account:${command.owner}:${command.data.clienteId}`, run)
    : await run();
}
