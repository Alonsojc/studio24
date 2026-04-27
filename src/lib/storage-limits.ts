export const STORAGE_LIMITS = {
  backups: {
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: ['application/json', 'text/plain'],
  },
  facturas: {
    maxBytes: 10 * 1024 * 1024,
    mimeTypes: ['application/xml', 'text/xml', 'application/pdf'],
  },
  photos: {
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
} as const;

export type StorageBucketName = keyof typeof STORAGE_LIMITS;

export function validateStorageUpload(bucket: StorageBucketName, file: Pick<Blob, 'size' | 'type'>): void {
  const limit = STORAGE_LIMITS[bucket];
  if (file.size > limit.maxBytes) {
    throw new Error(`El archivo excede el límite de ${Math.round(limit.maxBytes / 1024 / 1024)} MB`);
  }
  if (file.type && !(limit.mimeTypes as readonly string[]).includes(file.type)) {
    throw new Error('Tipo de archivo no permitido');
  }
}

export function isSafeBackupFileName(fileName: string): boolean {
  return /^\d{4}-\d{2}-\d{2}\.json$/.test(fileName);
}
