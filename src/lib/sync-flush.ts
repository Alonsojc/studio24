'use client';

import type { ConfigNegocio } from './types';
import {
  cloudAddRecurrenteLog,
  cloudCreateRecurrenteEgreso,
  cloudDeleteCliente,
  cloudDeleteCotizacion,
  cloudDeleteDiseno,
  cloudDeleteEgreso,
  cloudDeleteEgresoRecurrente,
  cloudDeleteIngreso,
  cloudDeleteItemInventario,
  cloudDeletePedido,
  cloudDeletePlantilla,
  cloudDeleteProducto,
  cloudDeleteProveedor,
  cloudSaveConfig,
  cloudUpsertCliente,
  cloudUpsertCotizacion,
  cloudUpsertDiseno,
  cloudUpsertEgreso,
  cloudUpsertEgresoRecurrente,
  cloudUpsertIngreso,
  cloudUpsertItemInventario,
  cloudUpsertPedido,
  cloudUpsertPlantilla,
  cloudUpsertProducto,
  cloudUpsertProveedor,
  type CloudRecurrenteEgresoInput,
} from './store-cloud';
import {
  markSyncQueueEntryFailed,
  readSyncQueue,
  removeSyncQueueEntry,
  type SyncQueueEntry,
  type SyncTable,
} from './sync-queue';

type UpsertHandler = (payload: unknown) => Promise<unknown>;
type DeleteHandler = (id: string) => Promise<unknown>;

const UPSERT_HANDLERS: Partial<Record<SyncTable, UpsertHandler>> = {
  clientes: (payload) => cloudUpsertCliente(payload as Parameters<typeof cloudUpsertCliente>[0]),
  proveedores: (payload) => cloudUpsertProveedor(payload as Parameters<typeof cloudUpsertProveedor>[0]),
  ingresos: (payload) => cloudUpsertIngreso(payload as Parameters<typeof cloudUpsertIngreso>[0]),
  egresos: (payload) => cloudUpsertEgreso(payload as Parameters<typeof cloudUpsertEgreso>[0]),
  pedidos: (payload) => cloudUpsertPedido(payload as Parameters<typeof cloudUpsertPedido>[0]),
  productos: (payload) => cloudUpsertProducto(payload as Parameters<typeof cloudUpsertProducto>[0]),
  cotizaciones: (payload) => cloudUpsertCotizacion(payload as Parameters<typeof cloudUpsertCotizacion>[0]),
  egresos_recurrentes: (payload) =>
    cloudUpsertEgresoRecurrente(payload as Parameters<typeof cloudUpsertEgresoRecurrente>[0]),
  inventario: (payload) => cloudUpsertItemInventario(payload as Parameters<typeof cloudUpsertItemInventario>[0]),
  disenos: (payload) => cloudUpsertDiseno(payload as Parameters<typeof cloudUpsertDiseno>[0]),
  plantillas: (payload) => cloudUpsertPlantilla(payload as Parameters<typeof cloudUpsertPlantilla>[0]),
  config: (payload) => cloudSaveConfig(payload as ConfigNegocio),
};

const DELETE_HANDLERS: Partial<Record<SyncTable, DeleteHandler>> = {
  clientes: cloudDeleteCliente,
  proveedores: cloudDeleteProveedor,
  ingresos: cloudDeleteIngreso,
  egresos: cloudDeleteEgreso,
  pedidos: cloudDeletePedido,
  productos: cloudDeleteProducto,
  cotizaciones: cloudDeleteCotizacion,
  egresos_recurrentes: cloudDeleteEgresoRecurrente,
  inventario: cloudDeleteItemInventario,
  disenos: cloudDeleteDiseno,
  plantillas: cloudDeletePlantilla,
};

let flushInFlight: Promise<number> | null = null;

async function runQueueEntry(entry: SyncQueueEntry): Promise<void> {
  if (entry.action === 'upsert') {
    const handler = UPSERT_HANDLERS[entry.table];
    if (!handler || !entry.payload) return;
    await handler(entry.payload);
    return;
  }

  if (entry.action === 'delete') {
    const handler = DELETE_HANDLERS[entry.table];
    if (!handler) return;
    await handler(entry.recordId);
    return;
  }

  if (entry.action === 'recurrente_log') {
    await cloudAddRecurrenteLog(entry.recordId);
    return;
  }

  if (entry.action === 'recurrente_egreso') {
    await cloudCreateRecurrenteEgreso(entry.payload as CloudRecurrenteEgresoInput);
  }
}

async function flushPendingSyncOnce(): Promise<number> {
  let synced = 0;
  const queue = readSyncQueue().sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const entry of queue) {
    try {
      await runQueueEntry(entry);
      removeSyncQueueEntry(entry.id);
      synced++;
    } catch (error) {
      markSyncQueueEntryFailed(entry.id, error);
      throw error;
    }
  }

  return synced;
}

export function flushPendingSync(): Promise<number> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = flushPendingSyncOnce().finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}
