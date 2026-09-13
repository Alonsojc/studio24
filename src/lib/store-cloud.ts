'use client';

import { supabase } from './supabase';
import { getMyTeamId } from './teams';
import {
  mergeCloudList,
  mergeCloudObject,
  readLocalArray,
  shouldSkipCloudPull,
  writeLocalJSON,
  localKeyForTable,
  rememberDeleted,
  type SyncTable,
  type VersionedRecord,
} from './sync-queue';
import { cachedCloudRequest, invalidateCloudCache } from './cloud-cache';
import { ACTIVE_USER_KEY, ACTIVE_TEAM_KEY } from './store';
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
    if (key === 'serverUpdatedAt' || key === 'syncOperation') continue;
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
  result.serverUpdatedAt = obj.updated_at;
  return result as T;
}

// --- Generic CRUD ---

type DateFilter = { dateColumn: string; year?: number; month?: string; limit?: number };

async function getAll<T>(table: string, filter?: DateFilter): Promise<T[]> {
  return cachedCloudRequest(`${table}:${JSON.stringify(filter || {})}`, async () => {
    const owner = localStorage.getItem(ACTIVE_USER_KEY);
    const result: T[] = [];
    let after = '';
    // Cursor pagination also works when the API's maximum row count is reduced.
    while (true) {
      let query = supabase.from(table).select('*').order('id').limit(500);
      if (after) query = query.gt('id', after);
      if (filter?.year) {
        const month = filter.month ? Number(filter.month.slice(5, 7)) : 1;
        const start = `${filter.year}-${String(month).padStart(2, '0')}-01`;
        const end =
          filter.month && month < 12
            ? `${filter.year}-${String(month + 1).padStart(2, '0')}-01`
            : `${filter.year + 1}-01-01`;
        query = query.gte(filter.dateColumn, start).lt(filter.dateColumn, end);
      }
      const { data, error } = await query;
      if (error) throw error;
      if (!data?.length) break;
      result.push(...data.map((row) => toCamel<T>(row)));
      after = String(data[data.length - 1].id);
    }
    const deleted = await getDeletedRecords();
    if (owner !== localStorage.getItem(ACTIVE_USER_KEY)) throw new Error('La sesion cambio durante la descarga');
    const localKey = localKeyForTable(table as SyncTable);
    const ids = deleted.filter((row) => row.table_name === table).map((row) => row.record_id);
    if (localKey && ids.length) rememberDeleted(localKey, ids);
    return result;
  });
}

function getDeletedRecords(): Promise<{ table_name: string; record_id: string }[]> {
  return cachedCloudRequest('deleted-records', async () => {
    const rows: { table_name: string; record_id: string }[] = [];
    let after = 0;
    while (true) {
      const { data, error } = await supabase
        .from('deleted_records')
        .select('id,table_name,record_id')
        .gt('id', after)
        .order('id')
        .limit(500);
      if (error) throw error;
      if (!data?.length) return rows;
      rows.push(...data);
      after = data[data.length - 1].id;
    }
  });
}

export async function cloudWriteRecord<T extends VersionedRecord>(
  table: string,
  item: T,
  operationId: string,
): Promise<T> {
  const row = toSnake(item as unknown as Record<string, unknown>);
  delete row.user_id;
  delete row.team_id;
  const { data, error } = await supabase.rpc('sync_write_record', {
    p_table: table,
    p_record: row,
    p_expected: item.serverUpdatedAt || null,
    p_operation: operationId,
  });
  if (error) throw error;
  invalidateCloudCache();
  return toCamel<T>(data as Record<string, unknown>);
}

async function upsertOne<T extends VersionedRecord>(table: string, item: T): Promise<T> {
  return cloudWriteRecord(table, item, crypto.randomUUID());
}

async function deleteOne(table: string, id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', id).select('id').single();
  if (error) throw error;
  invalidateCloudCache();
}

export async function cloudDeleteRecord(table: string, id: string, expected: string | undefined): Promise<void> {
  const { error } = await supabase.rpc('sync_delete_record', {
    p_table: table,
    p_id: id,
    p_expected: expected || null,
  });
  if (error) throw error;
  invalidateCloudCache();
}

// --- Typed exports ---
export const cloudGetFinanceEntries = () => getAll<import('./finance-entries').FinanceEntry>('finance_entries');

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
export const cloudGetPedidosPage = () => getAll<Pedido>('pedidos');
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
  if (error) throw error;
  if (!data) return defaultConfig;
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
    serverUpdatedAt: (row.updated_at as string) || undefined,
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
  const rows = await getAll<{ logKey: string }>('recurrentes_log');
  return rows.map((r) => r.logKey);
}

