import type { DatosCFDI } from './cfdi';
import type { Egreso, Ingreso, Proveedor } from './types';

export const normalizedUuid = (value?: string) => (value || '').trim().toUpperCase();

export function invoiceCandidates(
  cfdi: DatosCFDI,
  records: (Ingreso | Egreso)[],
  excluded: Set<string> = new Set(),
  proveedores: Proveedor[] = [],
) {
  return records.filter((record) => {
    if (record.uuidCFDI || record.xmlUrl || record.pdfUrl || excluded.has(record.id)) return false;
    if (Math.abs(record.montoTotal - cfdi.total) > 0.01) return false;
    const days = Math.abs(Date.parse(record.fecha) - Date.parse(cfdi.fecha)) / 86400000;
    if (!Number.isFinite(days) || days > 7) return false;
    const rfc = 'proveedorId' in record ? proveedores.find((p) => p.id === record.proveedorId)?.rfc : '';
    return !rfc || normalizedUuid(rfc) === normalizedUuid(cfdi.rfcEmisor);
  });
}
