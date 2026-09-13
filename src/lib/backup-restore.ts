'use client';

import { exportAllData, importAllData, previewImportData } from './store';
import { hasPendingSync, pauseCloudPulls, readSyncQueue } from './sync-queue';
import { migrateLocalToCloud } from './store-cloud';
import { getMyProfile } from './roles';
import { invalidateCloudCache } from './cloud-cache';

export async function restoreBackup(json: string): Promise<void> {
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
  // Keep a recovery snapshot before changing any business data.
  sessionStorage.setItem('studio24:before-restore', exportAllData());
  pauseCloudPulls();
  importAllData(JSON.stringify(restored));
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
