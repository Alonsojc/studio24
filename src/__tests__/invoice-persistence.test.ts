import { beforeEach, expect, it, vi } from 'vitest';
import { saveImportedInvoice, type InvoiceImport } from '@/lib/invoice-import';
import { replaceInvoice } from '@/lib/invoice-replacement';
import { ACTIVE_TEAM_KEY, ACTIVE_USER_KEY, KEYS, getIngresos, getEgresos } from '@/lib/store';
import type { Ingreso, Egreso } from '@/lib/types';

const api = vi.hoisted(() => ({
  upload: vi.fn(),
  flush: vi.fn(),
  queue: vi.fn(),
  parse: vi.fn(),
  add: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@/lib/cfdi-storage', () => ({ uploadFacturaFiles: api.upload }));
vi.mock('@/lib/cfdi', async (original) => ({
  ...(await original<typeof import('@/lib/cfdi')>()),
  parseXMLFile: api.parse,
}));
vi.mock('@/lib/sync-flush', () => ({ flushPendingSync: api.flush }));
vi.mock('@/lib/sync-queue', () => ({ readSyncQueue: api.queue }));
vi.mock('@/lib/store-sync', () => ({
  addIngreso: api.add,
  addEgreso: api.add,
  updateIngreso: api.update,
  updateEgreso: api.update,
}));
const input: InvoiceImport = {
  id: 'stable-invoice-id',
  tipo: 'egreso',
  mode: 'new',
  xmlFile: new File(['xml'], 'invoice.xml'),
  cfdi: {
    uuid: 'invoice-uuid',
    rfcEmisor: 'SUPPLIER',
    rfcReceptor: 'BUSINESS',
    nombreEmisor: 'Proveedor',
    nombreReceptor: 'Negocio',
    fecha: '2026-10-25',
    subtotal: 1000,
    descuento: 100,
    iva: 144,
    total: 1044,
    moneda: 'MXN',
    tipoComprobante: 'I',
    formaPago: '03',
    metodoPago: 'PUE',
    usoCFDI: 'G03',
    conceptos: [],
  },
};
const existing = () =>
  ({
    id: 'record',
    fecha: '2026-10-25',
    descripcion: 'Original',
    monto: 900,
    iva: 144,
    montoTotal: 1044,
    uuidCFDI: 'OLD-UUID',
    xmlUrl: 'team/old.xml',
    pdfUrl: 'team/old.pdf',
  }) as Egreso;
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  localStorage.setItem(ACTIVE_USER_KEY, 'owner');
  localStorage.setItem(ACTIVE_TEAM_KEY, 'team');
  localStorage.setItem(KEYS.config, JSON.stringify({ rfc: 'BUSINESS' }));
  api.parse.mockResolvedValue(input.cfdi);
  api.flush.mockResolvedValue(0);
  api.queue.mockReturnValue([]);
  api.upload.mockResolvedValue({ xmlPath: 'team/new.xml', pdfPath: 'team/new.pdf' });
  api.add.mockImplementation((row: Ingreso | Egreso) =>
    localStorage.setItem(KEYS.egresos, JSON.stringify([...getEgresos(), row])),
  );
  api.update.mockImplementation((row: Egreso) =>
    localStorage.setItem(KEYS.egresos, JSON.stringify(getEgresos().map((r) => (r.id === row.id ? row : r)))),
  );
});
it('creates a net amount after discounts and reuses the same record after a lost confirmation', async () => {
  api.flush.mockResolvedValueOnce(0).mockRejectedValueOnce(new Error('network'));
  await expect(saveImportedInvoice(input)).rejects.toThrow('network');
  expect(getEgresos()[0]).toMatchObject({ id: input.id, monto: 900, iva: 144, montoTotal: 1044 });
  await saveImportedInvoice(input);
  expect(getEgresos()).toHaveLength(1);
  expect(api.add).toHaveBeenCalledOnce();
  expect(api.upload).toHaveBeenCalledOnce();
});
it('does not identify an unrelated invoice by a shared total and date', async () => {
  localStorage.setItem(KEYS.egresos, JSON.stringify([existing()]));
  await expect(saveImportedInvoice({ ...input, mode: 'matched', matchId: 'record' })).rejects.toThrow('otro UUID');
  expect(api.upload).not.toHaveBeenCalled();
});
it('rejects a duplicate UUID owned by another record', async () => {
  localStorage.setItem(KEYS.egresos, JSON.stringify([{ ...existing(), uuidCFDI: input.cfdi.uuid }]));
  await expect(saveImportedInvoice(input)).rejects.toThrow('otro registro');
  expect(api.add).not.toHaveBeenCalled();
});
it('does not replace evidence when any new upload fails', async () => {
  localStorage.setItem(KEYS.egresos, JSON.stringify([existing()]));
  api.upload.mockRejectedValue(new Error('PDF upload failed'));
  await expect(replaceInvoice('egreso', 'record', input.xmlFile, new File(['pdf'], 'invoice.pdf'))).rejects.toThrow(
    'upload failed',
  );
  expect(getEgresos()[0]).toEqual(existing());
  expect(api.update).not.toHaveBeenCalled();
});
it('requires the new PDF when the old PDF belongs to a different UUID', async () => {
  localStorage.setItem(KEYS.egresos, JSON.stringify([existing()]));
  await expect(replaceInvoice('egreso', 'record', input.xmlFile)).rejects.toThrow('PDF');
  expect(api.upload).not.toHaveBeenCalled();
});
it('replaces paths without changing historical amounts and waits for confirmation', async () => {
  localStorage.setItem(KEYS.egresos, JSON.stringify([existing()]));
  await replaceInvoice('egreso', 'record', input.xmlFile, new File(['pdf'], 'invoice.pdf'));
  expect(getEgresos()[0]).toMatchObject({
    monto: 900,
    iva: 144,
    montoTotal: 1044,
    xmlUrl: 'team/new.xml',
    pdfUrl: 'team/new.pdf',
  });
  expect(api.flush).toHaveBeenCalledTimes(2);
});
it.each(['import', 'replace'])('preserves a concurrent local edit during %s', async (mode) => {
  const row = { ...existing(), uuidCFDI: '', xmlUrl: '', pdfUrl: '' };
  localStorage.setItem(KEYS.egresos, JSON.stringify([row]));
  api.upload.mockImplementation(async () => {
    localStorage.setItem(KEYS.egresos, JSON.stringify([{ ...row, descripcion: 'Concurrent edit' }]));
    return { xmlPath: 'team/new.xml', pdfPath: '' };
  });
  const run =
    mode === 'import'
      ? saveImportedInvoice({ ...input, mode: 'matched', matchId: 'record' })
      : replaceInvoice('egreso', 'record', input.xmlFile);
  await expect(run).rejects.toThrow('cambio durante');
  expect(getEgresos()[0].descripcion).toBe('Concurrent edit');
  expect(api.update).not.toHaveBeenCalled();
});
it('never overwrites a pending conflict', async () => {
  api.queue.mockReturnValue([{ table: 'egresos', recordId: input.id, lastError: 'CONFLICT' }]);
  await expect(saveImportedInvoice(input)).rejects.toThrow('pendiente');
  expect(api.upload).not.toHaveBeenCalled();
});
it('does not write files into another team cache if the session changes', async () => {
  api.upload.mockImplementation(async () => {
    localStorage.setItem(ACTIVE_TEAM_KEY, 'other');
    return { xmlPath: 'team/new.xml', pdfPath: '' };
  });
  await expect(saveImportedInvoice(input)).rejects.toThrow('sesion');
  expect(api.add).not.toHaveBeenCalled();
  expect(getIngresos()).toEqual([]);
});
it('validates the RFC and finite totals before uploading', async () => {
  await expect(saveImportedInvoice({ ...input, tipo: 'ingreso' })).rejects.toThrow('RFC');
  await expect(saveImportedInvoice({ ...input, cfdi: { ...input.cfdi, total: NaN } })).rejects.toThrow('importes');
  expect(api.upload).not.toHaveBeenCalled();
});
