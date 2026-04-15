'use client';

import { supabase } from './supabase';
import { exportAllData } from './store';

const BACKUP_KEY = 'bordados_last_backup';
const BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BUCKET = 'backups';

function getLastBackup(): number {
  if (typeof window === 'undefined') return 0;
  return parseInt(localStorage.getItem(BACKUP_KEY) || '0', 10);
}

function setLastBackup(): void {
  localStorage.setItem(BACKUP_KEY, String(Date.now()));
}

/**
 * Check if a backup is due and upload to Supabase Storage.
 * Keeps last 4 backups (rolling monthly).
 * Silent — never blocks UI or throws.
 */
export async function autoBackupIfDue(): Promise<void> {
  try {
    const last = getLastBackup();
    if (Date.now() - last < BACKUP_INTERVAL_MS) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const json = exportAllData();
    const date = new Date().toISOString().split('T')[0];
    const fileName = `${user.id}/${date}.json`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, new Blob([json], { type: 'application/json' }), {
        upsert: true,
      });

    if (error) {
      // Bucket might not exist — that's OK, skip silently
      console.warn('[backup]', error.message);
      return;
    }

    setLastBackup();

    // Clean old backups — keep last 4
    const { data: files } = await supabase.storage
      .from(BUCKET)
      .list(user.id, { sortBy: { column: 'created_at', order: 'desc' } });

    if (files && files.length > 4) {
      const toDelete = files.slice(4).map((f) => `${user.id}/${f.name}`);
      await supabase.storage.from(BUCKET).remove(toDelete);
    }
  } catch {
    // Never crash the app for a backup failure
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

  return files.map((f) => ({
    name: f.name,
    date: f.name.replace('.json', ''),
    size: f.metadata?.size || 0,
  }));
}

/**
 * Download a specific backup.
 */
export async function downloadBackup(fileName: string): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.storage.from(BUCKET).download(`${user.id}/${fileName}`);

  if (error || !data) return null;
  return await data.text();
}
