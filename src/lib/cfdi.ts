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
    // Helper to find elements by local name (ignores namespace prefixes)
    const find = (name: string): Element | null => {
      // Try with namespaces first
      const byNS =
        doc.getElementsByTagNameNS('http://www.sat.gob.mx/cfd/4', name)[0] ||
        doc.getElementsByTagNameNS('http://www.sat.gob.mx/cfd/3', name)[0];
      if (byNS) return byNS;
      // Fallback: try with cfdi: prefix
      const byPrefix = doc.getElementsByTagName(`cfdi:${name}`)[0];
      if (byPrefix) return byPrefix;
      // Fallback: try without prefix
      return doc.getElementsByTagName(name)[0] || null;
    };

    const findAll = (name: string): Element[] => {
      let nodes =
        doc.getElementsByTagNameNS('http://www.sat.gob.mx/cfd/4', name);
      if (nodes.length === 0) nodes = doc.getElementsByTagNameNS('http://www.sat.gob.mx/cfd/3', name);
      if (nodes.length === 0) nodes = doc.getElementsByTagName(`cfdi:${name}`);
      if (nodes.length === 0) nodes = doc.getElementsByTagName(name);
      return Array.from(nodes);
    };

    const comp = find('Comprobante');
    if (!comp) {
      console.warn('[CFDI] No se encontró el nodo Comprobante');
      return null;
    }

    const attr = (el: Element, name: string) => el.getAttribute(name) || el.getAttribute(`cfdi:${name}`) || '';
    const numAttr = (el: Element, name: string) => parseFloat(attr(el, name)) || 0;

    const emisor = find('Emisor');
    const receptor = find('Receptor');

    // UUID from TimbreFiscalDigital
    const timbre =
      doc.getElementsByTagNameNS('http://www.sat.gob.mx/TimbreFiscalDigital', 'TimbreFiscalDigital')[0] ||
      doc.getElementsByTagName('tfd:TimbreFiscalDigital')[0] ||
      doc.getElementsByTagName('TimbreFiscalDigital')[0];

    // IVA from Traslados
    let iva = 0;
    const allTraslados = findAll('Traslado');
    for (const t of allTraslados) {
      const imp = t.getAttribute('Impuesto');
      if (imp === '002') {
        iva += parseFloat(t.getAttribute('Importe') || '0');
      }
    }
    // If no Impuesto attr found, try to get IVA from TotalImpuestosTrasladados
    if (iva === 0) {
      const impuestos = find('Impuestos');
      if (impuestos) {
        iva = parseFloat(impuestos.getAttribute('TotalImpuestosTrasladados') || '0');
      }
    }

    const conceptoNodes = findAll('Concepto');

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
      const result = parseCFDI(xml);
      if (!result) {
        console.warn(`[CFDI] No se pudo parsear ${file.name}. Primeros 200 chars:`, xml.substring(0, 200));
      } else {
        console.log(`[CFDI] Parseado ${file.name}:`, result.uuid, result.total, result.nombreEmisor);
      }
      resolve(result);
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
