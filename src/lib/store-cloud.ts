'use client';

import { supabase } from './supabase';
import { getMyTeamId } from './teams';
import { mergeCloudList, mergeCloudObject, readLocalArray, shouldSkipCloudPull, writeLocalJSON } from './sync-queue';
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
  updatedAt: 'updated_at',
  trackingToken: 'tracking_token',
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
  inventarioUsado: 'inventario_usado',
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
  soloFiscal: 'solo_fiscal',
};

// Reverse overrides for keys whose camelCase form doesn't follow the
// simple snake_case → camelCase rule (acronyms, etc.)
const CAMEL_OVERRIDES: Record<string, string> = {
  uuid_cfdi: 'uuidCFDI',
  con_iva: 'conIVA',
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
    if (key === 'user_id' || key === 'team_id') continue; // scoping columns stay server-side
    const camelKey = CAMEL_OVERRIDES[key] || key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = value;
  }
  return result as T;
}

// --- Generic CRUD ---

type DateFilter = { dateColumn: string; year?: number; month?: string; limit?: number };

async function getAll<T>(table: string, filter?: DateFilter): Promise<T[]> {
  let query = supabase.from(table).select('*');
  if (filter?.year) {
    const start = filter.month || `${filter.year}-01`;
    const end = filter.month && /^\d{4}-\d{2}$/.test(filter.month) ? `${filter.month}-32` : `${filter.year + 1}-01`;
    query = query.gte(filter.dateColumn, start).lt(filter.dateColumn, end);
  }
  query = query.order('created_at', { ascending: false });
  if (filter?.limit) query = query.limit(filter.limit);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row) => toCamel<T>(row as Record<string, unknown>));
}

async function upsertOne<T extends { id: string }>(table: string, item: T): Promise<T> {
  const row = toSnake(item as unknown as Record<string, unknown>);
  delete row.user_id;
  delete row.team_id; // Let DB default (current_user_team_id()) handle it
  let { error } = await supabase.from(table).upsert(row, { onConflict: 'id' });
  if (error && (error.message.includes('updated_at') || error.message.includes('tracking_token'))) {
    delete row.updated_at;
    if (table === 'pedidos' && error.message.includes('tracking_token')) delete row.tracking_token;
    ({ error } = await supabase.from(table).upsert(row, { onConflict: 'id' }));
  }
  if (error && table === 'pedidos' && (error.message.includes('pagos') || error.message.includes('inventario_usado'))) {
    delete row.pagos;
    delete row.inventario_usado;
    ({ error } = await supabase.from(table).upsert(row, { onConflict: 'id' }));
  }
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
export const cloudGetIngresosByYear = (year: number) => getAll<Ingreso>('ingresos', { dateColumn: 'fecha', year });
export const cloudGetIngresosByMonth = (month: string) =>
  getAll<Ingreso>('ingresos', { dateColumn: 'fecha', year: Number(month.substring(0, 4)), month });
export const cloudUpsertIngreso = (i: Ingreso) => upsertOne('ingresos', i);
export const cloudDeleteIngreso = (id: string) => deleteOne('ingresos', id);

// Egresos
export const cloudGetEgresos = () => getAll<Egreso>('egresos');
export const cloudGetEgresosByYear = (year: number) => getAll<Egreso>('egresos', { dateColumn: 'fecha', year });
export const cloudGetEgresosByMonth = (month: string) =>
  getAll<Egreso>('egresos', { dateColumn: 'fecha', year: Number(month.substring(0, 4)), month });
export const cloudUpsertEgreso = (e: Egreso) => upsertOne('egresos', e);
export const cloudDeleteEgreso = (id: string) => deleteOne('egresos', id);

// Pedidos
export const cloudGetPedidos = () => getAll<Pedido>('pedidos');
export const cloudGetPedidosByYear = (year: number) => getAll<Pedido>('pedidos', { dateColumn: 'fecha_pedido', year });
export const cloudGetPedidosPage = (limit = 500) => getAll<Pedido>('pedidos', { dateColumn: 'fecha_pedido', limit });
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
    updatedAt: '',
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
    updatedAt: (row.updated_at as string) || '',
  };
}

export async function cloudSaveConfig(config: ConfigNegocio): Promise<void> {
  const teamId = await getMyTeamId();
  if (!teamId) return;
  const { error } = await supabase.from('config').upsert(
    {
      team_id: teamId,
      nombre_negocio: config.nombreNegocio,
      titular: config.titular,
      rfc: config.rfc,
      regimen_fiscal: config.regimenFiscal,
      codigo_postal: config.codigoPostal,
      banco: config.banco,
      numero_cuenta: config.numeroCuenta,
      clabe: config.clabe,
      telefono: config.telefono,
      email: config.email,
      direccion: config.direccion,
      logo_url: config.logoUrl,
      updated_at: config.updatedAt,
    },
    { onConflict: 'team_id' },
  );
  if (error) throw error;
}

