import { describe, expect, it } from 'vitest';
import { parseCFDI } from '@/lib/cfdi';

function invoice(version = '4', global = '<cfdi:Traslado Impuesto="002" Importe="160"/>', summary = true) {
  return `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/${version}" SubTotal="1000" Total="1160" Descuento="0" Fecha="2026-10-25T10:00:00">
    <cfdi:Conceptos><cfdi:Concepto Descripcion="Bordado" Importe="1000"><cfdi:Impuestos><cfdi:Traslados>
      <cfdi:Traslado Impuesto="002" Importe="160"/>
    </cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto></cfdi:Conceptos>
    ${summary ? `<cfdi:Impuestos TotalImpuestosTrasladados="240"><cfdi:Traslados>${global}</cfdi:Traslados></cfdi:Impuestos>` : ''}
  </cfdi:Comprobante>`;
}
describe('CFDI taxes', () => {
  it.each(['3', '4'])('counts IVA once for CFDI namespace %s', (version) => {
    expect(parseCFDI(invoice(version))).toMatchObject({ subtotal: 1000, iva: 160, total: 1160 });
  });
  it('does not treat IEPS or exempt IVA as taxable IVA', () => {
    expect(
      parseCFDI(
        invoice('4', '<cfdi:Traslado Impuesto="003" Importe="80"/><cfdi:Traslado Impuesto="002" TipoFactor="Exento"/>'),
      )?.iva,
    ).toBe(0);
  });
  it('sums only IVA in the global summary, across tax rates', () => {
    expect(
      parseCFDI(
        invoice(
          '4',
          '<cfdi:Traslado Impuesto="003" Importe="80"/><cfdi:Traslado Impuesto="002" Importe="160"/><cfdi:Traslado Impuesto="002" Importe="40"/>',
        ),
      )?.iva,
    ).toBe(200);
  });
  it('falls back to concepts only when there is no global summary', () => {
    expect(parseCFDI(invoice('4', '', false))?.iva).toBe(160);
  });
  it('rejects malformed XML instead of importing partially parsed amounts', () => {
    expect(parseCFDI(invoice().replace('</cfdi:Concepto>', ''))).toBeNull();
  });
  it('rejects invalid amounts rather than converting them to zero', () => {
    expect(parseCFDI(invoice().replace('Total="1160"', 'Total="invalid"'))).toBeNull();
    expect(
      parseCFDI(invoice().replace('Importe="160"', 'Importe="NaN"').replace('Importe="160"', 'Importe="NaN"')),
    ).toBeNull();
  });
});