export async function cloudAddRecurrenteLog(key: string): Promise<void> {
  const { error } = await supabase
    .from('recurrentes_log')
    .upsert({ log_key: key }, { onConflict: 'team_id,log_key', ignoreDuplicates: true });
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
  if (error) throw error;
  invalidateCloudCache();
  const result = data as { created?: boolean; egreso?: Record<string, unknown> } | null;
  return {
    created: Boolean(result?.created),
    egreso: result?.egreso ? toCamel<Egreso>(result.egreso) : undefined,
  };
}

// Migration: push all localStorage data to Supabase
export async function migrateLocalToCloud(): Promise<number> {
  const { enqueueUpsert, enqueueRecurrenteLog, hasPendingSync } = await import('./sync-queue');
  const { flushPendingSync } = await import('./sync-flush');
  const { migrateLegacyFinance } = await import('./finance-entries');
  const profile = await (await import('./roles')).getMyProfile();
  if (profile?.role !== 'admin') throw new Error('Solo administradores pueden restaurar respaldos');
  migrateLegacyFinance();
  const tables: SyncTable[] = [
    'clientes',
    'proveedores',
    'ingresos',
    'egresos',
    'pedidos',
    'productos',
    'cotizaciones',
    'egresos_recurrentes',
    'inventario',
    'disenos',
    'plantillas',
    'finance_entries',
  ];
  for (const table of tables) {
    for (const item of readLocalArray<VersionedRecord>(localKeyForTable(table))) enqueueUpsert(table, item);
  }
  for (const key of readLocalArray<string>(localKeyForTable('recurrentes_log'))) enqueueRecurrenteLog(key);
  const config = localStorage.getItem('bordados_config');
  if (config) enqueueUpsert('config', { ...JSON.parse(config), id: 'config' });
  const count = await flushPendingSync();
  if (hasPendingSync())
    throw new Error('El respaldo esta guardado localmente, pero quedan cambios pendientes en la nube');
  localStorage.setItem('bordados_cloud_migrated', '1');
  return count;
}

// Pull from cloud: download all Supabase data into localStorage
// Used when logging in on a new device
export async function pullFromCloud(opts: { replaceEmpty?: boolean } = {}): Promise<number> {
  if (shouldSkipCloudPull()) return 0;
  const owner = localStorage.getItem(ACTIVE_USER_KEY);
  const profile = await (await import('./roles')).getMyProfile();
  const teamId = await getMyTeamId();
  if (owner !== localStorage.getItem(ACTIVE_USER_KEY) || !teamId) throw new Error('Equipo no disponible');
  localStorage.setItem(ACTIVE_TEAM_KEY, teamId);
  if (!profile) throw new Error('No se pudo verificar el equipo');
  const finance = profile.role === 'admin' || profile.role === 'contador';
  let count = 0;

  const pull = async <T extends { id: string; createdAt?: string; updatedAt?: string }>(
    table: string,
    localKey: string,
  ) => {
    const items = await getAll<T>(table);
    if (owner !== localStorage.getItem(ACTIVE_USER_KEY)) throw new Error('La sesion cambio');
    const localItems = readLocalArray<T>(localKey);
    const merged = mergeCloudList(localKey, localItems, items);
    if (merged.length > 0 || opts.replaceEmpty) {
      writeLocalJSON(localKey, merged);
    }
    count += items.length;
  };

  const tables = [
    'clientes',
    'proveedores',
    'pedidos',
    'productos',
    'cotizaciones',
    'inventario',
    'disenos',
    'plantillas',
  ];
  if (finance) tables.push('ingresos', 'egresos', 'egresos_recurrentes', 'finance_entries');
  else
    for (const table of ['ingresos', 'egresos', 'egresos_recurrentes', 'finance_entries', 'recurrentes_log']) {
      writeLocalJSON(localKeyForTable(table as SyncTable), []);
    }
  const results = await Promise.allSettled(tables.map((table) => pull(table, localKeyForTable(table as SyncTable))));
  const failure = results.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
  if (owner !== localStorage.getItem(ACTIVE_USER_KEY)) throw new Error('La sesion cambio');
  if (finance) (await import('./finance-entries')).migrateLegacyFinance();

  // Config — merge cloud into local so we don't overwrite fields
  // that may not exist in Supabase yet (e.g. rfc, regimenFiscal)
  const cloudConfig = await cloudGetConfig();
  if (owner !== localStorage.getItem(ACTIVE_USER_KEY)) throw new Error('La sesion cambio');
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
  const log = finance ? await cloudGetRecurrentesLog() : [];
  if (owner !== localStorage.getItem(ACTIVE_USER_KEY)) throw new Error('La sesion cambio');
  if (log.length > 0 || opts.replaceEmpty) {
    writeLocalJSON('bordados_recurrentes_log', log);
  }

  return count;
}