// Folio counter
export async function cloudGetNextFolio(prefix: string): Promise<string> {
  const teamId = await getMyTeamId();
  if (!teamId) return `${prefix}-001`;
  const { data, error } = await supabase.rpc('next_folio', { p_prefix: prefix });
  if (!error && typeof data === 'string') return data;

  // Fallback for databases that have not run supabase-hardening.sql yet.
  const { data: counterRow, error: readError } = await supabase
    .from('folio_counter')
    .select('counter')
    .eq('team_id', teamId)
    .maybeSingle();
  if (readError) throw readError;
  const current = counterRow?.counter || 0;
  const next = current + 1;
  const { error: writeError } = await supabase
    .from('folio_counter')
    .upsert({ team_id: teamId, counter: next }, { onConflict: 'team_id' });
  if (writeError) throw writeError;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

// Recurrentes log
export async function cloudGetRecurrentesLog(): Promise<string[]> {
  const { data } = await supabase.from('recurrentes_log').select('log_key');
  return (data || []).map((r) => (r as { log_key: string }).log_key);
}

export async function cloudAddRecurrenteLog(key: string): Promise<void> {
  const { error } = await supabase.from('recurrentes_log').upsert({ log_key: key });
  if (error) throw error;
}

export interface CloudRecurrenteEgresoInput {
  logKey: string;
  recurrenteId: string;
  yyyyMm: string;
  egreso: Egreso;
}

export async function cloudCreateRecurrenteEgreso(
  input: CloudRecurrenteEgresoInput,
): Promise<{ created: boolean; egreso?: Egreso }> {
  const { data, error } = await supabase.rpc('create_recurrente_egreso', {
    p_log_key: input.logKey,
    p_recurrente_id: input.recurrenteId,
    p_yyyy_mm: input.yyyyMm,
    p_egreso: toSnake(input.egreso as unknown as Record<string, unknown>),
  });
  if (error) {
    if (error.message.includes('function') || error.message.includes('does not exist')) {
      await cloudUpsertEgreso(input.egreso);
      await cloudAddRecurrenteLog(input.logKey);
      return { created: true, egreso: input.egreso };
    }
    throw error;
  }
  const result = data as { created?: boolean; egreso?: Record<string, unknown> } | null;
  return {
    created: Boolean(result?.created),
    egreso: result?.egreso ? toCamel<Egreso>(result.egreso) : undefined,
  };
}

// Migration: push all localStorage data to Supabase
export async function migrateLocalToCloud(): Promise<number> {
  let count = 0;

  const migrate = async <T extends { id: string }>(localKey: string, cloudUpsert: (item: T) => Promise<T>) => {
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

  const recurrentesLogRaw = localStorage.getItem('bordados_recurrentes_log');
  if (recurrentesLogRaw) {
    try {
      const logKeys: string[] = JSON.parse(recurrentesLogRaw);
      for (const key of logKeys) {
        try {
          await cloudAddRecurrenteLog(key);
          count++;
        } catch {
          /* skip */
        }
      }
    } catch {
      /* skip invalid local log */
    }
  }

  // Config
  const configRaw = localStorage.getItem('bordados_config');
  if (configRaw) {
    try {
      await cloudSaveConfig(JSON.parse(configRaw));
      count++;
    } catch {
      /* skip */
    }
  }

  // Mark as migrated
  localStorage.setItem('bordados_cloud_migrated', '1');

  return count;
}

// Pull from cloud: download all Supabase data into localStorage
// Used when logging in on a new device
export async function pullFromCloud(opts: { replaceEmpty?: boolean } = {}): Promise<number> {
  if (shouldSkipCloudPull()) return 0;
  let count = 0;

  const pull = async <T extends { id: string; createdAt?: string; updatedAt?: string }>(
    table: string,
    localKey: string,
  ) => {
    const items = await getAll<T>(table);
    const localItems = readLocalArray<T>(localKey);
    const merged = mergeCloudList(localKey, localItems, items);
    if (merged.length > 0 || opts.replaceEmpty) {
      writeLocalJSON(localKey, merged);
    }
    count += items.length;
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

  // Config — merge cloud into local so we don't overwrite fields
  // that may not exist in Supabase yet (e.g. rfc, regimenFiscal)
  const cloudConfig = await cloudGetConfig();
  if (cloudConfig.nombreNegocio || cloudConfig.titular) {
    const localRaw = localStorage.getItem('bordados_config');
    const localConfig = localRaw ? JSON.parse(localRaw) : {};
    // Cloud wins for non-empty fields; local preserved for fields cloud doesn't have
    const merged = { ...localConfig };
    for (const [key, value] of Object.entries(cloudConfig)) {
      if (value !== '' && value !== null && value !== undefined) {
        merged[key] = value;
      }
    }
    writeLocalJSON('bordados_config', mergeCloudObject('bordados_config', localConfig, merged));
    count++;
  }

  // Recurrentes log
  const log = await cloudGetRecurrentesLog();
  if (log.length > 0 || opts.replaceEmpty) {
    writeLocalJSON('bordados_recurrentes_log', log);
  }

  return count;
}
