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

/**
 * Calculate monthly fiscal data for a year.
 * @param perdidaEjerciciosAnteriores — loss carried forward from previous years (LISR Art. 57)
 */
export function calcMonthData(
  ingresosYear: Ingreso[],
  egresosYear: Egreso[],
  perdidaEjerciciosAnteriores = 0,
): YearFiscalResult {
  let perdida = 0;
  let ivaFavor = 0;
  let perdidaMultiAnio = perdidaEjerciciosAnteriores;

  const months = MESES.map((label, idx) => {
    const monthStr = String(idx + 1).padStart(2, '0');
    const ingMes = ingresosYear.filter((i) => i.fecha.substring(5, 7) === monthStr);
    const egMes = egresosYear.filter((e) => e.fecha.substring(5, 7) === monthStr);

    const ingresosBrutos = ingMes.reduce((s, i) => s + i.monto, 0);
    const ingresosFacturados = ingMes.filter((i) => i.factura).reduce((s, i) => s + i.monto, 0);
    const egresosBrutos = egMes.reduce((s, e) => s + e.monto, 0);
    const egresosDeducibles = egMes.filter((e) => e.factura).reduce((s, e) => s + e.monto, 0);

    // --- IVA (mensual con saldo a favor acumulado) ---
    const ivaTrasladado = ingMes.filter((i) => i.factura).reduce((s, i) => s + i.iva, 0);
    const ivaAcreditable = egMes.filter((e) => e.factura).reduce((s, e) => s + e.iva, 0);
    const ivaDelMes = ivaTrasladado - ivaAcreditable;
    const ivaFavorAnterior = ivaFavor;
    const ivaNeto = ivaDelMes - ivaFavor;
    const ivaPorPagar = Math.max(0, ivaNeto);
    const ivaAFavor = Math.max(0, -ivaNeto);
    ivaFavor = ivaAFavor;

    // --- ISR (con pérdida acumulada de meses anteriores + ejercicios anteriores) ---
    const utilidadMes = ingresosFacturados - egresosDeducibles;
    const perdidaAnterior = perdida;

    // Apply multi-year loss only in January (at start of exercise)
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

  return { months, perdidaFinal: perdida, ivaFavorFinal: ivaFavor };
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
