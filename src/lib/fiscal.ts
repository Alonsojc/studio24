import { Ingreso, Egreso } from './types';

// Tabla ISR mensual 2024 — Persona Física (Art. 96 LISR)
export const TABLA_ISR_MENSUAL = [
  { limInf: 0, limSup: 746.04, cuota: 0, tasa: 0.0192 },
  { limInf: 746.05, limSup: 6332.05, cuota: 14.32, tasa: 0.064 },
  { limInf: 6332.06, limSup: 11128.01, cuota: 371.83, tasa: 0.1088 },
  { limInf: 11128.02, limSup: 12935.82, cuota: 893.63, tasa: 0.16 },
  { limInf: 12935.83, limSup: 15487.71, cuota: 1182.88, tasa: 0.1792 },
  { limInf: 15487.72, limSup: 31236.49, cuota: 1640.18, tasa: 0.2136 },
  { limInf: 31236.5, limSup: 49233.0, cuota: 5004.12, tasa: 0.2352 },
  { limInf: 49233.01, limSup: 93993.9, cuota: 9236.89, tasa: 0.3 },
  { limInf: 93993.91, limSup: 125325.2, cuota: 22665.17, tasa: 0.32 },
  { limInf: 125325.21, limSup: 375975.61, cuota: 32691.18, tasa: 0.34 },
  { limInf: 375975.62, limSup: Infinity, cuota: 117912.32, tasa: 0.35 },
];

export const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export function calcISR(baseGravable: number): number {
  if (baseGravable <= 0) return 0;
  for (const rango of TABLA_ISR_MENSUAL) {
    if (baseGravable >= rango.limInf && baseGravable <= rango.limSup) {
      return rango.cuota + (baseGravable - rango.limInf) * rango.tasa;
    }
  }
  const last = TABLA_ISR_MENSUAL[TABLA_ISR_MENSUAL.length - 1];
  return last.cuota + (baseGravable - last.limInf) * last.tasa;
}

/** Un saldo a favor de IVA con su mes de origen para rastreo FIFO. */
export interface IvaFavorOrigen {
  year: number;
  month: number; // 1-12
  monto: number; // valor nominal (face value) restante
}

/** Una aplicación de saldo a favor contra el IVA del mes, con su factor INPC. */
export interface IvaFavorAplicacion {
  originYear: number;
  originMonth: number;
  appliedYear: number;
  appliedMonth: number;
  montoNominal: number; // lo que se aplicó al valor nominal (acreditación)
  factorInpc: number; // INPC(aplicado) / INPC(origen); 1 si no hay datos
  montoActualizado: number; // valor actualizado (referencia, Art. 17-A CFF)
}

export interface MonthFiscalData {
  idx: number;
  label: string;
  ingresosBrutos: number;
  ingresosFacturados: number;
  ingresosNoFacturados: number;
  ivaTrasladado: number;
  ivaAcreditable: number;
  ivaDelMes: number;
  ivaFavorAnterior: number;
  ivaPorPagar: number;
  ivaAFavor: number;
  /** Saldos a favor pendientes al FINAL de este mes, con mes de origen. */
  ivaFavorDesglose: IvaFavorOrigen[];
  /** Detalle de aplicaciones de saldos a favor durante este mes. */
  ivaFavorAplicaciones: IvaFavorAplicacion[];
  egresosBrutos: number;
  egresosDeducibles: number;
  egresosNoDeducibles: number;
  utilidadMes: number;
  perdidaAnterior: number;
  perdidaEjerciciosAnteriores: number;
  baseISR: number;
  isrEstimado: number;
  totalImpuestos: number;
  numIngresos: number;
  numFacturas: number;
  numEgresos: number;
  numFacturasEgreso: number;
  ingresos: Ingreso[];
  egresos: Egreso[];
}

export interface YearFiscalResult {
  months: MonthFiscalData[];
  perdidaFinal: number;
  ivaFavorFinal: number;
}

function inpcFactor(inpcMap: Map<string, number> | undefined, from: string, to: string): number {
  if (!inpcMap) return 1;
  const f = inpcMap.get(from);
  const t = inpcMap.get(to);
  if (!f || !t || f <= 0) return 1;
  return t / f;
}

/**
 * Calcula datos fiscales mensuales de un año.
 *
 * Saldos a favor de IVA: se trackean por mes de origen (FIFO). Cuando el IVA
 * del mes resulta por pagar, se consume primero el saldo a favor más antiguo.
 * La acreditación se hace al valor nominal (Art. 6 LIVA); el factor INPC se
 * calcula y expone aparte para cuando el contador necesite solicitar devolución
 * (Art. 17-A CFF) o hacer compensaciones que sí requieren actualización.
 *
 * @param perdidaEjerciciosAnteriores — pérdida acarreada de ejercicios previos
 *   (LISR Art. 57). Se aplica en enero.
 * @param inpcMap — opcional. Map YYYY-MM → valor INPC. Si se provee, se expone
 *   el monto actualizado junto al nominal en cada aplicación.
 */
