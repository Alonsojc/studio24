'use client';

/**
 * Store Sync: después de cada operación local, sincroniza con Supabase en background.
 * Las páginas siguen usando las funciones locales (síncronas), pero los datos
 * también se persisten en la nube automáticamente.
 *
 * Esto permite migración gradual sin reescribir todas las páginas.
 */

import {
  cloudUpsertCliente,
  cloudDeleteCliente,
  cloudUpsertProveedor,
  cloudDeleteProveedor,
  cloudUpsertIngreso,
  cloudDeleteIngreso,
  cloudUpsertEgreso,
  cloudDeleteEgreso,
  cloudUpsertPedido,
  cloudDeletePedido,
  cloudUpsertProducto,
  cloudDeleteProducto,
  cloudUpsertCotizacion,
  cloudDeleteCotizacion,
  cloudUpsertEgresoRecurrente,
  cloudDeleteEgresoRecurrente,
  cloudUpsertItemInventario,
  cloudDeleteItemInventario,
  cloudUpsertDiseno,
  cloudDeleteDiseno,
  cloudUpsertPlantilla,
  cloudDeletePlantilla,
  cloudSaveConfig,
  cloudAddRecurrenteLog,
  cloudGetNextFolio,
} from './store-cloud';

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

// Helper: do local first, then cloud in background (with retry + error tracking)
function syncAfter<T>(cloudFn: () => Promise<unknown>): T {
  trackSync(cloudFn);
  return undefined as unknown as T;
}

// --- Synced CRUD: local + cloud ---

// Clientes
export function addCliente(c: Cliente) {
  localAddCliente(c);
  syncAfter(() => cloudUpsertCliente(c));
  return c;
}
export function updateCliente(c: Cliente) {
  localUpdateCliente(c);
  syncAfter(() => cloudUpsertCliente(c));
  return c;
}
export function deleteCliente(id: string) {
  localDeleteCliente(id);
  syncAfter(() => cloudDeleteCliente(id));
}

// Proveedores
export function addProveedor(p: Proveedor) {
  localAddProveedor(p);
  syncAfter(() => cloudUpsertProveedor(p));
  return p;
}
export function updateProveedor(p: Proveedor) {
  localUpdateProveedor(p);
  syncAfter(() => cloudUpsertProveedor(p));
  return p;
}
export function deleteProveedor(id: string) {
  localDeleteProveedor(id);
  syncAfter(() => cloudDeleteProveedor(id));
}

// Ingresos
export function addIngreso(i: Ingreso) {
  localAddIngreso(i);
  syncAfter(() => cloudUpsertIngreso(i));
  return i;
}
export function updateIngreso(i: Ingreso) {
  localUpdateIngreso(i);
  syncAfter(() => cloudUpsertIngreso(i));
  return i;
}
export function deleteIngreso(id: string) {
  localDeleteIngreso(id);
  syncAfter(() => cloudDeleteIngreso(id));
}

// Egresos
export function addEgreso(e: Egreso) {
  localAddEgreso(e);
  syncAfter(() => cloudUpsertEgreso(e));
  return e;
}
export function updateEgreso(e: Egreso) {
  localUpdateEgreso(e);
  syncAfter(() => cloudUpsertEgreso(e));
  return e;
}
export function deleteEgreso(id: string) {
  localDeleteEgreso(id);
  syncAfter(() => cloudDeleteEgreso(id));
}

// Pedidos
export function addPedido(p: Pedido) {
  localAddPedido(p);
  syncAfter(() => cloudUpsertPedido(p));
  return p;
}
export function updatePedido(p: Pedido) {
  localUpdatePedido(p);
  syncAfter(() => cloudUpsertPedido(p));
  return p;
}
export function deletePedido(id: string) {
  localDeletePedido(id);
  syncAfter(() => cloudDeletePedido(id));
}

// Productos
export function addProducto(p: Producto) {
  localAddProducto(p);
  syncAfter(() => cloudUpsertProducto(p));
  return p;
}
export function updateProducto(p: Producto) {
  localUpdateProducto(p);
  syncAfter(() => cloudUpsertProducto(p));
  return p;
}
export function deleteProducto(id: string) {
  localDeleteProducto(id);
  syncAfter(() => cloudDeleteProducto(id));
}

// Cotizaciones
export function addCotizacion(c: Cotizacion) {
  localAddCotizacion(c);
  syncAfter(() => cloudUpsertCotizacion(c));
  return c;
}
export function updateCotizacion(c: Cotizacion) {
  localUpdateCotizacion(c);
  syncAfter(() => cloudUpsertCotizacion(c));
  return c;
}
export function deleteCotizacion(id: string) {
  localDeleteCotizacion(id);
  syncAfter(() => cloudDeleteCotizacion(id));
}

// Egresos Recurrentes
export function addEgresoRecurrente(e: EgresoRecurrente) {
  localAddEgresoRecurrente(e);
  syncAfter(() => cloudUpsertEgresoRecurrente(e));
  return e;
}
export function updateEgresoRecurrente(e: EgresoRecurrente) {
  localUpdateEgresoRecurrente(e);
  syncAfter(() => cloudUpsertEgresoRecurrente(e));
  return e;
}
export function deleteEgresoRecurrente(id: string) {
  localDeleteEgresoRecurrente(id);
  syncAfter(() => cloudDeleteEgresoRecurrente(id));
}

// Inventario
export function addItemInventario(i: ItemInventario) {
  localAddItemInventario(i);
  syncAfter(() => cloudUpsertItemInventario(i));
  return i;
}
export function updateItemInventario(i: ItemInventario) {
  localUpdateItemInventario(i);
  syncAfter(() => cloudUpsertItemInventario(i));
  return i;
}
export function deleteItemInventario(id: string) {
  localDeleteItemInventario(id);
  syncAfter(() => cloudDeleteItemInventario(id));
}

// Diseños
export function addDiseno(d: Diseno) {
  localAddDiseno(d);
  syncAfter(() => cloudUpsertDiseno(d));
  return d;
}
export function updateDiseno(d: Diseno) {
  localUpdateDiseno(d);
  syncAfter(() => cloudUpsertDiseno(d));
  return d;
}
export function deleteDiseno(id: string) {
  localDeleteDiseno(id);
  syncAfter(() => cloudDeleteDiseno(id));
}

// Plantillas
export function addPlantilla(p: PlantillaWhatsApp) {
  localAddPlantilla(p);
  syncAfter(() => cloudUpsertPlantilla(p));
  return p;
}
export function updatePlantilla(p: PlantillaWhatsApp) {
  localUpdatePlantilla(p);
  syncAfter(() => cloudUpsertPlantilla(p));
  return p;
}
export function deletePlantilla(id: string) {
  localDeletePlantilla(id);
  syncAfter(() => cloudDeletePlantilla(id));
}

// Config
export function saveConfig(config: ConfigNegocio) {
  localSaveConfig(config);
  syncAfter(() => cloudSaveConfig(config));
}

// Recurrentes log
export function addRecurrenteLog(key: string) {
  localAddRecurrenteLog(key);
  syncAfter(() => cloudAddRecurrenteLog(key));
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
