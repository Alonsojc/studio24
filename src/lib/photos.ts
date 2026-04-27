'use client';

import { supabase } from './supabase';
import { getMyTeamId } from './teams';
import { validateStorageUpload } from './storage-limits';

const BUCKET = 'photos';

/** Path en Storage: <teamId>/<pedidoId>/<photoId>  */
function buildPath(teamId: string, pedidoId: string, photoId: string): string {
  return `${teamId}/${pedidoId}/${photoId}`;
}

export async function uploadPhoto(pedidoId: string, photoId: string, blob: Blob): Promise<void> {
  validateStorageUpload('photos', blob);
  const teamId = await getMyTeamId();
  if (!teamId) throw new Error('No se encontró el equipo actual');
  const path = buildPath(teamId, pedidoId, photoId);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
  if (error) throw error;
}

export async function deletePhoto(pedidoId: string, photoId: string): Promise<void> {
  const teamId = await getMyTeamId();
  if (!teamId) return;
  const path = buildPath(teamId, pedidoId, photoId);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export interface StoredPhoto {
  photoId: string;
  url: string;
}

/** Lista las fotos de un pedido y devuelve signed URLs listas para mostrar. */
export async function listPhotos(pedidoId: string): Promise<StoredPhoto[]> {
  const teamId = await getMyTeamId();
  if (!teamId) return [];
  const folder = `${teamId}/${pedidoId}`;
  const { data: files, error } = await supabase.storage.from(BUCKET).list(folder, { limit: 100 });
  if (error || !files || files.length === 0) return [];

  // Obtén signed URLs para cada archivo (1 hora de validez).
  const paths = files.map((f) => `${folder}/${f.name}`);
  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
  if (!signed) return [];

  return signed.map((s, i) => ({
    photoId: files[i].name,
    url: s.signedUrl || '',
  }));
}
