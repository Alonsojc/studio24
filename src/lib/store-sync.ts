'use client';

/**
 * Store Sync: después de cada operación local, sincroniza con Supabase en background.
 * Las páginas siguen usando las funciones locales (síncronas), pero los datos
 * también se persisten en la nube automáticamente.
 *
 * Esto permite migración gradual sin reescribir todas las páginas.
 */

import { cloudCreateRecurrenteEgreso, cloudGetNextFolio, type CloudRecurrenteEgresoInput } from './store-cloud';

import {
  addCliente as localAddCliente,
  updateCliente as localUpdateCliente,
  deleteCliente as localDeleteCliente,
  addProveedor as localAddProveedor,
  updateProveedor as localUpdateProveedor,
  deleteProveedor as localDeleteProveedor,
  addIngreso as localAddIngreso,
  updateIngreso as localUpdateIngreso,
  deleteIngreso as localDeleteIngreso,
  addEgreso as localAddEgreso,
  updateEgreso as localUpdateEgreso,
  deleteEgreso as localDeleteEgreso,
  addPedido as localAddPedido,
  updatePedido as localUpdatePedido,
  deletePedido as localDeletePedido,
  addProducto as localAddProducto,
  updateProducto as localUpdateProducto,
  deleteProducto as localDeleteProducto,
  addCotizacion as localAddCotizacion,
  updateCotizacion as localUpdateCotizacion,
  deleteCotizacion as localDeleteCotizacion,
  addEgresoRecurrente as localAddEgresoRecurrente,
  updateEgresoRecurrente as localUpdateEgresoRecurrente,
  deleteEgresoRecurrente as localDeleteEgresoRecurrente,
  addItemInventario as localAddItemInventario,
  updateItemInventario as localUpdateItemInventario,
  deleteItemInventario as localDeleteItemInventario,
  addDiseno as localAddDiseno,
  updateDiseno as localUpdateDiseno,
  deleteDiseno as localDeleteDiseno,
  addPlantilla as localAddPlantilla,
  updatePlantilla as localUpdatePlantilla,
  deletePlantilla as localDeletePlantilla,
  saveConfig as localSaveConfig,
  addRecurrenteLog as localAddRecurrenteLog,
  getNextFolio as localGetNextFolio,
} from './store';

import type {
  Cliente,
  Proveedor,
  Ingreso,
  Egreso,
  Pedido,
  Producto,
  Cotizacion,
  EgresoRecurrente,
  ItemInventario,
  Diseno,
  PlantillaWhatsApp,
  ConfigNegocio,
} from './types';

import { trackSync } from './sync-status';
import { flushPendingSync } from './sync-flush';
import {
  enqueueDelete,
  enqueueRecurrenteEgreso,
  enqueueRecurrenteLog,
  enqueueUpsert,
  type SyncTable,
  type VersionedRecord,
} from './sync-queue';

