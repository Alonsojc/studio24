'use client';

import { useState, useEffect, useRef } from 'react';
import { getIngresos, getEgresos, getConfig } from '@/lib/store';
import { cloudGetIngresos, cloudGetEgresos } from '@/lib/store-cloud';
import { useCloudStore } from '@/lib/useCloudStore';
import { formatCurrency, categoriaLabel, conceptoLabel } from '@/lib/helpers';
import { downloadCSV } from '@/lib/csv';
import { MESES, calcMonthData, getPerdidaArrastrable, savePerdida, getPerdidas } from '@/lib/fiscal';
import { generateFiscalPDF } from '@/lib/fiscal-pdf';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';

export default function FiscalPage() {
  const isClient = typeof window !== 'undefined';
  const { data: ingresos } = useCloudStore(getIngresos, cloudGetIngresos, 'bordados_ingresos');
  const { data: egresos } = useCloudStore(getEgresos, cloudGetEgresos, 'bordados_egresos');
  const [mounted] = useState(() => isClient);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth());
  const savedYearsRef = useRef<Set<number>>(new Set());

  // Compute fiscal data unconditionally (pure math, no DOM)
  const yearStr = String(year);
  const ingresosYear = ingresos.filter((i) => i.fecha.startsWith(yearStr + '-'));
  const egresosYear = egresos.filter((e) => e.fecha.startsWith(yearStr + '-'));
  const perdidaArrastrable = getPerdidaArrastrable(year);
  const {
    months: monthData,
    perdidaFinal: perdidaAcum,
    ivaFavorFinal: ivaFavorAcum,
  } = calcMonthData(ingresosYear, egresosYear, perdidaArrastrable);

  // Auto-save year-end loss when viewing a completed year (side effect only, no state)
  useEffect(() => {
    if (!isClient) return;
    if (year < new Date().getFullYear() && !savedYearsRef.current.has(year)) {
      savePerdida(year, perdidaAcum);
      savedYearsRef.current.add(year);
    }
  }, [year, perdidaAcum, isClient]);

  // Read perdidas fresh (cheap localStorage read)
  const perdidas = isClient ? getPerdidas() : [];

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const config = getConfig();

  const years = Array.from(
    new Set([
      ...ingresos.map((i) => parseInt(i.fecha.substring(0, 4), 10)),
      ...egresos.map((e) => parseInt(e.fecha.substring(0, 4), 10)),
      new Date().getFullYear(),
    ]),
  )
    .sort()
    .reverse();

  const sel = monthData[selectedMonth];

  const acumIngresosFacturados = monthData.reduce((s, b) => s + b.ingresosFacturados, 0);
  const acumIVAPorPagar = monthData.reduce((s, b) => s + b.ivaPorPagar, 0);
  const acumISR = monthData.reduce((s, b) => s + b.isrEstimado, 0);
  const acumTotalImpuestos = acumIVAPorPagar + acumISR;

  // Losses from previous years feeding into this year
  const perdidasAnteriores = perdidas
    .filter((p) => p.year >= year - 10 && p.year < year && p.monto > 0)
    .sort((a, b) => a.year - b.year);

  // Export CSV
  const exportarParaContador = () => {
    const headers = [
      'Mes',
      'Ingresos Facturados',
      'Ingresos No Facturados',
      'IVA Trasladado',
      'IVA Acreditable',
      'IVA Saldo Favor Anterior',
      'IVA por Pagar',
      'IVA Saldo a Favor',
      'Egresos Deducibles',
      'Egresos No Deducibles',
      'Utilidad/Pérdida Mes',
      'Pérdida Anterior Acum.',
      'Pérdida Ejercicios Ant.',
      'Base ISR',
      'ISR Estimado',
      'Total Impuestos',
    ];
    const rows = monthData.map((b) => [
      b.label,
      String(b.ingresosFacturados),
      String(b.ingresosNoFacturados),
      String(b.ivaTrasladado),
      String(b.ivaAcreditable),
      String(b.ivaFavorAnterior),
      String(b.ivaPorPagar),
      String(b.ivaAFavor),
      String(b.egresosDeducibles),
      String(b.egresosNoDeducibles),
      String(b.utilidadMes),
      String(b.perdidaAnterior),
      String(b.perdidaEjerciciosAnteriores),
      String(b.baseISR),
      String(b.isrEstimado),
      String(b.totalImpuestos),
    ]);
    rows.push([
      'TOTAL ANUAL',
      String(acumIngresosFacturados),
      String(monthData.reduce((s, b) => s + b.ingresosNoFacturados, 0)),
      String(monthData.reduce((s, b) => s + b.ivaTrasladado, 0)),
      String(monthData.reduce((s, b) => s + b.ivaAcreditable, 0)),
      '',
      String(acumIVAPorPagar),
      String(ivaFavorAcum),
      String(monthData.reduce((s, b) => s + b.egresosDeducibles, 0)),
      String(monthData.reduce((s, b) => s + b.egresosNoDeducibles, 0)),
      '',
      String(perdidaAcum),
      String(perdidaArrastrable),
      '',
      String(acumISR),
      String(acumTotalImpuestos),
    ]);
    downloadCSV(`fiscal_${year}_mensual`, headers, rows);
  };

  const exportarDetalle = () => {
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

  const exportarPDF = () => {
    generateFiscalPDF(year, monthData, {
      nombreNegocio: config.nombreNegocio,
      rfc: config.rfc,
      regimenFiscal: config.regimenFiscal,
      perdidaArrastrable,
      perdidaAcum,
      ivaFavorAcum,
      acumIngresosFacturados,
      acumIVAPorPagar,
      acumISR,
      acumTotalImpuestos,
    });
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
              onClick={exportarPDF}
              className="px-4 py-2.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase bg-[#c72a09] text-white hover:bg-[#a82207] transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
              PDF
            </button>
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
              CSV
            </button>
          </div>
        }
      />

      {/* SAT Deadline Alert */}
      {(() => {
        const hoy = new Date();
        if (hoy.getFullYear() !== year) return null;
        const mesActual = hoy.getMonth(); // 0-indexed
        const mesPrevio = mesActual === 0 ? 11 : mesActual - 1;
        const diaLimite = 17;
        const diasRestantes =
          mesActual === (mesPrevio + 1) % 12 && hoy.getDate() <= diaLimite ? diaLimite - hoy.getDate() : -1;
        const mesNombre = MESES[mesPrevio];
        if (diasRestantes < 0) return null;
        const urgente = diasRestantes <= 3;
        return (
          <div
            className={`rounded-2xl p-4 mb-6 flex items-center justify-between ${urgente ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'}`}
          >
            <div>
              <p className={`text-xs font-bold ${urgente ? 'text-red-600' : 'text-amber-700'}`}>
                Declaración de {mesNombre} —{' '}
                {diasRestantes === 0
                  ? 'Vence hoy'
                  : `${diasRestantes} día${diasRestantes > 1 ? 's' : ''} restante${diasRestantes > 1 ? 's' : ''}`}
              </p>
              <p className={`text-[10px] mt-0.5 ${urgente ? 'text-red-400' : 'text-amber-500'}`}>
                Fecha límite SAT: 17 de {MESES[mesActual].toLowerCase()} {year}
              </p>
            </div>
            <p className={`text-lg font-black ${urgente ? 'text-red-600' : 'text-amber-700'}`}>
              {formatCurrency(monthData[mesPrevio]?.totalImpuestos || 0)}
            </p>
          </div>
        );
      })()}

      {/* Multi-year loss carryforward */}
      {perdidaArrastrable > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs font-bold text-purple-700">Pérdidas de ejercicios anteriores (Art. 57 LISR)</p>
              <p className="text-[10px] text-purple-500 mt-0.5">
                Se aplican contra la utilidad de enero {year}. Vigencia: hasta 10 años.
              </p>
            </div>
            <p className="text-lg font-black text-purple-700">{formatCurrency(perdidaArrastrable)}</p>
          </div>
          <div className="flex gap-2 flex-wrap mt-2">
            {perdidasAnteriores.map((p) => (
              <span key={p.year} className="px-2 py-1 rounded-lg text-[10px] font-bold bg-purple-100 text-purple-600">
                {p.year}: {formatCurrency(p.monto)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Acumulado Anual */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <StatCard
          label="Facturado Anual"
          value={formatCurrency(acumIngresosFacturados)}
          subtitle={`${year}`}
          color="green"
        />
        <StatCard
          label="IVA pagado (acum.)"
          value={formatCurrency(acumIVAPorPagar)}
          subtitle={
            ivaFavorAcum > 0 ? `Saldo a favor: ${formatCurrency(ivaFavorAcum)}` : 'IVA trasladado – acreditable'
          }
          color="red"
        />
        <StatCard
          label="ISR pagado (acum.)"
          value={formatCurrency(acumISR)}
          subtitle={perdidaAcum > 0 ? `Pérdida pendiente: ${formatCurrency(perdidaAcum)}` : 'Tabla Art. 96 LISR'}
          color="red"
        />
        <StatCard
          label="Total Acumulado"
          value={formatCurrency(acumTotalImpuestos)}
          subtitle="IVA + ISR anual"
          color={acumTotalImpuestos > 0 ? 'red' : 'default'}
        />
        <StatCard
          label={`Pagar en ${sel.label}`}
          value={formatCurrency(sel.totalImpuestos)}
          subtitle={
            sel.ivaPorPagar > 0 && sel.isrEstimado > 0
              ? `IVA ${formatCurrency(sel.ivaPorPagar)} + ISR ${formatCurrency(sel.isrEstimado)}`
              : sel.ivaPorPagar > 0
                ? `IVA ${formatCurrency(sel.ivaPorPagar)}`
                : sel.isrEstimado > 0
                  ? `ISR ${formatCurrency(sel.isrEstimado)}`
                  : 'Sin impuestos'
          }
          accent
        />
      </div>

      {/* Meses */}
      <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2 mb-8">
        {monthData.map((b, idx) => (
          <button
            key={idx}
            onClick={() => setSelectedMonth(idx)}
            className={`p-3 rounded-xl text-center border transition-all ${selectedMonth === idx ? 'border-[#c72a09] bg-[#c72a09]/5' : 'border-neutral-200 hover:border-neutral-400'}`}
          >
            <p
              className={`text-[10px] font-bold tracking-[0.05em] uppercase ${selectedMonth === idx ? 'text-[#c72a09]' : 'text-neutral-400'}`}
            >
              {b.label}
            </p>
            <p className={`text-sm font-black mt-1 ${selectedMonth === idx ? 'text-[#c72a09]' : 'text-[#0a0a0a]'}`}>
              {formatCurrency(b.totalImpuestos)}
            </p>
            <p className="text-[9px] text-neutral-400 mt-0.5">{b.numFacturas + b.numFacturasEgreso} facturas</p>
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
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-white/50 uppercase">
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
            <p className="text-sm font-black tracking-[0.1em] text-white/60 uppercase mb-3 text-center">IVA</p>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-white/50">Trasladado</span>
                <span className="text-sm font-bold text-green-400">{formatCurrency(sel.ivaTrasladado)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-white/50">(-) Acreditable</span>
                <span className="text-sm font-bold text-red-400">{formatCurrency(sel.ivaAcreditable)}</span>
              </div>
              {sel.ivaFavorAnterior > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm text-blue-400">(-) Saldo a favor anterior</span>
                  <span className="text-sm font-bold text-blue-400">{formatCurrency(sel.ivaFavorAnterior)}</span>
                </div>
              )}
              <div className="border-t border-white/10 pt-2 flex justify-between">
                <span className="text-sm font-bold text-white">
                  {sel.ivaPorPagar > 0 ? 'Por pagar' : 'Saldo a favor'}
                </span>
                <span className={`text-lg font-black ${sel.ivaPorPagar > 0 ? 'text-[#c72a09]' : 'text-blue-400'}`}>
                  {formatCurrency(sel.ivaPorPagar > 0 ? sel.ivaPorPagar : sel.ivaAFavor)}
                </span>
              </div>
            </div>
          </div>

          {/* ISR */}
          <div>
            <p className="text-sm font-black tracking-[0.1em] text-white/60 uppercase mb-3 text-center">
              ISR (Pago Provisional)
            </p>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-white/50">Ingresos facturados</span>
                <span className="text-sm font-bold text-white">{formatCurrency(sel.ingresosFacturados)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-white/50">(-) Deducciones</span>
                <span className="text-sm font-bold text-white">{formatCurrency(sel.egresosDeducibles)}</span>
              </div>
              {sel.utilidadMes < 0 && (
                <div className="flex justify-between">
                  <span className="text-sm text-amber-400">Pérdida del mes</span>
                  <span className="text-sm font-bold text-amber-400">{formatCurrency(Math.abs(sel.utilidadMes))}</span>
                </div>
              )}
              {sel.perdidaAnterior > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm text-amber-400">(-) Pérdida meses anteriores</span>
                  <span className="text-sm font-bold text-amber-400">{formatCurrency(sel.perdidaAnterior)}</span>
                </div>
              )}
              {sel.perdidaEjerciciosAnteriores > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm text-purple-400">(-) Pérdida ejercicios ant.</span>
                  <span className="text-sm font-bold text-purple-400">
                    {formatCurrency(sel.perdidaEjerciciosAnteriores)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-white/50">Base gravable</span>
                <span className="text-sm font-bold text-white">{formatCurrency(sel.baseISR)}</span>
              </div>
              <div className="border-t border-white/10 pt-2 flex justify-between">
                <span className="text-sm font-bold text-white">ISR estimado</span>
                <span className={`text-lg font-black ${sel.isrEstimado > 0 ? 'text-[#c72a09]' : 'text-blue-400'}`}>
                  {formatCurrency(sel.isrEstimado)}
                </span>
              </div>
            </div>
          </div>

          {/* Total */}
          <div>
            <p className="text-sm font-black tracking-[0.1em] text-white/60 uppercase mb-3 text-center">
              Total a Pagar
            </p>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-white/50">IVA</span>
                <span className={`text-sm font-bold ${sel.ivaPorPagar > 0 ? 'text-[#c72a09]' : 'text-blue-400'}`}>
                  {formatCurrency(sel.ivaPorPagar)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-white/50">ISR</span>
                <span className={`text-sm font-bold ${sel.isrEstimado > 0 ? 'text-[#c72a09]' : 'text-blue-400'}`}>
                  {formatCurrency(sel.isrEstimado)}
                </span>
              </div>
              <div className="border-t border-white/10 pt-2 flex justify-between">
                <span className="text-sm font-bold text-white">Total impuestos</span>
                <span className={`text-2xl font-black ${sel.totalImpuestos > 0 ? 'text-[#c72a09]' : 'text-blue-400'}`}>
                  {formatCurrency(sel.totalImpuestos)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Year-end loss saved notice */}
      {perdidaAcum > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
          <p className="text-xs text-amber-700">
            <span className="font-bold">Pérdida fiscal del ejercicio {year}:</span> {formatCurrency(perdidaAcum)}.
            {year < new Date().getFullYear()
              ? ' Se arrastrará automáticamente a ejercicios posteriores (hasta 10 años, Art. 57 LISR).'
              : ' Al cierre del año se guardará para arrastrar al siguiente ejercicio.'}
          </p>
        </div>
      )}

      {/* Disclaimer */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <p className="text-xs text-amber-700">
          <span className="font-bold">Nota:</span> Los cálculos de ISR usan la tabla del Art. 96 LISR para Persona
          Física con Actividad Empresarial. Las pérdidas fiscales se acumulan mensualmente y se arrastran entre
          ejercicios por hasta 10 años (Art. 57 LISR). El IVA a favor se acumula por separado. Las cifras son
          estimaciones — consulta con tu contador.
        </p>
      </div>
    </div>
  );
}
