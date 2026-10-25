'use client';

import { ACTIVE_USER_KEY, ACTIVE_TEAM_KEY, getConfig, getIngresos, getEgresos } from './store';
import { addIngreso, addEgreso, updateIngreso, updateEgreso } from './store-sync';
import { uploadFacturaFiles } from './cfdi-storage';
import { confirmInvoiceSync } from './invoice-replacement';
import { invoiceCandidates, normalizedUuid } from './invoice-matching';
import { readSyncQueue } from './sync-queue';
import { mapFormaPago, type DatosCFDI } from './cfdi';
import type { Ingreso, Egreso } from './types';

export interface InvoiceImport {
  id: string;
  tipo: 'ingreso' | 'egreso';
  mode: 'new' | 'matched' | 'attach';
  matchId?: string;
  cfdi: DatosCFDI;
  xmlFile: File;
  pdfFile?: File;
}

export async function saveImportedInvoice(input: InvoiceImport): Promise<void> {
  const { tipo, cfdi } = input;
  const owner = localStorage.getItem(ACTIVE_USER_KEY);
  const team = localStorage.getItem(ACTIVE_TEAM_KEY);
  const id = input.mode === 'new' ? input.id : input.matchId;
  if (!id) throw new Error('Selecciona el registro para vincular');
  // Drain the same persistent operation before writing again after a lost response.
  await confirmInvoiceSync(tipo, id);
  const read = () => (tipo === 'ingreso' ? getIngresos() : getEgresos());
  const existing = read().find((row) => row.id === id);
  const uuid = normalizedUuid(cfdi.uuid);
  if (
    !uuid ||
    cfdi.tipoComprobante !== 'I' ||
    cfdi.moneda !== 'MXN' ||
    ![cfdi.total, cfdi.subtotal, cfdi.iva, cfdi.descuento || 0].every((n) => Number.isFinite(n) && n >= 0) ||
    (cfdi.descuento || 0) > cfdi.subtotal
  )
    throw new Error('CFDI no compatible o importes invalidos');
  const rfc = normalizedUuid(getConfig().rfc);
  if (rfc && normalizedUuid(tipo === 'ingreso' ? cfdi.rfcEmisor : cfdi.rfcReceptor) !== rfc)
    throw new Error('El RFC no corresponde al tipo de registro seleccionado');
  if ([...getIngresos(), ...getEgresos()].some((row) => row.id !== id && normalizedUuid(row.uuidCFDI) === uuid))
    throw new Error('El UUID ya esta vinculado a otro registro');
  if (input.mode !== 'new' && !existing) throw new Error('El registro ya no existe');
  if (existing?.uuidCFDI && normalizedUuid(existing.uuidCFDI) !== uuid) throw new Error('El registro tiene otro UUID');
  if (input.mode === 'new' && existing && normalizedUuid(existing.uuidCFDI) !== uuid)
    throw new Error('El identificador de importacion ya esta ocupado');
  if (input.mode === 'attach' && normalizedUuid(existing?.uuidCFDI) !== uuid)
    throw new Error('El UUID del registro cambio');
  if (existing?.xmlUrl && normalizedUuid(existing.uuidCFDI) === uuid && (!input.pdfFile || existing.pdfUrl)) return;
  if (input.mode === 'matched' && existing && !existing.uuidCFDI && !invoiceCandidates(cfdi, [existing]).length)
    throw new Error('El registro ya no coincide con el importe y fecha de la factura');
  const uploaded = await uploadFacturaFiles(uuid, input.xmlFile, input.pdfFile);
  if (owner !== localStorage.getItem(ACTIVE_USER_KEY) || team !== localStorage.getItem(ACTIVE_TEAM_KEY))
    throw new Error('La sesion cambio');
  if (
    JSON.stringify(existing) !== JSON.stringify(read().find((row) => row.id === id)) ||
    readSyncQueue().some((op) => op.table === `${tipo}s` && op.recordId === id)
  )
    throw new Error('El registro cambio durante la carga. Revisa antes de continuar.');
  const files = {
    factura: true,
    uuidCFDI: uuid,
    numeroFactura: existing?.numeroFactura || uuid,
    xmlUrl: existing?.xmlUrl || uploaded.xmlPath,
    pdfUrl: existing?.pdfUrl || uploaded.pdfPath,
  };
  if (existing) {
    const next =
      input.mode === 'attach'
        ? { ...existing, ...files }
        : {
            ...existing,
            ...files,
            monto: cfdi.subtotal - (cfdi.descuento || 0),
            iva: cfdi.iva,
            montoTotal: cfdi.total,
          };
    if (tipo === 'ingreso') updateIngreso(next as Ingreso);
    else updateEgreso(next as Egreso);
  } else {
    const common = {
      id,
      fecha: cfdi.fecha,
      descripcion: (cfdi.conceptos.map((c) => c.descripcion).join(', ') || cfdi.nombreEmisor).substring(0, 100),
      monto: cfdi.subtotal - (cfdi.descuento || 0),
      iva: cfdi.iva,
      montoTotal: cfdi.total,
      formaPago: mapFormaPago(cfdi.formaPago),
      ...files,
      notas: `Importado desde XML. Emisor: ${cfdi.nombreEmisor}`,
      createdAt: new Date().toISOString(),
    };
    if (tipo === 'ingreso') addIngreso({ ...common, clienteId: '', concepto: 'otro' });
    else addEgreso({ ...common, proveedorId: '', categoria: 'otro', subcategoria: '' });
  }
  await confirmInvoiceSync(tipo, id);
}
