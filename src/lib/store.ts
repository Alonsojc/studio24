'use client';

import {
  Cliente,
  Proveedor,
  Egreso,
  Ingreso,
  EgresoRecurrente,
  Pedido,
  Cotizacion,
  ConfigNegocio,
  Producto,
  ItemInventario,
  Diseno,
  PlantillaWhatsApp,
} from './types';
import { clearStudioDB, mirrorToIDB, removeFromIDB } from './db';

const KEYS = {
  clientes: 'bordados_clientes',
  proveedores: 'bordados_proveedores',
  egresos: 'bordados_egresos',
  ingresos: 'bordados_ingresos',
  pedidos: 'bordados_pedidos',
  cotizaciones: 'bordados_cotizaciones',
  config: 'bordados_config',
  productos: 'bordados_productos',
  egresosRecurrentes: 'bordados_egresos_recurrentes',
  recurrentesLog: 'bordados_recurrentes_log',
  inventario: 'bordados_inventario',
  disenos: 'bordados_disenos',
  plantillas: 'bordados_plantillas',
} as const;

const KEEP_AFTER_CLEAR = new Set(['bordados_seeded']);

export const ACTIVE_USER_KEY = 'bordados_active_user_id';

export function hasLocalBusinessData(): boolean {
  if (typeof window === 'undefined') return false;
  return Object.values(KEYS).some((key) => localStorage.getItem(key) !== null);
}

function getItems<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
    mirrorToIDB(key, value);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      throw new Error('Sin espacio en el navegador. Exporta un respaldo desde Ajustes y borra datos antiguos.');
    }
    throw e;
  }
}

function setItems<T>(key: string, items: T[]): void {
  safeSetItem(key, JSON.stringify(items));
}

function addItem<T extends { id: string }>(key: string, item: T): T {
  const items = getItems<T>(key);
  items.push(item);
  setItems(key, items);
  return item;
}

function updateItem<T extends { id: string }>(key: string, item: T): T {
  const items = getItems<T>(key);
  const index = items.findIndex((i) => i.id === item.id);
  if (index !== -1) {
    items[index] = item;
    setItems(key, items);
  }
  return item;
}

function deleteItem<T extends { id: string }>(key: string, id: string): void {
  const items = getItems<T>(key);
  setItems(
    key,
    items.filter((i) => i.id !== id),
  );
}

// Clientes
export const getClientes = () => getItems<Cliente>(KEYS.clientes);
export const addCliente = (c: Cliente) => addItem(KEYS.clientes, c);
export const updateCliente = (c: Cliente) => updateItem(KEYS.clientes, c);
export const deleteCliente = (id: string) => deleteItem<Cliente>(KEYS.clientes, id);

// Proveedores
export const getProveedores = () => getItems<Proveedor>(KEYS.proveedores);
export const addProveedor = (p: Proveedor) => addItem(KEYS.proveedores, p);
export const updateProveedor = (p: Proveedor) => updateItem(KEYS.proveedores, p);
export const deleteProveedor = (id: string) => deleteItem<Proveedor>(KEYS.proveedores, id);

// Egresos
export const getEgresos = () => getItems<Egreso>(KEYS.egresos);
export const addEgreso = (e: Egreso) => addItem(KEYS.egresos, e);
export const updateEgreso = (e: Egreso) => updateItem(KEYS.egresos, e);
export const deleteEgreso = (id: string) => deleteItem<Egreso>(KEYS.egresos, id);

// Ingresos
export const getIngresos = () => getItems<Ingreso>(KEYS.ingresos);
export const addIngreso = (i: Ingreso) => addItem(KEYS.ingresos, i);
export const updateIngreso = (i: Ingreso) => updateItem(KEYS.ingresos, i);
export const deleteIngreso = (id: string) => deleteItem<Ingreso>(KEYS.ingresos, id);

// Egresos Recurrentes
export const getEgresosRecurrentes = () => getItems<EgresoRecurrente>(KEYS.egresosRecurrentes);
export const addEgresoRecurrente = (e: EgresoRecurrente) => addItem(KEYS.egresosRecurrentes, e);
export const updateEgresoRecurrente = (e: EgresoRecurrente) => updateItem(KEYS.egresosRecurrentes, e);
export const deleteEgresoRecurrente = (id: string) => deleteItem<EgresoRecurrente>(KEYS.egresosRecurrentes, id);

// Pedidos
export const getPedidos = () => getItems<Pedido>(KEYS.pedidos);
export const addPedido = (p: Pedido) => addItem(KEYS.pedidos, p);
export const updatePedido = (p: Pedido) => updateItem(KEYS.pedidos, p);
export const deletePedido = (id: string) => deleteItem<Pedido>(KEYS.pedidos, id);

// Productos
export const getProductos = () => getItems<Producto>(KEYS.productos);
export const addProducto = (p: Producto) => addItem(KEYS.productos, p);
export const updateProducto = (p: Producto) => updateItem(KEYS.productos, p);
export const deleteProducto = (id: string) => deleteItem<Producto>(KEYS.productos, id);

