import { expect, it } from 'vitest';
import { invoiceCandidates, normalizedUuid } from '@/lib/invoice-matching';
import type { DatosCFDI } from '@/lib/cfdi';
import type { Egreso, Proveedor } from '@/lib/types';

const cfdi = { total: 1160, subtotal: 1000, fecha: '2026-10-25', rfcEmisor: 'AAA010101AAA' } as DatosCFDI;
const expense = { id: 'one', montoTotal: 1160, monto: 1000, fecha: cfdi.fecha, proveedorId: 'supplier' } as Egreso;
it('never suggests replacing another UUID or existing evidence by matching the amount', () => {
  expect(
    invoiceCandidates(cfdi, [
      { ...expense, uuidCFDI: 'other' },
      { ...expense, pdfUrl: 'old.pdf' },
    ]),
  ).toEqual([]);
});
it('returns all possible candidates for explicit selection, never picks the first', () => {
  expect(invoiceCandidates(cfdi, [expense, { ...expense, id: 'two' }])).toHaveLength(2);
});
it('rejects mismatched supplier RFC, invalid dates, and already claimed rows', () => {
  expect(invoiceCandidates(cfdi, [expense], new Set(), [{ id: 'supplier', rfc: 'OTHER' } as Proveedor])).toEqual([]);
  expect(invoiceCandidates(cfdi, [{ ...expense, fecha: '' }])).toEqual([]);
  expect(invoiceCandidates(cfdi, [expense], new Set(['one']))).toEqual([]);
  expect(normalizedUuid(' ab-c ')).toBe('AB-C');
});
