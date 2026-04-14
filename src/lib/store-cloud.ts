'use client';

import { supabase } from './supabase';
import type {
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

// --- Mappers: camelCase <-> snake_case ---

// Manual overrides for keys that don't convert cleanly
const SNAKE_OVERRIDES: Record<string, string> = {
  uuidCFDI: 'uuid_cfdi',
  xmlUrl: 'xml_url',
  pdfUrl: 'pdf_url',
  logoUrl: 'logo_url',
  createdAt: 'created_at',
  clienteId: 'cliente_id',
  pedidoId: 'pedido_id',
  proveedorId: 'proveedor_id',
  montoTotal: 'monto_total',
  formaPago: 'forma_pago',
  numeroFactura: 'numero_factura',
  precioUnitario: 'precio_unitario',
  costoMateriales: 'costo_materiales',
  estadoPago: 'estado_pago',
  montoPagado: 'monto_pagado',
  archivoDiseno: 'archivo_diseno',
  fechaPedido: 'fecha_pedido',
  fechaEntrega: 'fecha_entrega',
  fechaEntregaReal: 'fecha_entrega_real',
  diaDelMes: 'dia_del_mes',
  stockMinimo: 'stock_minimo',
  conIVA: 'con_iva',
  clienteNombre: 'cliente_nombre',
  clienteEmpresa: 'cliente_empresa',
  nombreNegocio: 'nombre_negocio',
  numeroCuenta: 'numero_cuenta',
  regimenFiscal: 'regimen_fiscal',
  codigoPostal: 'codigo_postal',
};

function toSnake(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = SNAKE_OVERRIDES[key] || key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
    result[snakeKey] = value;
  }
  return result;
}

function toCamel<T>(obj: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'user_id') continue; // Don't expose user_id to frontend
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = value;
  }
  return result as T;
}

// --- Generic CRUD ---

async function getAll<T>(table: string): Promise<T[]> {
  const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => toCamel<T>(row as Record<string, unknown>));
}

async function upsertOne<T extends { id: string }>(table: string, item: T): Promise<T> {
  const row = toSnake(item as unknown as Record<string, unknown>);
  delete row.user_id; // Let DB default handle it
  const { error } = await supabase.from(table).upsert(row, { onConflict: 'id' });
  if (error) throw error;
  return item;
}

