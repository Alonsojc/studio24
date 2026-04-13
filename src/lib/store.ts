'use client';

import { Cliente, Proveedor, Egreso, Ingreso, EgresoRecurrente, Pedido, Cotizacion, ConfigNegocio } from './types';

const KEYS = {
  clientes: 'bordados_clientes',
  proveedores: 'bordados_proveedores',
  egresos: 'bordados_egresos',
  ingresos: 'bordados_ingresos',
  pedidos: 'bordados_pedidos',
  cotizaciones: 'bordados_cotizaciones',
  config: 'bordados_config',
  egresosRecurrentes: 'bordados_egresos_recurrentes',
  recurrentesLog: 'bordados_recurrentes_log',
} as const;

function getItems<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
}

function setItems<T>(key: string, items: T[]): void {
  localStorage.setItem(key, JSON.stringify(items));
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
    items.filter((i) => i.id !== id)
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

// Cotizaciones
export const getCotizaciones = () => getItems<Cotizacion>(KEYS.cotizaciones);
export const addCotizacion = (c: Cotizacion) => addItem(KEYS.cotizaciones, c);
export const deleteCotizacion = (id: string) => deleteItem<Cotizacion>(KEYS.cotizaciones, id);

// Config
const defaultConfig: ConfigNegocio = {
  nombreNegocio: 'STUDIO 24',
  titular: 'Isabel Janeiro Cangas',
  banco: 'BBVA',
  numeroCuenta: '152 585 2856',
  clabe: '012180015258528567',
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
  localStorage.setItem(KEYS.config, JSON.stringify(config));
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
  Object.entries(KEYS).forEach(([key, storageKey]) => {
    if (data[key]) localStorage.setItem(storageKey, JSON.stringify(data[key]));
  });
  if (data.config) saveConfig(data.config);
}

export function clearAllData(): void {
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem('bordados_seeded');
}

// Next folio
export function getNextFolio(prefix: string): string {
  const cotizaciones = getCotizaciones();
  const num = cotizaciones.length + 1;
  return `${prefix}-${String(num).padStart(3, '0')}`;
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
    localStorage.setItem(KEYS.recurrentesLog, JSON.stringify(log));
  }
}
