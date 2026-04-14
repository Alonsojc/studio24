'use client';

import { useState } from 'react';
import { getIngresos, getEgresos } from '@/lib/store';
import { Ingreso, Egreso } from '@/lib/types';
import { formatCurrency, categoriaLabel, conceptoLabel } from '@/lib/helpers';
import { downloadCSV } from '@/lib/csv';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';

// Meses para pagos provisionales (Persona Física con Act. Empresarial)
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// Tabla ISR mensual 2024 — Persona Física (Art. 96 LISR)
const TABLA_ISR_MENSUAL = [
  { limInf: 0, limSup: 746.04, cuota: 0, tasa: 0.0192 },
  { limInf: 746.05, limSup: 6332.05, cuota: 14.32, tasa: 0.064 },
  { limInf: 6332.06, limSup: 11128.01, cuota: 371.83, tasa: 0.1088 },
  { limInf: 11128.02, limSup: 12935.82, cuota: 893.63, tasa: 0.16 },
  { limInf: 12935.83, limSup: 15487.71, cuota: 1182.88, tasa: 0.1792 },
  { limInf: 15487.72, limSup: 31236.49, cuota: 1640.18, tasa: 0.2136 },
  { limInf: 31236.50, limSup: 49233.00, cuota: 5004.12, tasa: 0.2352 },
  { limInf: 49233.01, limSup: 93993.90, cuota: 9236.89, tasa: 0.30 },
  { limInf: 93993.91, limSup: 125325.20, cuota: 22665.17, tasa: 0.32 },
  { limInf: 125325.21, limSup: 375975.61, cuota: 32691.18, tasa: 0.34 },
  { limInf: 375975.62, limSup: Infinity, cuota: 117912.32, tasa: 0.35 },
];

function calcISR(baseGravable: number): number {
  if (baseGravable <= 0) return 0;
  for (const rango of TABLA_ISR_MENSUAL) {
    if (baseGravable >= rango.limInf && baseGravable <= rango.limSup) {
      return rango.cuota + (baseGravable - rango.limInf) * rango.tasa;
    }
  }
  const last = TABLA_ISR_MENSUAL[TABLA_ISR_MENSUAL.length - 1];
  return last.cuota + (baseGravable - last.limInf) * last.tasa;
}

