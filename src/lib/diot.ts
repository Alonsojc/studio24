/**
 * DIOT — Declaración Informativa de Operaciones con Terceros
 *
 * Agrupa los egresos con factura por proveedor y mes y genera:
 *  - Un resumen (tabla) para consulta en pantalla.
 *  - Una exportación CSV amigable para el contador.
 *  - Un TXT "formato masivo" con campos separados por pipe (|) que
 *    el contador puede subir al portal del SAT (DIOT masivo). El
 *    formato oficial cambia de vez en cuando; si el SAT lo modifica,
 *    ajustar aquí las columnas de `buildTxtRow`.
 *
 * Supuestos/defaults:
 *  - Tipo de Tercero: 04 (proveedor nacional) salvo que el proveedor
 *    tenga un RFC extranjero (lo dejamos como 05 si el RFC es XEXX010101000 o similar).
 *  - Tipo de Operación: 85 (otros) por default.
 *  - IVA 16% es la tasa general; si un egreso tenía factura sin IVA
 *    (tasa 0% / exento) lo registramos en la columna correspondiente.
 */

import type { Egreso, Proveedor } from './types';

export type DiotTipoTercero = '04' | '05' | '15';
export type DiotTipoOperacion = '03' | '06' | '85';

export interface DiotRow {
  proveedorId: string;
  nombre: string;
  rfc: string;
  tipoTercero: DiotTipoTercero;
  tipoOperacion: DiotTipoOperacion;
  valorActos16: number; // subtotal pagado a proveedor con IVA 16%
  ivaAcreditable16: number; // IVA 16% acreditable
  valorActos0: number; // subtotal pagado a proveedor con IVA 0%
  valorActosExentos: number; // subtotal pagado con IVA exento
  ivaRetenido: number; // IVA retenido al proveedor (MVP: 0)
  totalPagado: number; // total pagado al proveedor (incluye IVA)
  operaciones: number; // cantidad de egresos que componen el renglón
}

const RFC_EXTRANJERO_GENERICO = 'XEXX010101000';
const RFC_NACIONAL_GENERICO = 'XAXX010101000';

function guessTipoTercero(rfc: string): DiotTipoTercero {
  const clean = (rfc || '').toUpperCase().trim();
  if (!clean || clean === RFC_NACIONAL_GENERICO) return '15'; // global / público en general
  if (clean === RFC_EXTRANJERO_GENERICO) return '05';
  return '04';
}

/**
 * Filtra y agrupa egresos por proveedor para un mes (YYYY-MM) dado.
 * Solo considera egresos con factura; los demás no van al DIOT.
 */
