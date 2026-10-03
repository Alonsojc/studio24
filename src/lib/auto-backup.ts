'use client';

import { supabase } from './supabase';
import { ACTIVE_USER_KEY, previewImportData, type BackupPreview } from './store';
import { exportCloudBackup } from './store-cloud';
import { flushPendingSync } from './sync-flush';
import { hasPendingSync } from './sync-queue';
import { isSafeBackupFileName, validateStorageUpload } from './storage-limits';

const BACKUP_KEY = 'bordados_last_backup';
const BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BUCKET = 'backups';
export const BACKUP_STATUS_KEY = 'bordados_backup_status';
export interface BackupStatus {
  state: 'success' | 'error';
  at: string;
  message: string;
  source: 'cloud-team';
}
export function getBackupStatus(): BackupStatus | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(BACKUP_STATUS_KEY);
  return raw ? JSON.parse(raw) : null;
}

function getLastBackup(): number {
  if (typeof window === 'undefined') return 0;
  return parseInt(localStorage.getItem(BACKUP_KEY) || '0', 10);
}

function setLastBackup(): void {
  try {
    localStorage.setItem(BACKUP_KEY, String(Date.now()));
  } catch {}
}

function persistStatus(owner: string | null, status: BackupStatus): void {
  try {
    if (owner === localStorage.getItem(ACTIVE_USER_KEY))
      localStorage.setItem(BACKUP_STATUS_KEY, JSON.stringify(status));
  } catch {}
}

/**
 * Check if a backup is due and upload to Supabase Storage.
 * Keeps last 4 backups (rolling monthly).
 * Silent — never blocks UI or throws.
 */
export async function autoBackupIfDue(force = false): Promise<BackupStatus | null> {
  let owner: string | null = null;
  try {
    owner = localStorage.getItem(ACTIVE_USER_KEY);
    const last = getLastBackup();
    if (!force && Date.now() - last < BACKUP_INTERVAL_MS) return null;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Sesion requerida para respaldar');

    await flushPendingSync();
    if (hasPendingSync()) throw new Error('Hay cambios pendientes; sincroniza antes de respaldar el equipo');
    const json = await exportCloudBackup();
    const date = new Date().toISOString().split('T')[0];
    const fileName = `${user.id}/${date}.json`;

    const backupBlob = new Blob([json], { type: 'application/json' });
    validateStorageUpload('backups', backupBlob);

    const { error } = await supabase.storage.from(BUCKET).upload(fileName, backupBlob, {
      upsert: true,
    });

    if (error) throw error;
    if (owner !== localStorage.getItem(ACTIVE_USER_KEY)) throw new Error('La sesion cambio durante el respaldo');

    setLastBackup();

    // Clean old backups — keep last 4
    const { data: files } = await supabase.storage
      .from(BUCKET)
      .list(user.id, { sortBy: { column: 'created_at', order: 'desc' } });

    if (files && files.length > 4) {
      const toDelete = files.slice(4).map((f) => `${user.id}/${f.name}`);
      await supabase.storage.from(BUCKET).remove(toDelete);
    }
    const status: BackupStatus = {
      state: 'success',
      at: new Date().toISOString(),
      source: 'cloud-team',
      message: 'Respaldo de registros del equipo confirmado en la nube',
    };
    persistStatus(owner, status);
    return status;
  } catch (error) {
    const status: BackupStatus = {
      state: 'error',
      at: new Date().toISOString(),
      source: 'cloud-team',
      message: error instanceof Error ? error.message : 'No se pudo crear el respaldo',
    };
    persistStatus(owner, status);
    return status;
  }
}

/**
 * List available backups for the current user.
 */
export async function listBackups(): Promise<{ name: string; date: string; size: number }[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: files, error } = await supabase.storage
    .from(BUCKET)
    .list(user.id, { sortBy: { column: 'created_at', order: 'desc' } });

  if (error || !files) return [];

  return files
    .filter((f) => isSafeBackupFileName(f.name))
    .map((f) => ({
      name: f.name,
      date: f.name.replace('.json', ''),
      size: f.metadata?.size || 0,
    }));
}

/**
 * Download a specific backup.
 */
export async function downloadBackup(fileName: string): Promise<string | null> {
  if (!isSafeBackupFileName(fileName)) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.storage.from(BUCKET).download(`${user.id}/${fileName}`);

  if (error || !data) return null;
  return await data.text();
}

/**
 * Download and validate a backup without importing it.
 * This is a dry-run restore check for production confidence.
 */
export async function testBackupRestore(fileName: string): Promise<BackupPreview | null> {
  const json = await downloadBackup(fileName);
  if (!json) return null;
  return previewImportData(json);
}