export default function FiscalPage() {
  const isClient = typeof window !== 'undefined';
  const [ingresos] = useState<Ingreso[]>(() => (isClient ? getIngresos() : []));
  const [egresos] = useState<Egreso[]>(() => (isClient ? getEgresos() : []));
  const [mounted] = useState(() => isClient);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth());

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const years = Array.from(
    new Set([
      ...ingresos.map((i) => new Date(i.fecha).getFullYear()),
      ...egresos.map((e) => new Date(e.fecha).getFullYear()),
      new Date().getFullYear(),
    ]),
  )
    .sort()
    .reverse();

  // Filtros por año
  const ingresosYear = ingresos.filter((i) => new Date(i.fecha).getFullYear() === year);
  const egresosYear = egresos.filter((e) => new Date(e.fecha).getFullYear() === year);

  // Datos por mes (pagos provisionales mensuales)
  const monthData = MESES.map((label, idx) => {
    const ingMes = ingresosYear.filter((i) => new Date(i.fecha).getMonth() === idx);
    const egMes = egresosYear.filter((e) => new Date(e.fecha).getMonth() === idx);

    const ingresosBrutos = ingMes.reduce((s, i) => s + i.monto, 0);
    const ingresosFacturados = ingMes.filter((i) => i.factura).reduce((s, i) => s + i.monto, 0);
    const ivaTrasladado = ingMes.filter((i) => i.factura).reduce((s, i) => s + i.iva, 0);
    const ivaAcreditable = egMes.filter((e) => e.factura).reduce((s, e) => s + e.iva, 0);
    const ivaPorPagar = Math.max(0, ivaTrasladado - ivaAcreditable);
    const ivaAFavor = Math.max(0, ivaAcreditable - ivaTrasladado);
    const egresosBrutos = egMes.reduce((s, e) => s + e.monto, 0);
    const egresosDeducibles = egMes.filter((e) => e.factura).reduce((s, e) => s + e.monto, 0);
    const baseISR = Math.max(0, ingresosFacturados - egresosDeducibles);
    const isrEstimado = calcISR(baseISR);
    const totalImpuestos = ivaPorPagar + isrEstimado;

    return {
      idx,
      label,
      ingresosBrutos,
      ingresosFacturados,
      ingresosNoFacturados: ingresosBrutos - ingresosFacturados,
      ivaTrasladado,
      ivaAcreditable,
      ivaPorPagar,
      ivaAFavor,
      egresosBrutos,
      egresosDeducibles,
      egresosNoDeducibles: egresosBrutos - egresosDeducibles,
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

  const sel = monthData[selectedMonth];

  // Acumulado anual
  const acumIngresosFacturados = monthData.reduce((s, b) => s + b.ingresosFacturados, 0);
  const acumIVAPorPagar = monthData.reduce((s, b) => s + b.ivaPorPagar, 0);
  const acumISR = monthData.reduce((s, b) => s + b.isrEstimado, 0);
  const acumTotalImpuestos = acumIVAPorPagar + acumISR;

  // Export para contador
  const exportarParaContador = () => {
    const headers = [
      'Mes',
      'Ingresos Facturados',
      'Ingresos No Facturados',
      'IVA Trasladado',
      'Egresos Deducibles',
      'Egresos No Deducibles',
      'IVA Acreditable',
      'IVA por Pagar',
      'IVA a Favor',
      'Base ISR',
      'ISR Estimado (Tabla Art. 96)',
      'Total Impuestos',
    ];
    const rows = monthData.map((b) => [
      b.label,
      String(b.ingresosFacturados),
      String(b.ingresosNoFacturados),
      String(b.ivaTrasladado),
      String(b.egresosDeducibles),
      String(b.egresosNoDeducibles),
      String(b.ivaAcreditable),
      String(b.ivaPorPagar),
      String(b.ivaAFavor),
      String(b.baseISR),
      String(b.isrEstimado),
      String(b.totalImpuestos),
    ]);
    // Fila de totales
    rows.push([
      'TOTAL ANUAL',
      String(monthData.reduce((s, b) => s + b.ingresosFacturados, 0)),
      String(monthData.reduce((s, b) => s + b.ingresosNoFacturados, 0)),
      String(monthData.reduce((s, b) => s + b.ivaTrasladado, 0)),
      String(monthData.reduce((s, b) => s + b.egresosDeducibles, 0)),
      String(monthData.reduce((s, b) => s + b.egresosNoDeducibles, 0)),
      String(monthData.reduce((s, b) => s + b.ivaAcreditable, 0)),
      String(acumIVAPorPagar),
      String(monthData.reduce((s, b) => s + b.ivaAFavor, 0)),
      String(monthData.reduce((s, b) => s + b.baseISR, 0)),
      String(acumISR),
      String(acumTotalImpuestos),
    ]);
    downloadCSV(`fiscal_${year}_mensual`, headers, rows);
  };

  const exportarDetalle = () => {
    // Exportar el detalle de ingresos y egresos del mes seleccionado
    const headers = [
      'Tipo',
      'Fecha',
      'Descripción',
      'Concepto/Categoría',
      'Monto',
      'IVA',
      'Total',
      'Factura',
      'No. Factura',
    ];
    const rows = [
      ...sel.ingresos.map((i) => [
        'INGRESO',
        i.fecha,
        i.descripcion,
        conceptoLabel(i.concepto),
        String(i.monto),
        String(i.iva),
        String(i.montoTotal),
        i.factura ? 'Sí' : 'No',
        i.numeroFactura,
      ]),
      ...sel.egresos.map((e) => [
        'EGRESO',
        e.fecha,
        e.descripcion,
        categoriaLabel(e.categoria),
        String(e.monto),
        String(e.iva),
        String(e.montoTotal),
        e.factura ? 'Sí' : 'No',
        e.numeroFactura,
      ]),
    ];
    downloadCSV(`fiscal_${year}_${sel.label.replace(/\s/g, '')}_detalle`, headers, rows);
  };

  return (
    <div>
      <PageHeader
        title="Declaración Fiscal"
        description="Resumen mensual para el SAT"
        action={
          <div className="flex gap-2 items-center">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border border-neutral-200 rounded-xl px-3.5 py-2.5 text-xs font-bold bg-white focus:outline-none focus:border-[#c72a09]"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              onClick={exportarParaContador}
              className="px-4 py-2.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase bg-[#0a0a0a] text-white hover:bg-[#222] transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
              CSV Contador
            </button>
          </div>
        }
      />

      {/* Acumulado Anual */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Facturado Anual" value={formatCurrency(acumIngresosFacturados)} subtitle={`${year}`} />
        <StatCard
          label="IVA por Pagar (acum.)"
          value={formatCurrency(acumIVAPorPagar)}
          subtitle="IVA trasladado – acreditable"
        />
        <StatCard label="ISR Estimado (acum.)" value={formatCurrency(acumISR)} subtitle="Tabla Art. 96 LISR" />
        <StatCard
          label="Total Impuestos"
          value={formatCurrency(acumTotalImpuestos)}
          subtitle="IVA + ISR estimado"
          accent
        />
      </div>

      {/* Meses */}
      <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2 mb-8">
        {monthData.map((b, idx) => (
          <button
            key={idx}
            onClick={() => setSelectedMonth(idx)}
            className={`p-3 rounded-xl text-center border transition-all ${
              selectedMonth === idx ? 'border-[#c72a09] bg-[#c72a09]/5' : 'border-neutral-200 hover:border-neutral-400'
            }`}
          >
            <p
              className={`text-[10px] font-bold tracking-[0.05em] uppercase ${selectedMonth === idx ? 'text-[#c72a09]' : 'text-neutral-400'}`}
            >
              {b.label}
            </p>
            <p className={`text-sm font-black mt-1 ${selectedMonth === idx ? 'text-[#c72a09]' : 'text-[#0a0a0a]'}`}>
              {formatCurrency(b.totalImpuestos)}
            </p>
            <p className="text-[9px] text-neutral-400 mt-0.5">{b.numFacturas} facturas</p>
          </button>
        ))}
      </div>

      {/* Detalle del mes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Ingresos */}
        <div className="bg-white rounded-2xl border border-neutral-100 p-6">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase">
              Ingresos — {sel.label}
            </h3>
            <span className="text-xs text-neutral-400">{sel.numIngresos} registros</span>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Ingresos facturados</span>
              <span className="font-bold">{formatCurrency(sel.ingresosFacturados)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Ingresos no facturados</span>
              <span className="font-bold text-neutral-400">{formatCurrency(sel.ingresosNoFacturados)}</span>
            </div>
            <div className="border-t border-neutral-100 pt-3 flex justify-between text-sm">
              <span className="font-bold">Total ingresos</span>
              <span className="font-bold">{formatCurrency(sel.ingresosBrutos)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">IVA trasladado (cobrado)</span>
              <span className="font-bold text-green-600">{formatCurrency(sel.ivaTrasladado)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Facturas emitidas</span>
              <span className="font-bold">{sel.numFacturas}</span>
            </div>
          </div>
        </div>

        {/* Egresos */}
        <div className="bg-white rounded-2xl border border-neutral-100 p-6">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase">
              Egresos — {sel.label}
            </h3>
            <span className="text-xs text-neutral-400">{sel.numEgresos} registros</span>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Gastos deducibles (con factura)</span>
              <span className="font-bold">{formatCurrency(sel.egresosDeducibles)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Gastos no deducibles</span>
              <span className="font-bold text-neutral-400">{formatCurrency(sel.egresosNoDeducibles)}</span>
            </div>
            <div className="border-t border-neutral-100 pt-3 flex justify-between text-sm">
              <span className="font-bold">Total egresos</span>
              <span className="font-bold">{formatCurrency(sel.egresosBrutos)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">IVA acreditable (pagado)</span>
              <span className="font-bold text-red-500">{formatCurrency(sel.ivaAcreditable)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Facturas recibidas</span>
              <span className="font-bold">{sel.numFacturasEgreso}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Resumen fiscal del mes */}
      <div className="bg-[#0a0a0a] rounded-2xl p-6 mb-8">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-white/30 uppercase">
            Resumen Fiscal — {sel.label} {year}
          </h3>
          <button
            onClick={exportarDetalle}
            className="text-[10px] font-bold tracking-[0.08em] text-[#c72a09] uppercase hover:underline"
          >
            Exportar detalle CSV
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* IVA */}
          <div>
            <p className="text-[9px] font-bold tracking-[0.1em] text-white/20 uppercase mb-3">IVA</p>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-white/50">Trasladado</span>
                <span className="text-sm font-bold text-green-400">{formatCurrency(sel.ivaTrasladado)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-white/50">Acreditable</span>
                <span className="text-sm font-bold text-red-400">{formatCurrency(sel.ivaAcreditable)}</span>
              </div>
              <div className="border-t border-white/10 pt-2 flex justify-between">
                <span className="text-sm font-bold text-white">{sel.ivaPorPagar > 0 ? 'Por pagar' : 'A favor'}</span>
                <span className="text-lg font-black text-[#c72a09]">
                  {formatCurrency(sel.ivaPorPagar > 0 ? sel.ivaPorPagar : sel.ivaAFavor)}
                </span>
              </div>
            </div>
          </div>

          {/* ISR */}
          <div>
            <p className="text-[9px] font-bold tracking-[0.1em] text-white/20 uppercase mb-3">ISR (Pago Provisional)</p>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-white/50">Ingresos facturados</span>
                <span className="text-sm font-bold text-white">{formatCurrency(sel.ingresosFacturados)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-white/50">(-) Deducciones</span>
                <span className="text-sm font-bold text-white">{formatCurrency(sel.egresosDeducibles)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-white/50">Base gravable</span>
                <span className="text-sm font-bold text-white">{formatCurrency(sel.baseISR)}</span>
              </div>
              <div className="border-t border-white/10 pt-2 flex justify-between">
                <span className="text-sm font-bold text-white">ISR estimado</span>
                <span className="text-lg font-black text-amber-400">{formatCurrency(sel.isrEstimado)}</span>
              </div>
            </div>
          </div>

          {/* Total */}
          <div>
            <p className="text-[9px] font-bold tracking-[0.1em] text-white/20 uppercase mb-3">Total a Pagar</p>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-white/50">IVA</span>
                <span className="text-sm font-bold text-white">{formatCurrency(sel.ivaPorPagar)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-white/50">ISR</span>
                <span className="text-sm font-bold text-white">{formatCurrency(sel.isrEstimado)}</span>
              </div>
              <div className="border-t border-white/10 pt-2 flex justify-between">
                <span className="text-sm font-bold text-white">Total impuestos</span>
                <span className="text-2xl font-black text-[#c72a09]">{formatCurrency(sel.totalImpuestos)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <p className="text-xs text-amber-700">
          <span className="font-bold">Nota:</span> Los cálculos de ISR usan la tabla del Art. 96 LISR para Persona
          Física con Actividad Empresarial (pagos provisionales mensuales). Las cifras son estimaciones para referencia.
          Consulta con tu contador para la declaración definitiva. El IVA se calcula como trasladado (cobrado en
          facturas de venta) menos acreditable (pagado en facturas de compra).
        </p>
      </div>
    </div>
  );
}
