'use client';

import { supabase } from './supabase';
import { getMyTeamId } from './teams';

const BUCKET = 'facturas';

function safeUuid(raw: string): string {
  const clean = raw.replace(/[^a-zA-Z0-9-]/g, '');
  return clean || `sin-uuid-${Date.now()}`;
}

export async function uploadFacturaFiles(
  cfdiUuid: string,
  xmlFile: Blob,
  pdfFile?: Blob,
): Promise<{ xmlPath: string; pdfPath: string }> {
  const teamId = await getMyTeamId();
  if (!teamId) throw new Error('No se encontró el equipo actual');

  const folder = `${teamId}/${safeUuid(cfdiUuid)}`;
  const xmlPath = `${folder}.xml`;
  const { error: xmlError } = await supabase.storage
    .from(BUCKET)
    .upload(xmlPath, xmlFile, { contentType: 'application/xml', upsert: true });
  if (xmlError) throw xmlError;

  let pdfPath = '';
  if (pdfFile) {
    pdfPath = `${folder}.pdf`;
    const { error: pdfError } = await supabase.storage
      .from(BUCKET)
      .upload(pdfPath, pdfFile, { contentType: 'application/pdf', upsert: true });
    if (pdfError) throw pdfError;
  }

  return { xmlPath, pdfPath };
}

export async function getFacturaSignedUrl(path: string): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 5);
  return data?.signedUrl || null;
}

/** Opens the best available factura file in a new tab (prefers PDF, falls back to XML). */
export async function openFacturaFile(record: { pdfUrl?: string; xmlUrl?: string }): Promise<boolean> {
  const path = record.pdfUrl || record.xmlUrl;
  if (!path) return false;
  const url = await getFacturaSignedUrl(path);
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