export function calcMonthData(
  ingresosYear: Ingreso[],
  egresosYear: Egreso[],
  perdidaEjerciciosAnteriores = 0,
  inpcMap?: Map<string, number>,
): YearFiscalResult {
  let perdida = 0;
  let perdidaMultiAnio = perdidaEjerciciosAnteriores;
  // Cola FIFO de saldos a favor pendientes (más antiguos primero).
  const favorQueue: IvaFavorOrigen[] = [];

  const months = MESES.map((label, idx) => {
    const monthStr = String(idx + 1).padStart(2, '0');
    const ingMes = ingresosYear.filter((i) => i.fecha.substring(5, 7) === monthStr);
    const egMes = egresosYear.filter((e) => e.fecha.substring(5, 7) === monthStr);

    const ingresosBrutos = ingMes.reduce((s, i) => s + i.monto, 0);
    const ingresosFacturados = ingMes.filter((i) => i.factura).reduce((s, i) => s + i.monto, 0);
    const egresosBrutos = egMes.reduce((s, e) => s + e.monto, 0);
    const egresosDeducibles = egMes.filter((e) => e.factura).reduce((s, e) => s + e.monto, 0);

    // --- IVA ---
    const ivaTrasladado = ingMes.filter((i) => i.factura).reduce((s, i) => s + i.iva, 0);
    const ivaAcreditable = egMes.filter((e) => e.factura).reduce((s, e) => s + e.iva, 0);
    const ivaDelMes = ivaTrasladado - ivaAcreditable;
    const ivaFavorAnterior = favorQueue.reduce((s, f) => s + f.monto, 0);
    const targetKey = `${ingresosYear[0]?.fecha.substring(0, 4) || egresosYear[0]?.fecha.substring(0, 4) || new Date().getFullYear()}-${monthStr}`;

    const aplicaciones: IvaFavorAplicacion[] = [];
    let ivaPorPagar = 0;
    let ivaAFavor = 0;

    if (ivaDelMes >= 0) {
      // Mes con IVA positivo: consumir saldos a favor FIFO
      let pendiente = ivaDelMes;
      while (pendiente > 0 && favorQueue.length > 0) {
        const oldest = favorQueue[0];
        const aplicar = Math.min(oldest.monto, pendiente);
        const originKey = `${oldest.year}-${String(oldest.month).padStart(2, '0')}`;
        const factor = inpcFactor(inpcMap, originKey, targetKey);
        aplicaciones.push({
          originYear: oldest.year,
          originMonth: oldest.month,
          appliedYear: parseInt(targetKey.substring(0, 4), 10),
          appliedMonth: idx + 1,
          montoNominal: aplicar,
          factorInpc: factor,
          montoActualizado: aplicar * factor,
        });
        oldest.monto -= aplicar;
        pendiente -= aplicar;
        if (oldest.monto <= 0.000001) favorQueue.shift();
      }
      ivaPorPagar = pendiente;
    } else {
      // Mes con IVA a favor: encolar como nuevo saldo
      const nuevoMonto = -ivaDelMes;
      ivaAFavor = nuevoMonto;
      favorQueue.push({
        year: parseInt(targetKey.substring(0, 4), 10),
        month: idx + 1,
        monto: nuevoMonto,
      });
    }

    // Copia defensiva de la cola para que cada mes tenga su propio snapshot
    const ivaFavorDesglose = favorQueue.map((f) => ({ ...f }));

    // --- ISR (con pérdida acumulada + ejercicios anteriores) ---
    const utilidadMes = ingresosFacturados - egresosDeducibles;
    const perdidaAnterior = perdida;

    const perdidaEjAnt = idx === 0 ? perdidaMultiAnio : 0;
    if (idx === 0) perdidaMultiAnio = 0; // consumed

    const baseConPerdida = utilidadMes - perdida - perdidaEjAnt;
    const baseISR = Math.max(0, baseConPerdida);
    const isrEstimado = calcISR(baseISR);
    perdida = baseConPerdida < 0 ? Math.abs(baseConPerdida) : 0;

    const totalImpuestos = ivaPorPagar + isrEstimado;

    return {
      idx,
      label,
      ingresosBrutos,
      ingresosFacturados,
      ingresosNoFacturados: ingresosBrutos - ingresosFacturados,
      ivaTrasladado,
      ivaAcreditable,
      ivaDelMes,
      ivaFavorAnterior,
      ivaPorPagar,
      ivaAFavor,
      ivaFavorDesglose,
      ivaFavorAplicaciones: aplicaciones,
      egresosBrutos,
      egresosDeducibles,
      egresosNoDeducibles: egresosBrutos - egresosDeducibles,
      utilidadMes,
      perdidaAnterior,
      perdidaEjerciciosAnteriores: perdidaEjAnt,
      baseISR,
      isrEstimado,
      totalImpuestos,
      numIngresos: ingMes.length,
      numFacturas: ingMes.filter((i) => i.factura).length,
      numEgresos: egMes.length,
      numFacturasEgreso: egMes.filter((e) => e.factura).length,
      ingresos: ingMes,
      egresos: egMes,
    };
  });

  const ivaFavorFinal = favorQueue.reduce((s, f) => s + f.monto, 0);
  return { months, perdidaFinal: perdida, ivaFavorFinal };
}

// --- Multi-year loss persistence (LISR Art. 57: up to 10 years) ---

const LOSSES_KEY = 'bordados_perdidas_fiscales';

export interface PerdidaFiscal {
  year: number;
  monto: number;
}

export function getPerdidas(): PerdidaFiscal[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(LOSSES_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function savePerdida(year: number, monto: number): void {
  const perdidas = getPerdidas().filter((p) => p.year !== year);
  if (monto > 0) {
    perdidas.push({ year, monto });
  }
  localStorage.setItem(LOSSES_KEY, JSON.stringify(perdidas));
}

/**
 * Get total carryforward loss for a given year from up to 10 previous years.
 * Only losses that haven't been fully consumed are included.
 */
export function getPerdidaArrastrable(forYear: number): number {
  const perdidas = getPerdidas();
  const minYear = forYear - 10;
  return perdidas.filter((p) => p.year >= minYear && p.year < forYear && p.monto > 0).reduce((s, p) => s + p.monto, 0);
}
