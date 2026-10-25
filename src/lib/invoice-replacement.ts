'use client';

import { ACTIVE_USER_KEY, ACTIVE_TEAM_KEY, getConfig, getIngresos, getEgresos } from './store';
import { updateIngreso, updateEgreso } from './store-sync';
import { parseXMLFile } from './cfdi';
import { uploadFacturaFiles } from './cfdi-storage';
import { normalizedUuid } from './invoice-matching';
import { flushPendingSync } from './sync-flush';
import { readSyncQueue } from './sync-queue';

export async function confirmInvoiceSync(tipo: 'ingreso' | 'egreso', id: string) {
  const owner = localStorage.getItem(ACTIVE_USER_KEY);
  const team = localStorage.getItem(ACTIVE_TEAM_KEY);
  if (!owner || !team) throw new Error('Sesion requerida');
  await flushPendingSync();
  if (owner !== localStorage.getItem(ACTIVE_USER_KEY) || team !== localStorage.getItem(ACTIVE_TEAM_KEY))
    throw new Error('La sesion cambio');
  if (readSyncQueue().some((op) => op.table === `${tipo}s` && op.recordId === id))
    throw new Error('La factura sigue pendiente de confirmar en nube. Reintenta la sincronizacion.');
}

export async function replaceInvoice(tipo: 'ingreso' | 'egreso', id: string, xml: File, pdf?: File) {
  const owner = localStorage.getItem(ACTIVE_USER_KEY);
  const team = localStorage.getItem(ACTIVE_TEAM_KEY);
  if (!owner) throw new Error('Sesion requerida');
  await confirmInvoiceSync(tipo, id);
  const record = (tipo === 'ingreso' ? getIngresos() : getEgresos()).find((row) => row.id === id);
  if (!record) throw new Error('El registro ya no existe');
  const cfdi = await parseXMLFile(xml);
  if (!cfdi?.uuid || cfdi.tipoComprobante !== 'I' || cfdi.moneda !== 'MXN' || !Number.isFinite(cfdi.total))
    throw new Error('Selecciona un CFDI de ingreso timbrado en MXN.');
  if (Math.abs(cfdi.total - record.montoTotal) > 0.01)
    throw new Error('El total del XML no coincide con el registro. Revisa el importe antes de reemplazarlo.');
  const rfc = normalizedUuid(getConfig().rfc);
  if (!rfc || normalizedUuid(tipo === 'ingreso' ? cfdi.rfcEmisor : cfdi.rfcReceptor) !== rfc)
    throw new Error('El RFC del XML no corresponde al negocio y tipo de registro.');
  if (
    [...getIngresos(), ...getEgresos()].some(
      (row) => row.id !== id && normalizedUuid(row.uuidCFDI) === normalizedUuid(cfdi.uuid),
    )
  )
    throw new Error('Este UUID ya pertenece a otro registro.');
  if (!pdf && normalizedUuid(record.uuidCFDI) !== normalizedUuid(cfdi.uuid) && record.pdfUrl)
    throw new Error('Selecciona tambien el PDF de la nueva factura.');
  const uploaded = await uploadFacturaFiles(cfdi.uuid, xml, pdf);
  if (owner !== localStorage.getItem(ACTIVE_USER_KEY) || team !== localStorage.getItem(ACTIVE_TEAM_KEY))
    throw new Error('La sesion cambio');
  const latest = (tipo === 'ingreso' ? getIngresos() : getEgresos()).find((row) => row.id === id);
  if (
    JSON.stringify(record) !== JSON.stringify(latest) ||
    readSyncQueue().some((op) => op.table === `${tipo}s` && op.recordId === id)
  )
    throw new Error('El registro cambio durante la carga. Revisa los cambios antes de reemplazarlo.');
  // Keep immutable old objects. The audited record update retains their paths;
  // no network/validation failure should destroy the previous evidence.
  const next = {
    ...record,
    factura: true,
    uuidCFDI: normalizedUuid(cfdi.uuid),
    numeroFactura: normalizedUuid(cfdi.uuid),
    xmlUrl: uploaded.xmlPath,
    pdfUrl: uploaded.pdfPath || record.pdfUrl || '',
  };
  if (tipo === 'ingreso') updateIngreso(next as ReturnType<typeof getIngresos>[number]);
  else updateEgreso(next as ReturnType<typeof getEgresos>[number]);
  await confirmInvoiceSync(tipo, id);
}
