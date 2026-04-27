import { describe, expect, it } from 'vitest';
import { STORAGE_LIMITS, isSafeBackupFileName, validateStorageUpload } from '@/lib/storage-limits';

describe('límites de Storage', () => {
  it('acepta tipos esperados por bucket', () => {
    expect(() => validateStorageUpload('photos', new Blob(['x'], { type: 'image/jpeg' }))).not.toThrow();
    expect(() => validateStorageUpload('facturas', new Blob(['x'], { type: 'application/pdf' }))).not.toThrow();
    expect(() => validateStorageUpload('backups', new Blob(['{}'], { type: 'application/json' }))).not.toThrow();
  });

  it('rechaza tipos no permitidos', () => {
    expect(() => validateStorageUpload('photos', new Blob(['x'], { type: 'text/html' }))).toThrow('Tipo');
    expect(() => validateStorageUpload('facturas', new Blob(['x'], { type: 'image/png' }))).toThrow('Tipo');
  });

  it('rechaza archivos demasiado grandes', () => {
    const oversized = new Blob([new Uint8Array(STORAGE_LIMITS.photos.maxBytes + 1)], { type: 'image/jpeg' });
    expect(() => validateStorageUpload('photos', oversized)).toThrow('límite');
  });

  it('solo acepta nombres de respaldo generados por la app', () => {
    expect(isSafeBackupFileName('2026-04-27.json')).toBe(true);
    expect(isSafeBackupFileName('../otra-carpeta.json')).toBe(false);
    expect(isSafeBackupFileName('2026-04-27.json/evil')).toBe(false);
    expect(isSafeBackupFileName('backup.json')).toBe(false);
  });
});
