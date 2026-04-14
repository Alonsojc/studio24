'use client';

import { useState } from 'react';
import { getIngresos, getEgresos } from '@/lib/store';
import { Ingreso, Egreso } from '@/lib/types';
import { formatCurrency, categoriaLabel, conceptoLabel } from '@/lib/helpers';
import { downloadCSV } from '@/lib/csv';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';

// Bimestres SAT: Ene-Feb, Mar-Abr, May-Jun, Jul-Ago, Sep-Oct, Nov-Dic
const BIMESTRES = [
  { label: 'Ene – Feb', meses: [0, 1] },
  { label: 'Mar – Abr', meses: [2, 3] },
  { label: 'May – Jun', meses: [4, 5] },
  { label: 'Jul – Ago', meses: [6, 7] },
  { label: 'Sep – Oct', meses: [8, 9] },
  { label: 'Nov – Dic', meses: [10, 11] },
];

// ISR RIF tabla simplificada (rangos mensuales aproximados para RESICO)
// Estos son estimaciones — el contador ajusta con las tablas oficiales
const ISR_RATE_RESICO = 0.025; // 2.5% tasa RESICO para ingresos < 3.5M anuales

export default function FiscalPage() {
  const isClient = typeof window !== 'undefined';
  const [ingresos] = useState<Ingreso[]>(() => (isClient ? getIngresos() : []));
  const [egresos] = useState<Egreso[]>(() => (isClient ? getEgresos() : []));
  const [mounted] = useState(() => isClient);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedBim, setSelectedBim] = useState(() => Math.floor(new Date().getMonth() / 2));

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

  // Datos por bimestre
  const bimData = BIMESTRES.map((bim, idx) => {
    const ingBim = ingresosYear.filter((i) => bim.meses.includes(new Date(i.fecha).getMonth()));
    const egBim = egresosYear.filter((e) => bim.meses.includes(new Date(e.fecha).getMonth()));

    const ingresosBrutos = ingBim.reduce((s, i) => s + i.monto, 0);
    const ingresosFacturados = ingBim.filter((i) => i.factura).reduce((s, i) => s + i.monto, 0);
    const ivaTrasladado = ingBim.filter((i) => i.factura).reduce((s, i) => s + i.iva, 0);
    const ivaAcreditable = egBim.filter((e) => e.factura).reduce((s, e) => s + e.iva, 0);
    const ivaPorPagar = Math.max(0, ivaTrasladado - ivaAcreditable);
    const ivaAFavor = Math.max(0, ivaAcreditable - ivaTrasladado);
    const egresosBrutos = egBim.reduce((s, e) => s + e.monto, 0);
    const egresosDeducibles = egBim.filter((e) => e.factura).reduce((s, e) => s + e.monto, 0);
    const baseISR = Math.max(0, ingresosFacturados - egresosDeducibles);
    const isrEstimado = baseISR * ISR_RATE_RESICO;
    const totalImpuestos = ivaPorPagar + isrEstimado;

    return {
      idx,
      label: bim.label,
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
      numIngresos: ingBim.length,
      numFacturas: ingBim.filter((i) => i.factura).length,
      numEgresos: egBim.length,
      numFacturasEgreso: egBim.filter((e) => e.factura).length,
      ingresos: ingBim,
      egresos: egBim,
    };
  });

  const sel = bimData[selectedBim];

  // Acumulado anual
  const acumIngresosFacturados = bimData.reduce((s, b) => s + b.ingresosFacturados, 0);
  const acumIVAPorPagar = bimData.reduce((s, b) => s + b.ivaPorPagar, 0);
  const acumISR = bimData.reduce((s, b) => s + b.isrEstimado, 0);
  const acumTotalImpuestos = acumIVAPorPagar + acumISR;

  // Export para contador
  const exportarParaContador = () => {
    const headers = [
      'Bimestre',
      'Ingresos Facturados',
      'Ingresos No Facturados',
      'IVA Trasladado',
      'Egresos Deducibles',
      'Egresos No Deducibles',
      'IVA Acreditable',
      'IVA por Pagar',
      'IVA a Favor',
      'Base ISR',
      'ISR Estimado (RESICO 2.5%)',
      'Total Impuestos',
    ];
    const rows = bimData.map((b) => [
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
      String(bimData.reduce((s, b) => s + b.ingresosFacturados, 0)),
      String(bimData.reduce((s, b) => s + b.ingresosNoFacturados, 0)),
      String(bimData.reduce((s, b) => s + b.ivaTrasladado, 0)),
      String(bimData.reduce((s, b) => s + b.egresosDeducibles, 0)),
      String(bimData.reduce((s, b) => s + b.egresosNoDeducibles, 0)),
      String(bimData.reduce((s, b) => s + b.ivaAcreditable, 0)),
      String(acumIVAPorPagar),
      String(bimData.reduce((s, b) => s + b.ivaAFavor, 0)),
      String(bimData.reduce((s, b) => s + b.baseISR, 0)),
      String(acumISR),
      String(acumTotalImpuestos),
    ]);
    downloadCSV(`fiscal_${year}_bimestral`, headers, rows);
  };

  const exportarDetalle = () => {
    // Exportar el detalle de ingresos y egresos del bimestre seleccionado
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
        description="Resumen bimestral para el SAT"
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
        <StatCard label="ISR Estimado (acum.)" value={formatCurrency(acumISR)} subtitle="RESICO 2.5%" />
        <StatCard
          label="Total Impuestos"
          value={formatCurrency(acumTotalImpuestos)}
          subtitle="IVA + ISR estimado"
          accent
        />
      </div>

      {/* Bimestres */}
      <div className="grid grid-cols-6 gap-2 mb-8">
        {bimData.map((b, idx) => (
          <button
            key={idx}
            onClick={() => setSelectedBim(idx)}
            className={`p-3 rounded-xl text-center border transition-all ${
              selectedBim === idx ? 'border-[#c72a09] bg-[#c72a09]/5' : 'border-neutral-200 hover:border-neutral-400'
            }`}
          >
            <p
              className={`text-[10px] font-bold tracking-[0.05em] uppercase ${selectedBim === idx ? 'text-[#c72a09]' : 'text-neutral-400'}`}
            >
              {b.label}
            </p>
            <p className={`text-sm font-black mt-1 ${selectedBim === idx ? 'text-[#c72a09]' : 'text-[#0a0a0a]'}`}>
              {formatCurrency(b.totalImpuestos)}
            </p>
            <p className="text-[9px] text-neutral-400 mt-0.5">{b.numFacturas} facturas</p>
          </button>
        ))}
      </div>

      {/* Detalle del bimestre */}
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

      {/* Resumen fiscal del bimestre */}
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
            <p className="text-[9px] font-bold tracking-[0.1em] text-white/20 uppercase mb-3">ISR (RESICO)</p>
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
                <span className="text-sm font-bold text-white">ISR estimado (2.5%)</span>
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
          <span className="font-bold">Nota:</span> Los cálculos de ISR usan la tasa RESICO simplificada (2.5% sobre
          ingresos facturados menos deducciones). Las cifras son estimaciones para referencia. Consulta con tu contador
          para la declaración definitiva. El IVA se calcula como trasladado (cobrado en facturas de venta) menos
          acreditable (pagado en facturas de compra).
        </p>
      </div>
    </div>
  );
}
