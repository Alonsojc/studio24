'use client';

import { Cliente, Proveedor, Egreso, Ingreso } from './types';

const KEYS = {
  clientes: 'bordados_clientes',
  proveedores: 'bordados_proveedores',
  egresos: 'bordados_egresos',
  ingresos: 'bordados_ingresos',
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
