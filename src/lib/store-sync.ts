'use client';

/**
 * Store Sync: después de cada operación local, sincroniza con Supabase en background.
 * Las páginas siguen usando las funciones locales (síncronas), pero los datos
 * también se persisten en la nube automáticamente.
 *
 * Esto permite migración gradual sin reescribir todas las páginas.
 */

import { cloudGetNextFolio, type CloudRecurrenteEgresoInput } from './store-cloud';

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
  enqueueAndFlush('clientes', next);
  localAddCliente(next);
  return next;
}
export function updateCliente(c: Cliente) {
  const next = stamp(c);
  enqueueAndFlush('clientes', next);
  localUpdateCliente(next);
  return next;
}
export function deleteCliente(id: string) {
  enqueueDeleteAndFlush('clientes', id);
  localDeleteCliente(id);
}

// Proveedores
export function addProveedor(p: Proveedor) {
  const next = stamp(p);
  enqueueAndFlush('proveedores', next);
  localAddProveedor(next);
  return next;
}
export function updateProveedor(p: Proveedor) {
  const next = stamp(p);
  enqueueAndFlush('proveedores', next);
  localUpdateProveedor(next);
  return next;
}
export function deleteProveedor(id: string) {
  enqueueDeleteAndFlush('proveedores', id);
  localDeleteProveedor(id);
}

// Ingresos
export function addIngreso(i: Ingreso) {
  const next = stamp(i);
  enqueueAndFlush('ingresos', next);
  localAddIngreso(next);
  return next;
}
export function updateIngreso(i: Ingreso) {
  const next = stamp(i);
  enqueueAndFlush('ingresos', next);
  localUpdateIngreso(next);
  return next;
}
export function deleteIngreso(id: string) {
  enqueueDeleteAndFlush('ingresos', id);
  localDeleteIngreso(id);
}

// Egresos
export function addEgreso(e: Egreso) {
  const next = stamp(e);
  enqueueAndFlush('egresos', next);
  localAddEgreso(next);
  return next;
}
export function updateEgreso(e: Egreso) {
  const next = stamp(e);
  enqueueAndFlush('egresos', next);
  localUpdateEgreso(next);
  return next;
}
export function deleteEgreso(id: string) {
  enqueueDeleteAndFlush('egresos', id);
  localDeleteEgreso(id);
}

// Pedidos
export function addPedido(p: Pedido) {
  const next = stamp(p);
  enqueueAndFlush('pedidos', next);
  localAddPedido(next);
  return next;
}
export function updatePedido(p: Pedido) {
  const next = stamp(p);
  enqueueAndFlush('pedidos', next);
  localUpdatePedido(next);
  return next;
}
export function deletePedido(id: string) {
  enqueueDeleteAndFlush('pedidos', id);
  localDeletePedido(id);
}

// Productos
export function addProducto(p: Producto) {
  const next = stamp(p);
  enqueueAndFlush('productos', next);
  localAddProducto(next);
  return next;
}
export function updateProducto(p: Producto) {
  const next = stamp(p);
  enqueueAndFlush('productos', next);
  localUpdateProducto(next);
  return next;
}
export function deleteProducto(id: string) {
  enqueueDeleteAndFlush('productos', id);
  localDeleteProducto(id);
}

// Cotizaciones
export function addCotizacion(c: Cotizacion) {
  const next = stamp(c);
  enqueueAndFlush('cotizaciones', next);
  localAddCotizacion(next);
  return next;
}
export function updateCotizacion(c: Cotizacion) {
  const next = stamp(c);
  enqueueAndFlush('cotizaciones', next);
  localUpdateCotizacion(next);
  return next;
}
export function deleteCotizacion(id: string) {
  enqueueDeleteAndFlush('cotizaciones', id);
  localDeleteCotizacion(id);
}

// Egresos Recurrentes
export function addEgresoRecurrente(e: EgresoRecurrente) {
  const next = stamp(e);
  enqueueAndFlush('egresos_recurrentes', next);
  localAddEgresoRecurrente(next);
  return next;
}
export function updateEgresoRecurrente(e: EgresoRecurrente) {
  const next = stamp(e);
  enqueueAndFlush('egresos_recurrentes', next);
  localUpdateEgresoRecurrente(next);
  return next;
}
export function deleteEgresoRecurrente(id: string) {
  enqueueDeleteAndFlush('egresos_recurrentes', id);
  localDeleteEgresoRecurrente(id);
}

// Inventario
export function addItemInventario(i: ItemInventario) {
  const next = stamp(i);
  enqueueAndFlush('inventario', next);
  localAddItemInventario(next);
  return next;
}
export function updateItemInventario(i: ItemInventario) {
  const next = stamp(i);
  enqueueAndFlush('inventario', next);
  localUpdateItemInventario(next);
  return next;
}
export function deleteItemInventario(id: string) {
  enqueueDeleteAndFlush('inventario', id);
  localDeleteItemInventario(id);
}

// Diseños
export function addDiseno(d: Diseno) {
  const next = stamp(d);
  enqueueAndFlush('disenos', next);
  localAddDiseno(next);
  return next;
}
export function updateDiseno(d: Diseno) {
  const next = stamp(d);
  enqueueAndFlush('disenos', next);
  localUpdateDiseno(next);
  return next;
}
export function deleteDiseno(id: string) {
  enqueueDeleteAndFlush('disenos', id);
  localDeleteDiseno(id);
}

// Plantillas
export function addPlantilla(p: PlantillaWhatsApp) {
  const next = stamp(p);
  enqueueAndFlush('plantillas', next);
  localAddPlantilla(next);
  return next;
}
export function updatePlantilla(p: PlantillaWhatsApp) {
  const next = stamp(p);
  enqueueAndFlush('plantillas', next);
  localUpdatePlantilla(next);
  return next;
}
export function deletePlantilla(id: string) {
  enqueueDeleteAndFlush('plantillas', id);
  localDeletePlantilla(id);
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

  enqueueRecurrenteEgreso(payload, next.id);
  localAddEgreso(next);
  localAddRecurrenteLog(input.logKey);
  kickFlush();
  return next;
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
