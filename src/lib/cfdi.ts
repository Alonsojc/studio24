'use client';

/**
 * Parser de XML CFDI (Comprobante Fiscal Digital por Internet)
 * Extrae datos relevantes de facturas del SAT mexicano.
 */

export interface DatosCFDI {
  uuid: string;
  fecha: string;
  rfcEmisor: string;
  nombreEmisor: string;
  rfcReceptor: string;
  nombreReceptor: string;
  subtotal: number;
  iva: number;
  total: number;
  moneda: string;
  formaPago: string;
  metodoPago: string;
  usoCFDI: string;
  tipoComprobante: string; // 'I' ingreso, 'E' egreso, 'P' pago
  conceptos: { descripcion: string; cantidad: number; valorUnitario: number; importe: number }[];
}

export function parseCFDI(xmlString: string): DatosCFDI | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');

    // Handle namespace — CFDI 3.3 and 4.0
    const comp =
      doc.getElementsByTagNameNS('http://www.sat.gob.mx/cfd/4', 'Comprobante')[0] ||
      doc.getElementsByTagNameNS('http://www.sat.gob.mx/cfd/3', 'Comprobante')[0];

    if (!comp) return null;

    const attr = (el: Element, name: string) => el.getAttribute(name) || el.getAttribute(`cfdi:${name}`) || '';
    const numAttr = (el: Element, name: string) => parseFloat(attr(el, name)) || 0;

    // Emisor
    const emisor =
      doc.getElementsByTagNameNS('http://www.sat.gob.mx/cfd/4', 'Emisor')[0] ||
      doc.getElementsByTagNameNS('http://www.sat.gob.mx/cfd/3', 'Emisor')[0];

    // Receptor
    const receptor =
      doc.getElementsByTagNameNS('http://www.sat.gob.mx/cfd/4', 'Receptor')[0] ||
      doc.getElementsByTagNameNS('http://www.sat.gob.mx/cfd/3', 'Receptor')[0];

    // UUID from TimbreFiscalDigital
    const timbre =
      doc.getElementsByTagNameNS('http://www.sat.gob.mx/TimbreFiscalDigital', 'TimbreFiscalDigital')[0];

    // IVA from Traslados
    let iva = 0;
    const traslados = doc.getElementsByTagName('cfdi:Traslado');
    if (traslados.length === 0) {
      const traslados2 = doc.querySelectorAll('[Impuesto="002"]');
      for (let i = 0; i < traslados2.length; i++) {
        iva += parseFloat(traslados2[i].getAttribute('Importe') || '0');
      }
    } else {
      for (let i = 0; i < traslados.length; i++) {
        const imp = traslados[i].getAttribute('Impuesto');
        if (imp === '002') { // 002 = IVA
          iva += parseFloat(traslados[i].getAttribute('Importe') || '0');
        }
      }
    }

    // Conceptos
    const conceptoNodes =
      doc.getElementsByTagNameNS('http://www.sat.gob.mx/cfd/4', 'Concepto').length > 0
        ? doc.getElementsByTagNameNS('http://www.sat.gob.mx/cfd/4', 'Concepto')
        : doc.getElementsByTagNameNS('http://www.sat.gob.mx/cfd/3', 'Concepto');

    const conceptos: DatosCFDI['conceptos'] = [];
    for (let i = 0; i < conceptoNodes.length; i++) {
      const c = conceptoNodes[i];
      conceptos.push({
        descripcion: attr(c, 'Descripcion'),
        cantidad: numAttr(c, 'Cantidad'),
        valorUnitario: numAttr(c, 'ValorUnitario'),
        importe: numAttr(c, 'Importe'),
      });
    }

    const fecha = attr(comp, 'Fecha').split('T')[0]; // YYYY-MM-DD

    return {
      uuid: timbre ? attr(timbre, 'UUID') : '',
      fecha,
      rfcEmisor: emisor ? attr(emisor, 'Rfc') : '',
      nombreEmisor: emisor ? attr(emisor, 'Nombre') : '',
      rfcReceptor: receptor ? attr(receptor, 'Rfc') : '',
      nombreReceptor: receptor ? attr(receptor, 'Nombre') : '',
      subtotal: numAttr(comp, 'SubTotal'),
      iva: Math.round(iva * 100) / 100,
      total: numAttr(comp, 'Total'),
      moneda: attr(comp, 'Moneda') || 'MXN',
      formaPago: attr(comp, 'FormaPago'),
      metodoPago: attr(comp, 'MetodoPago'),
      usoCFDI: receptor ? attr(receptor, 'UsoCFDI') : '',
      tipoComprobante: attr(comp, 'TipoDeComprobante'),
      conceptos,
    };
  } catch {
    return null;
  }
}

/**
 * Lee un archivo XML y lo parsea como CFDI
 */
export function parseXMLFile(file: File): Promise<DatosCFDI | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const xml = e.target?.result as string;
      resolve(parseCFDI(xml));
    };
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
}

/**
 * Mapea FormaPago del SAT a nuestro tipo
 */
export function mapFormaPago(satCode: string): 'efectivo' | 'tarjeta' | 'transferencia' | 'otro' {
  const map: Record<string, 'efectivo' | 'tarjeta' | 'transferencia' | 'otro'> = {
    '01': 'efectivo',
    '02': 'efectivo', // cheque
    '03': 'transferencia',
    '04': 'tarjeta', // tarjeta de crédito
    '28': 'tarjeta', // tarjeta de débito
    '99': 'otro', // por definir
  };
  return map[satCode] || 'otro';
}
