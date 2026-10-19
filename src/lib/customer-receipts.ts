'use client';
import { supabase } from './supabase';
import { getMyTeamId } from './teams';
import { validateStorageUpload } from './storage-limits';

const bucket = 'customer-receipts';
export async function uploadCustomerReceipt(operationId: string, file: File): Promise<string> {
  validateStorageUpload(bucket, file);
  const extension = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }[file.type];
  if (!extension || !/^[0-9a-f-]{36}$/i.test(operationId)) throw new Error('Selecciona un comprobante PDF, JPG o PNG');
  const team = await getMyTeamId();
  if (!team) throw new Error('No se pudo verificar el equipo');
  const path = `${team}/${operationId}/receipt.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error('No se pudo subir el comprobante. El adelanto no se registro.');
  return path;
}
export async function openCustomerReceipt(path: string): Promise<void> {
  const target = window.open('', '_blank');
  if (!target) throw new Error('El navegador bloqueo la ventana del comprobante');
  target.opener = null;
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
    if (error || !data?.signedUrl) throw new Error('No se pudo abrir el comprobante');
    target.location.href = data.signedUrl;
  } catch (error) {
    target.close();
    throw error;
  }
}