async function deleteOne(table: string, id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

// --- Typed exports ---

// Clientes
export const cloudGetClientes = () => getAll<Cliente>('clientes');
export const cloudUpsertCliente = (c: Cliente) => upsertOne('clientes', c);
export const cloudDeleteCliente = (id: string) => deleteOne('clientes', id);

// Proveedores
export const cloudGetProveedores = () => getAll<Proveedor>('proveedores');
export const cloudUpsertProveedor = (p: Proveedor) => upsertOne('proveedores', p);
export const cloudDeleteProveedor = (id: string) => deleteOne('proveedores', id);

// Ingresos
export const cloudGetIngresos = () => getAll<Ingreso>('ingresos');
export const cloudUpsertIngreso = (i: Ingreso) => upsertOne('ingresos', i);
export const cloudDeleteIngreso = (id: string) => deleteOne('ingresos', id);

// Egresos
export const cloudGetEgresos = () => getAll<Egreso>('egresos');
export const cloudUpsertEgreso = (e: Egreso) => upsertOne('egresos', e);
export const cloudDeleteEgreso = (id: string) => deleteOne('egresos', id);

// Pedidos
export const cloudGetPedidos = () => getAll<Pedido>('pedidos');
export const cloudUpsertPedido = (p: Pedido) => upsertOne('pedidos', p);
export const cloudDeletePedido = (id: string) => deleteOne('pedidos', id);

// Productos
export const cloudGetProductos = () => getAll<Producto>('productos');
export const cloudUpsertProducto = (p: Producto) => upsertOne('productos', p);
export const cloudDeleteProducto = (id: string) => deleteOne('productos', id);

// Cotizaciones
export const cloudGetCotizaciones = () => getAll<Cotizacion>('cotizaciones');
export const cloudUpsertCotizacion = (c: Cotizacion) => upsertOne('cotizaciones', c);
export const cloudDeleteCotizacion = (id: string) => deleteOne('cotizaciones', id);

// Egresos Recurrentes
export const cloudGetEgresosRecurrentes = () => getAll<EgresoRecurrente>('egresos_recurrentes');
export const cloudUpsertEgresoRecurrente = (e: EgresoRecurrente) => upsertOne('egresos_recurrentes', e);
export const cloudDeleteEgresoRecurrente = (id: string) => deleteOne('egresos_recurrentes', id);

// Inventario
export const cloudGetInventario = () => getAll<ItemInventario>('inventario');
export const cloudUpsertItemInventario = (i: ItemInventario) => upsertOne('inventario', i);
export const cloudDeleteItemInventario = (id: string) => deleteOne('inventario', id);

// Diseños
export const cloudGetDisenos = () => getAll<Diseno>('disenos');
export const cloudUpsertDiseno = (d: Diseno) => upsertOne('disenos', d);
export const cloudDeleteDiseno = (id: string) => deleteOne('disenos', id);

// Plantillas
export const cloudGetPlantillas = () => getAll<PlantillaWhatsApp>('plantillas');
export const cloudUpsertPlantilla = (p: PlantillaWhatsApp) => upsertOne('plantillas', p);
export const cloudDeletePlantilla = (id: string) => deleteOne('plantillas', id);

// Config
export async function cloudGetConfig(): Promise<ConfigNegocio> {
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
  const { data, error } = await supabase.from('config').select('*').maybeSingle();
  if (error || !data) return defaultConfig;
  const row = data as Record<string, unknown>;
  return {
    nombreNegocio: (row.nombre_negocio as string) || '',
    titular: (row.titular as string) || '',
    rfc: (row.rfc as string) || '',
    regimenFiscal: (row.regimen_fiscal as string) || '',
    codigoPostal: (row.codigo_postal as string) || '',
    banco: (row.banco as string) || '',
    numeroCuenta: (row.numero_cuenta as string) || '',
    clabe: (row.clabe as string) || '',
    telefono: (row.telefono as string) || '',
    email: (row.email as string) || '',
    direccion: (row.direccion as string) || '',
    logoUrl: (row.logo_url as string) || '',
  };
}

export async function cloudSaveConfig(config: ConfigNegocio): Promise<void> {
  const { error } = await supabase.from('config').upsert({
    nombre_negocio: config.nombreNegocio,
    titular: config.titular,
    banco: config.banco,
    numero_cuenta: config.numeroCuenta,
    clabe: config.clabe,
    telefono: config.telefono,
    email: config.email,
    direccion: config.direccion,
    logo_url: config.logoUrl,
  });
  if (error) throw error;
}

// Folio counter
export async function cloudGetNextFolio(prefix: string): Promise<string> {
  // Try to get current counter
  const { data } = await supabase.from('folio_counter').select('counter').single();
  const current = data?.counter || 0;
  const next = current + 1;
  await supabase.from('folio_counter').upsert({ counter: next });
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

// Recurrentes log
export async function cloudGetRecurrentesLog(): Promise<string[]> {
  const { data } = await supabase.from('recurrentes_log').select('log_key');
  return (data || []).map((r) => (r as { log_key: string }).log_key);
}

export async function cloudAddRecurrenteLog(key: string): Promise<void> {
  await supabase.from('recurrentes_log').upsert({ log_key: key });
}

// Migration: push all localStorage data to Supabase
export async function migrateLocalToCloud(): Promise<number> {
  let count = 0;

  const migrate = async <T extends { id: string }>(
    localKey: string,
    cloudUpsert: (item: T) => Promise<T>,
  ) => {
    const raw = localStorage.getItem(localKey);
    if (!raw) return;
    const items: T[] = JSON.parse(raw);
    for (const item of items) {
      try {
        await cloudUpsert(item);
        count++;
      } catch {
        // Skip duplicates
      }
    }
  };

  await migrate<Cliente>('bordados_clientes', cloudUpsertCliente);
  await migrate<Proveedor>('bordados_proveedores', cloudUpsertProveedor);
  await migrate<Ingreso>('bordados_ingresos', cloudUpsertIngreso);
  await migrate<Egreso>('bordados_egresos', cloudUpsertEgreso);
  await migrate<Pedido>('bordados_pedidos', cloudUpsertPedido);
  await migrate<Producto>('bordados_productos', cloudUpsertProducto);
  await migrate<Cotizacion>('bordados_cotizaciones', cloudUpsertCotizacion);
  await migrate<EgresoRecurrente>('bordados_egresos_recurrentes', cloudUpsertEgresoRecurrente);
  await migrate<ItemInventario>('bordados_inventario', cloudUpsertItemInventario);
  await migrate<Diseno>('bordados_disenos', cloudUpsertDiseno);
  await migrate<PlantillaWhatsApp>('bordados_plantillas', cloudUpsertPlantilla);

  // Config
  const configRaw = localStorage.getItem('bordados_config');
  if (configRaw) {
    try {
      await cloudSaveConfig(JSON.parse(configRaw));
      count++;
    } catch { /* skip */ }
  }

  // Mark as migrated
  localStorage.setItem('bordados_cloud_migrated', '1');

  return count;
}

// Pull from cloud: download all Supabase data into localStorage
// Used when logging in on a new device
export async function pullFromCloud(): Promise<number> {
  let count = 0;

  const pull = async <T>(table: string, localKey: string) => {
    const items = await getAll<T>(table);
    if (items.length > 0) {
      localStorage.setItem(localKey, JSON.stringify(items));
      count += items.length;
    }
  };

  await pull<Cliente>('clientes', 'bordados_clientes');
  await pull<Proveedor>('proveedores', 'bordados_proveedores');
  await pull<Ingreso>('ingresos', 'bordados_ingresos');
  await pull<Egreso>('egresos', 'bordados_egresos');
  await pull<Pedido>('pedidos', 'bordados_pedidos');
  await pull<Producto>('productos', 'bordados_productos');
  await pull<Cotizacion>('cotizaciones', 'bordados_cotizaciones');
  await pull<EgresoRecurrente>('egresos_recurrentes', 'bordados_egresos_recurrentes');
  await pull<ItemInventario>('inventario', 'bordados_inventario');
  await pull<Diseno>('disenos', 'bordados_disenos');
  await pull<PlantillaWhatsApp>('plantillas', 'bordados_plantillas');

  // Config
  const config = await cloudGetConfig();
  if (config.nombreNegocio || config.titular) {
    localStorage.setItem('bordados_config', JSON.stringify(config));
    count++;
  }

  // Recurrentes log
  const log = await cloudGetRecurrentesLog();
  if (log.length > 0) {
    localStorage.setItem('bordados_recurrentes_log', JSON.stringify(log));
  }

  return count;
}