export function buildDiotRows(
  egresos: Egreso[],
  proveedores: Proveedor[],
  yearMonth: string,
): { rows: DiotRow[]; sinProveedor: Egreso[]; sinRFC: Egreso[] } {
  const provById = new Map(proveedores.map((p) => [p.id, p]));

  const matchesMonth = (e: Egreso) => e.fecha && e.fecha.startsWith(yearMonth + '-');

  const facturados = egresos.filter((e) => e.factura && matchesMonth(e));
  const sinProveedor: Egreso[] = [];
  const sinRFC: Egreso[] = [];
  const byProv = new Map<string, DiotRow>();

  for (const e of facturados) {
    const prov = e.proveedorId ? provById.get(e.proveedorId) : undefined;
    if (!prov) {
      sinProveedor.push(e);
      continue;
    }
    if (!prov.rfc) {
      sinRFC.push(e);
      continue;
    }
    const key = prov.id;
    const existing = byProv.get(key) || {
      proveedorId: prov.id,
      nombre: prov.nombre,
      rfc: prov.rfc.toUpperCase(),
      tipoTercero: guessTipoTercero(prov.rfc),
      tipoOperacion: '85' as DiotTipoOperacion,
      valorActos16: 0,
      ivaAcreditable16: 0,
      valorActos0: 0,
      valorActosExentos: 0,
      ivaRetenido: 0,
      totalPagado: 0,
      operaciones: 0,
    };
    const subtotal = e.monto;
    const iva = e.iva;
    if (iva > 0) {
      existing.valorActos16 += subtotal;
      existing.ivaAcreditable16 += iva;
    } else {
      // Sin IVA explícito: asumimos tasa 0% (conservador)
      existing.valorActos0 += subtotal;
    }
    existing.totalPagado += e.montoTotal;
    existing.operaciones += 1;
    byProv.set(key, existing);
  }

  const rows = Array.from(byProv.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  return { rows, sinProveedor, sinRFC };
}

/**
 * Genera un CSV amigable para humanos (el contador).
 */
export function diotCsv(rows: DiotRow[]): string {
  const headers = [
    'RFC',
    'Nombre',
    'Tipo Tercero',
    'Tipo Operación',
    'Valor actos 16%',
    'IVA acreditable 16%',
    'Valor actos 0%',
    'Valor actos exentos',
    'IVA retenido',
    'Total pagado',
    'Operaciones',
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    const escape = (v: string) => {
      if (v.includes(',') || v.includes('"')) return `"${v.replace(/"/g, '""')}"`;
      return v;
    };
    lines.push(
      [
        r.rfc,
        escape(r.nombre),
        r.tipoTercero,
        r.tipoOperacion,
        r.valorActos16.toFixed(2),
        r.ivaAcreditable16.toFixed(2),
        r.valorActos0.toFixed(2),
        r.valorActosExentos.toFixed(2),
        r.ivaRetenido.toFixed(2),
        r.totalPagado.toFixed(2),
        String(r.operaciones),
      ].join(','),
    );
  }
  return lines.join('\n');
}

/**
 * Genera un TXT en "formato masivo" DIOT: campos separados por pipe,
 * sin header. Cada línea es una operación por tercero.
 *
 * El formato de referencia contiene estos 24 campos (en orden):
 *   1  TipoTercero
 *   2  TipoOperacion
 *   3  RFC
 *   4  NumIdFiscal (extranjero)
 *   5  NombreExtranjero
 *   6  PaisResidencia
 *   7  Nacionalidad
 *   8  ValorActosPagados_Tasa16
 *   9  MontoIVAAcreditable_Tasa16
 *   10 ValorActosPagados_Tasa16_NoAcreditable
 *   11 ValorActosPagados_Tasa8_Frontera
 *   12 MontoIVAAcreditable_Tasa8_Frontera
 *   13 ValorActosPagados_Tasa8_NoAcreditable
 *   14 ValorActosPagados_Tasa0
 *   15 ValorActosPagadosExentos
 *   16 ValorActosImportacion_Tasa16
 *   17 MontoIVAAcreditable_Importacion_Tasa16
 *   18 ValorActosImportacion_Tasa8
 *   19 MontoIVAAcreditable_Importacion_Tasa8
 *   20 ValorActosImportacion_Tasa0_Exento
 *   21 RetencionIVA
 *   22 DevolucionesDescuentosBonificaciones
 *   23 IVA_NoAcreditable
 *   24 ActosNoObjeto
 *
 * El SAT cambia este formato ocasionalmente. Validar con el contador
 * antes de subirlo a la plataforma oficial.
 */
function buildTxtRow(r: DiotRow): string {
  const fields = [
    r.tipoTercero, // 1
    r.tipoOperacion, // 2
    r.rfc, // 3
    '', // 4 NumIdFiscal (extranjero)
    '', // 5 NombreExtranjero
    '', // 6 PaisResidencia
    '', // 7 Nacionalidad
    r.valorActos16.toFixed(0), // 8
    r.ivaAcreditable16.toFixed(0), // 9
    '0', // 10
    '0', // 11
    '0', // 12
    '0', // 13
    r.valorActos0.toFixed(0), // 14
    r.valorActosExentos.toFixed(0), // 15
    '0', // 16
    '0', // 17
    '0', // 18
    '0', // 19
    '0', // 20
    r.ivaRetenido.toFixed(0), // 21
    '0', // 22
    '0', // 23
    '0', // 24
  ];
  return fields.join('|');
}

export function diotTxt(rows: DiotRow[]): string {
  return rows.map(buildTxtRow).join('\n');
}

/** Trigger a browser download of a text blob. */
export function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
