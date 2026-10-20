'use client';

import { ACTIVE_USER_KEY, KEYS, exportAllData, importAllData, previewImportData } from './store';
import { hasPendingSync, pauseCloudPulls, readSyncQueue } from './sync-queue';
import { migrateLocalToCloud, cloudGetCustomerCreditLedger } from './store-cloud';
import { getMyProfile } from './roles';
import { invalidateCloudCache } from './cloud-cache';
import { writeLocalJSON, type VersionedRecord } from './sync-queue';

export async function protectCustomerLedgerRestore(restored: Record<string, unknown>): Promise<void> {
  const { advances, movements, pedidos: orders, ingresos: incomes, clientes } = await cloudGetCustomerCreditLedger();
  for (const [key, rows] of [
    ['customerAdvances', advances],
    ['customerMovements', movements],
  ] as const) {
    const existing = new Set(rows.map((row) => row.id));
    if (Array.isArray(restored[key]) && restored[key].some((row: VersionedRecord) => !existing.has(row.id)))
      throw new Error(
        'El respaldo contiene un historial de saldos que no existe en esta nube. Requiere recuperacion de base de datos; no se recrearan cobros ni aplicaciones.',
      );
  }
  for (const [key, rows] of [
    ['pedidos', orders],
    ['ingresos', incomes],
    ['clientes', clientes],
  ] as const) {
    const canonical = new Map(rows.map((row) => [row.id, row]));
    if (Array.isArray(restored[key]))
      restored[key] = restored[key].map((row: VersionedRecord) => canonical.get(row.id) || row);
  }
  restored.customerAdvances = advances;
  restored.customerMovements = movements;
}

export async function restoreBackup(json: string): Promise<void> {
  const owner = localStorage.getItem(ACTIVE_USER_KEY);
  if ((await getMyProfile())?.role !== 'admin') throw new Error('Solo administradores pueden restaurar respaldos');
  if (hasPendingSync()) throw new Error('Sincroniza los cambios pendientes antes de restaurar');
  previewImportData(json);
  const current = JSON.parse(exportAllData());
  const restored = JSON.parse(json);
  for (const [key, value] of Object.entries(restored)) {
    if (Array.isArray(value) && Array.isArray(current[key])) {
      for (const item of value)
        if (item && typeof item === 'object' && item.id) {
          const existing = current[key].find((row: { id?: string }) => row.id === item.id);
          item.serverUpdatedAt = existing?.serverUpdatedAt || item.serverUpdatedAt;
        }
    }
  }
  if (restored.config && current.config) restored.config.serverUpdatedAt = current.config.serverUpdatedAt;
  await protectCustomerLedgerRestore(restored);
  if (owner !== localStorage.getItem(ACTIVE_USER_KEY)) throw new Error('La sesion cambio antes de restaurar');
  // Keep a recovery snapshot before changing any business data.
  sessionStorage.setItem('studio24:before-restore', exportAllData());
  pauseCloudPulls();
  importAllData(JSON.stringify(restored));
  writeLocalJSON(KEYS.customerAdvances, restored.customerAdvances);
  writeLocalJSON(KEYS.customerMovements, restored.customerMovements);
  invalidateCloudCache();
  try {
    await migrateLocalToCloud();
    pauseCloudPulls(0);
  } catch {
    throw new Error(
      `Respaldo recuperado localmente; ${readSyncQueue().length} cambios pendientes. Revisa Sincronizacion antes de cerrar sesion.`,
    );
  }
}