// Cotizaciones
export const getCotizaciones = () => getItems<Cotizacion>(KEYS.cotizaciones);
export const addCotizacion = (c: Cotizacion) => addItem(KEYS.cotizaciones, c);
export const updateCotizacion = (c: Cotizacion) => updateItem(KEYS.cotizaciones, c);
export const deleteCotizacion = (id: string) => deleteItem<Cotizacion>(KEYS.cotizaciones, id);

// Inventario
export const getInventario = () => getItems<ItemInventario>(KEYS.inventario);
export const addItemInventario = (i: ItemInventario) => addItem(KEYS.inventario, i);
export const updateItemInventario = (i: ItemInventario) => updateItem(KEYS.inventario, i);
export const deleteItemInventario = (id: string) => deleteItem<ItemInventario>(KEYS.inventario, id);

// Diseños
export const getDisenos = () => getItems<Diseno>(KEYS.disenos);
export const addDiseno = (d: Diseno) => addItem(KEYS.disenos, d);
export const updateDiseno = (d: Diseno) => updateItem(KEYS.disenos, d);
export const deleteDiseno = (id: string) => deleteItem<Diseno>(KEYS.disenos, id);

// Plantillas WhatsApp
export const getPlantillas = () => getItems<PlantillaWhatsApp>(KEYS.plantillas);
export const addPlantilla = (p: PlantillaWhatsApp) => addItem(KEYS.plantillas, p);
export const updatePlantilla = (p: PlantillaWhatsApp) => updateItem(KEYS.plantillas, p);
export const deletePlantilla = (id: string) => deleteItem<PlantillaWhatsApp>(KEYS.plantillas, id);

// Config
const defaultConfig: ConfigNegocio = {
  nombreNegocio: '',
  titular: '',
  rfc: '',
  regimenFiscal: '',
  codigoPostal: '',
  banco: '',
  numeroCuenta: '',
  clabe: '',
  telefono: '',
  email: '',
  direccion: '',
  logoUrl: '',
};

export function getConfig(): ConfigNegocio {
  if (typeof window === 'undefined') return defaultConfig;
  const data = localStorage.getItem(KEYS.config);
  return data ? { ...defaultConfig, ...JSON.parse(data) } : defaultConfig;
}

export function saveConfig(config: ConfigNegocio): void {
  safeSetItem(KEYS.config, JSON.stringify(config));
}

// Backup / Restore
export function exportAllData(): string {
  const data: Record<string, unknown> = {};
  Object.entries(KEYS).forEach(([key, storageKey]) => {
    const raw = localStorage.getItem(storageKey);
    if (raw) data[key] = JSON.parse(raw);
  });
  data['config'] = getConfig();
  return JSON.stringify(data, null, 2);
}

export function importAllData(json: string): void {
  const data = JSON.parse(json);
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('El respaldo debe ser un objeto JSON válido');
  }
  // Validar que las claves conocidas contengan arrays (excepto config)
  const validKeys = Object.keys(KEYS);
  for (const key of validKeys) {
    if (key === 'config') continue;
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      throw new Error(`La sección "${key}" debe ser una lista`);
    }
  }
  if (data.config !== undefined && (typeof data.config !== 'object' || Array.isArray(data.config))) {
    throw new Error('La sección "config" debe ser un objeto');
  }
  Object.entries(KEYS).forEach(([key, storageKey]) => {
    if (data[key]) safeSetItem(storageKey, JSON.stringify(data[key]));
  });
  if (data.config) saveConfig(data.config);
}

export function clearAllData(): void {
  Object.values(KEYS).forEach((key) => {
    localStorage.removeItem(key);
    removeFromIDB(key);
  });
  // Keep seeded flag so demo data doesn't reload
  localStorage.setItem('bordados_seeded', '1');
}

export function clearSensitiveLocalData(): void {
  if (typeof window === 'undefined') return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('bordados_') && !KEEP_AFTER_CLEAR.has(key)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
  clearStudioDB();
  localStorage.setItem('bordados_seeded', '1');
}

export function bindLocalDataToUser(userId: string): boolean {
  if (typeof window === 'undefined') return false;
  const activeUserId = localStorage.getItem(ACTIVE_USER_KEY);
  let cleared = false;
  if (activeUserId && activeUserId !== userId) {
    clearSensitiveLocalData();
    cleared = true;
  }
  localStorage.setItem(ACTIVE_USER_KEY, userId);
  return cleared;
}

// Next folio — usa un contador incremental persistente para que nunca se repita
const FOLIO_COUNTER_KEY = 'bordados_folio_counter';

export function getNextFolio(prefix: string): string {
  const stored = localStorage.getItem(FOLIO_COUNTER_KEY);
  const current = stored ? parseInt(stored, 10) : getCotizaciones().length;
  const next = current + 1;
  safeSetItem(FOLIO_COUNTER_KEY, String(next));
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

// Log de meses ya procesados para recurrentes (evita duplicados)
export function getRecurrentesLog(): string[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(KEYS.recurrentesLog);
  return data ? JSON.parse(data) : [];
}

export function addRecurrenteLog(key: string): void {
  const log = getRecurrentesLog();
  if (!log.includes(key)) {
    log.push(key);
    safeSetItem(KEYS.recurrentesLog, JSON.stringify(log));
  }
}