function stamp<T extends { createdAt?: string; updatedAt?: string }>(item: T): T {
  const timestamp = new Date().toISOString();
  return {
    ...item,
    createdAt: item.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

function kickFlush(): void {
  trackSync(() => flushPendingSync());
}

function enqueueAndFlush<T extends VersionedRecord>(table: SyncTable, item: T): void {
  enqueueUpsert(table, item);
  kickFlush();
}

function enqueueDeleteAndFlush(table: SyncTable, id: string): void {
  enqueueDelete(table, id);
  kickFlush();
}

// --- Synced CRUD: local + cloud ---

// Clientes
export function addCliente(c: Cliente) {
  const next = stamp(c);
  localAddCliente(next);
  enqueueAndFlush('clientes', next);
  return next;
}
export function updateCliente(c: Cliente) {
  const next = stamp(c);
  localUpdateCliente(next);
  enqueueAndFlush('clientes', next);
  return next;
}
export function deleteCliente(id: string) {
  localDeleteCliente(id);
  enqueueDeleteAndFlush('clientes', id);
}

// Proveedores
export function addProveedor(p: Proveedor) {
  const next = stamp(p);
  localAddProveedor(next);
  enqueueAndFlush('proveedores', next);
  return next;
}
export function updateProveedor(p: Proveedor) {
  const next = stamp(p);
  localUpdateProveedor(next);
  enqueueAndFlush('proveedores', next);
  return next;
}
export function deleteProveedor(id: string) {
  localDeleteProveedor(id);
  enqueueDeleteAndFlush('proveedores', id);
}

// Ingresos
export function addIngreso(i: Ingreso) {
  const next = stamp(i);
  localAddIngreso(next);
  enqueueAndFlush('ingresos', next);
  return next;
}
export function updateIngreso(i: Ingreso) {
  const next = stamp(i);
  localUpdateIngreso(next);
  enqueueAndFlush('ingresos', next);
  return next;
}
export function deleteIngreso(id: string) {
  localDeleteIngreso(id);
  enqueueDeleteAndFlush('ingresos', id);
}

// Egresos
export function addEgreso(e: Egreso) {
  const next = stamp(e);
  localAddEgreso(next);
  enqueueAndFlush('egresos', next);
  return next;
}
export function updateEgreso(e: Egreso) {
  const next = stamp(e);
  localUpdateEgreso(next);
  enqueueAndFlush('egresos', next);
  return next;
}
export function deleteEgreso(id: string) {
  localDeleteEgreso(id);
  enqueueDeleteAndFlush('egresos', id);
}

// Pedidos
export function addPedido(p: Pedido) {
  const next = stamp(p);
  localAddPedido(next);
  enqueueAndFlush('pedidos', next);
  return next;
}
export function updatePedido(p: Pedido) {
  const next = stamp(p);
  localUpdatePedido(next);
  enqueueAndFlush('pedidos', next);
  return next;
}
export function deletePedido(id: string) {
  localDeletePedido(id);
  enqueueDeleteAndFlush('pedidos', id);
}

// Productos
export function addProducto(p: Producto) {
  const next = stamp(p);
  localAddProducto(next);
  enqueueAndFlush('productos', next);
  return next;
}
export function updateProducto(p: Producto) {
  const next = stamp(p);
  localUpdateProducto(next);
  enqueueAndFlush('productos', next);
  return next;
}
export function deleteProducto(id: string) {
  localDeleteProducto(id);
  enqueueDeleteAndFlush('productos', id);
}

// Cotizaciones
export function addCotizacion(c: Cotizacion) {
  const next = stamp(c);
  localAddCotizacion(next);
  enqueueAndFlush('cotizaciones', next);
  return next;
}
export function updateCotizacion(c: Cotizacion) {
  const next = stamp(c);
  localUpdateCotizacion(next);
  enqueueAndFlush('cotizaciones', next);
  return next;
}
export function deleteCotizacion(id: string) {
  localDeleteCotizacion(id);
  enqueueDeleteAndFlush('cotizaciones', id);
}

// Egresos Recurrentes
export function addEgresoRecurrente(e: EgresoRecurrente) {
  const next = stamp(e);
  localAddEgresoRecurrente(next);
  enqueueAndFlush('egresos_recurrentes', next);
  return next;
}
export function updateEgresoRecurrente(e: EgresoRecurrente) {
  const next = stamp(e);
  localUpdateEgresoRecurrente(next);
  enqueueAndFlush('egresos_recurrentes', next);
  return next;
}
export function deleteEgresoRecurrente(id: string) {
  localDeleteEgresoRecurrente(id);
  enqueueDeleteAndFlush('egresos_recurrentes', id);
}

// Inventario
export function addItemInventario(i: ItemInventario) {
  const next = stamp(i);
  localAddItemInventario(next);
  enqueueAndFlush('inventario', next);
  return next;
}
export function updateItemInventario(i: ItemInventario) {
  const next = stamp(i);
  localUpdateItemInventario(next);
  enqueueAndFlush('inventario', next);
  return next;
}
export function deleteItemInventario(id: string) {
  localDeleteItemInventario(id);
  enqueueDeleteAndFlush('inventario', id);
}

// Diseños
export function addDiseno(d: Diseno) {
  const next = stamp(d);
  localAddDiseno(next);
  enqueueAndFlush('disenos', next);
  return next;
}
export function updateDiseno(d: Diseno) {
  const next = stamp(d);
  localUpdateDiseno(next);
  enqueueAndFlush('disenos', next);
  return next;
}
export function deleteDiseno(id: string) {
  localDeleteDiseno(id);
  enqueueDeleteAndFlush('disenos', id);
}

// Plantillas
export function addPlantilla(p: PlantillaWhatsApp) {
  const next = stamp(p);
  localAddPlantilla(next);
  enqueueAndFlush('plantillas', next);
  return next;
}
export function updatePlantilla(p: PlantillaWhatsApp) {
  const next = stamp(p);
  localUpdatePlantilla(next);
  enqueueAndFlush('plantillas', next);
  return next;
}
export function deletePlantilla(id: string) {
  localDeletePlantilla(id);
  enqueueDeleteAndFlush('plantillas', id);
}

// Config
export function saveConfig(config: ConfigNegocio) {
  const next = stamp(config);
  localSaveConfig(next);
  enqueueAndFlush('config', { id: 'config', ...next });
}

// Recurrentes log
export function addRecurrenteLog(key: string) {
  localAddRecurrenteLog(key);
  enqueueRecurrenteLog(key);
  kickFlush();
}

export async function createRecurrenteEgreso(input: CloudRecurrenteEgresoInput): Promise<Egreso | null> {
  const next = stamp(input.egreso);
  const payload: CloudRecurrenteEgresoInput = { ...input, egreso: next };

  try {
    const result = await cloudCreateRecurrenteEgreso(payload);
    if (!result.created) {
      localAddRecurrenteLog(input.logKey);
      return null;
    }
    const synced = result.egreso || next;
    localAddEgreso(synced);
    localAddRecurrenteLog(input.logKey);
    return synced;
  } catch {
    localAddEgreso(next);
    localAddRecurrenteLog(input.logKey);
    enqueueRecurrenteEgreso(payload, next.id);
    kickFlush();
    return next;
  }
}

// Folio — uses cloud if available, falls back to local
export function getNextFolio(prefix: string): string {
  return localGetNextFolio(prefix);
}

export async function getNextFolioAsync(prefix: string): Promise<string> {
  try {
    return await cloudGetNextFolio(prefix);
  } catch {
    return localGetNextFolio(prefix);
  }
}
