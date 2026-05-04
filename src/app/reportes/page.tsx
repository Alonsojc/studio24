'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { getIngresos, getEgresos, getClientes } from '@/lib/store';
import { cloudGetIngresosByYear, cloudGetEgresosByYear, cloudGetClientes } from '@/lib/store-cloud';
import { useCloudStore } from '@/lib/useCloudStore';
import { formatCurrency, categoriaLabel, conceptoLabel } from '@/lib/helpers';
import { calcApartadoUtilidad } from '@/lib/utilidad';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';

const ComposedChart = dynamic(() => import('recharts').then((m) => m.ComposedChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then((m) => m.Bar), { ssr: false });
const Line = dynamic(() => import('recharts').then((m) => m.Line), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then((m) => m.ResponsiveContainer), { ssr: false });
const PieChart = dynamic(() => import('recharts').then((m) => m.PieChart), { ssr: false });
const Pie = dynamic(() => import('recharts').then((m) => m.Pie), { ssr: false });
const Legend = dynamic(() => import('recharts').then((m) => m.Legend), { ssr: false });

// Cell must be imported directly — dynamic() wraps it and recharts can't recognize it,
// causing all pie segments to render as default gray.
import { Cell } from 'recharts';

const COLORS = ['#c72a09', '#2563eb', '#16a34a', '#d97706', '#9333ea', '#ec4899', '#0891b2', '#65a30d'];
const APARTADOS_UTILIDAD_KEY = 'bordados_apartados_utilidad';

type ApartadoKind = 'reinversion' | 'donacion';
type ApartadoStatus = Partial<Record<ApartadoKind, boolean>>;
type ApartadoStatusMap = Record<string, ApartadoStatus>;

function readApartadoStatus(): ApartadoStatusMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(APARTADOS_UTILIDAD_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeApartadoStatus(status: ApartadoStatusMap): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(APARTADOS_UTILIDAD_KEY, JSON.stringify(status));
}

function StatusButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-[0.04em] transition-colors ${
        active
          ? 'bg-green-100 text-green-700'
          : disabled
            ? 'bg-neutral-100 text-neutral-300 cursor-not-allowed'
            : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
      }`}
    >
      {active ? 'Separado' : children}
    </button>
  );
}

export default function ReportesPage() {
  const isClient = typeof window !== 'undefined';
  const [year, setYear] = useState(new Date().getFullYear());
  const [mesInicio, setMesInicio] = useState(0);
  const [mesFin, setMesFin] = useState(11);
  const { data: ingresos } = useCloudStore(getIngresos, () => cloudGetIngresosByYear(year), 'bordados_ingresos', [
    year,
  ]);
  const { data: egresos } = useCloudStore(getEgresos, () => cloudGetEgresosByYear(year), 'bordados_egresos', [year]);
  const { data: clientesList } = useCloudStore(getClientes, cloudGetClientes, 'bordados_clientes');
  const totalClientes = clientesList.length;
  const [mounted] = useState(() => isClient);
  const [apartadoStatus, setApartadoStatus] = useState<ApartadoStatusMap>(() => readApartadoStatus());

  if (!mounted)
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" />
      </div>
    );

  const years = Array.from(
    new Set([
      ...ingresos.map((i) => parseInt(i.fecha.substring(0, 4), 10)),
      ...egresos.map((e) => parseInt(e.fecha.substring(0, 4), 10)),
      new Date().getFullYear(),
    ]),
  )
    .sort()
    .reverse();

  const inRange = (fecha: string) => {
    const y = parseInt(fecha.substring(0, 4), 10);
    const m = parseInt(fecha.substring(5, 7), 10) - 1;
    return y === year && m >= mesInicio && m <= mesFin;
  };
  const inSelectedYear = (fecha: string) => parseInt(fecha.substring(0, 4), 10) === year;
  const ingresosYear = ingresos.filter((i) => inRange(i.fecha));
  const egresosYear = egresos.filter((e) => inRange(e.fecha));
  const ingresosAnuales = ingresos.filter((i) => inSelectedYear(i.fecha));
  const egresosAnuales = egresos.filter((e) => inSelectedYear(e.fecha));
  // Exclude soloFiscal egresos from business reports (they only count in Fiscal)
  const egresosNegocio = egresosYear.filter((e) => !e.soloFiscal);
  const egresosNegocioAnuales = egresosAnuales.filter((e) => !e.soloFiscal);

  const totalIngresosYear = ingresosYear.reduce((s, i) => s + i.montoTotal, 0);
  const totalEgresosYear = egresosNegocio.reduce((s, e) => s + e.montoTotal, 0);
  const gananciaYear = totalIngresosYear - totalEgresosYear;
  const totalIngresosAnual = ingresosAnuales.reduce((s, i) => s + i.montoTotal, 0);
  const totalEgresosAnual = egresosNegocioAnuales.reduce((s, e) => s + e.montoTotal, 0);
  const gananciaAnual = totalIngresosAnual - totalEgresosAnual;
  const apartadoPeriodo = calcApartadoUtilidad(gananciaYear);
  const apartadoAnual = calcApartadoUtilidad(gananciaAnual);
  const ivaCobradoYear = ingresosYear.filter((i) => i.factura).reduce((s, i) => s + i.iva, 0);
  const ivaPagadoYear = egresosYear.filter((e) => e.factura).reduce((s, e) => s + e.iva, 0);
  const facturadoIngresos = ingresosYear.filter((i) => i.factura).reduce((s, i) => s + i.montoTotal, 0);
  const noFacturadoIngresos = totalIngresosYear - facturadoIngresos;

  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const monthlyData = monthNames.map((name, idx) => {
    const ms = String(idx + 1).padStart(2, '0');
    const ing = ingresosYear.filter((i) => i.fecha.substring(5, 7) === ms).reduce((s, i) => s + i.montoTotal, 0);
    const eg = egresosNegocio.filter((e) => e.fecha.substring(5, 7) === ms).reduce((s, e) => s + e.montoTotal, 0);
    return { name, Ingresos: ing, Egresos: eg, Ganancia: ing - eg };
  });
  const monthlyUtilityData = monthNames.map((name, idx) => {
    const ms = String(idx + 1).padStart(2, '0');
    const ing = ingresosAnuales.filter((i) => i.fecha.substring(5, 7) === ms).reduce((s, i) => s + i.montoTotal, 0);
    const eg = egresosNegocioAnuales
      .filter((e) => e.fecha.substring(5, 7) === ms)
      .reduce((s, e) => s + e.montoTotal, 0);
    const utilidad = ing - eg;
    return { name, key: `${year}-${ms}`, ...calcApartadoUtilidad(utilidad) };
  });
  const annualStatusKey = `${year}-anual`;
  const periodLabel =
    mesInicio === 0 && mesFin === 11 ? String(year) : `${monthNames[mesInicio]} - ${monthNames[mesFin]} ${year}`;

  const toggleApartado = (key: string, kind: ApartadoKind) => {
    setApartadoStatus((prev) => {
      const current = prev[key] || {};
      const nextForKey = { ...current, [kind]: !current[kind] };
      const next = { ...prev, [key]: nextForKey };
      if (!nextForKey.reinversion && !nextForKey.donacion) delete next[key];
      writeApartadoStatus(next);
      return next;
    });
  };

  const categoriaData = Object.entries(
    egresosNegocio.reduce<Record<string, number>>((acc, e) => {
      const cat = categoriaLabel(e.categoria);
      acc[cat] = (acc[cat] || 0) + e.montoTotal;
      return acc;
    }, {}),
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const conceptoData = Object.entries(
    ingresosYear.reduce<Record<string, number>>((acc, i) => {
      const cat = conceptoLabel(i.concepto);
      acc[cat] = (acc[cat] || 0) + i.montoTotal;
      return acc;
    }, {}),
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const bestMonth = monthlyData.reduce(
    (best, m, idx) => (m.Ingresos > (monthlyData[best]?.Ingresos || 0) ? idx : best),
    0,
  );

  return (
    <div>
      <PageHeader
        title="Reportes"
        description="Análisis financiero de tu negocio"
        action={
          <div className="flex gap-2 items-center flex-wrap">
            <select
              value={year}
              onChange={(e) => {
                setYear(Number(e.target.value));
                setMesInicio(0);
                setMesFin(11);
              }}
              className="border border-neutral-200 rounded-xl px-3.5 py-2.5 text-xs font-bold bg-white focus:outline-none focus:border-[#c72a09]"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <select
              value={mesInicio}
              onChange={(e) => {
                const v = Number(e.target.value);
                setMesInicio(v);
                if (v > mesFin) setMesFin(v);
              }}
              className="border border-neutral-200 rounded-xl px-3 py-2.5 text-xs font-bold bg-white focus:outline-none focus:border-[#c72a09]"
            >
              {monthNames.map((m, i) => (
                <option key={i} value={i}>
                  {m}
                </option>
              ))}
            </select>
            <span className="text-xs text-neutral-400">a</span>
            <select
              value={mesFin}
              onChange={(e) => {
                const v = Number(e.target.value);
                setMesFin(v);
                if (v < mesInicio) setMesInicio(v);
              }}
              className="border border-neutral-200 rounded-xl px-3 py-2.5 text-xs font-bold bg-white focus:outline-none focus:border-[#c72a09]"
            >
              {monthNames.map((m, i) => (
                <option key={i} value={i}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-10">
        <StatCard
          label={`Ingresos ${mesInicio === 0 && mesFin === 11 ? 'Anuales' : `${monthNames[mesInicio]}–${monthNames[mesFin]}`}`}
          value={formatCurrency(totalIngresosYear)}
          subtitle={`${ingresosYear.length} ventas`}
          color="green"
        />
        <StatCard
          label={`Egresos ${mesInicio === 0 && mesFin === 11 ? 'Anuales' : `${monthNames[mesInicio]}–${monthNames[mesFin]}`}`}
          value={formatCurrency(totalEgresosYear)}
          subtitle={`${egresosNegocio.length} gastos`}
          color="red"
        />
        <StatCard
          label={`Ganancia ${mesInicio === 0 && mesFin === 11 ? 'Anual' : `${monthNames[mesInicio]}–${monthNames[mesFin]}`}`}
          value={formatCurrency(gananciaYear)}
          subtitle={gananciaYear >= 0 ? 'Positiva' : 'Negativa'}
          color={gananciaYear >= 0 ? 'green' : 'red'}
        />
        <StatCard
          label="IVA por Pagar"
          value={formatCurrency(ivaCobradoYear - ivaPagadoYear)}
          subtitle="Anual acumulado"
        />
      </div>

      <div className="bg-white rounded-2xl border border-neutral-100 p-6 mb-8">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase">Apartado de utilidad</h3>
            <p className="text-xs text-neutral-400 mt-1">Reinversión 10% · Donación 2% no fiscal · Disponible 88%</p>
          </div>
          <span className="px-3 py-1 rounded-lg bg-neutral-100 text-[10px] font-bold text-neutral-500 uppercase">
            {periodLabel}
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div>
            <p className="text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Utilidad periodo</p>
            <p
              className={`text-xl font-black mt-1 ${apartadoPeriodo.utilidad >= 0 ? 'text-[#0a0a0a]' : 'text-red-600'}`}
            >
              {formatCurrency(apartadoPeriodo.utilidad)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-[0.1em] text-green-600 uppercase">Reinversión 10%</p>
            <p className="text-xl font-black text-green-600 mt-1">{formatCurrency(apartadoPeriodo.reinversion)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-[0.1em] text-blue-600 uppercase">Donación 2% no fiscal</p>
            <p className="text-xl font-black text-blue-600 mt-1">{formatCurrency(apartadoPeriodo.donacion)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Disponible</p>
            <p className="text-xl font-black text-[#0a0a0a] mt-1">{formatCurrency(apartadoPeriodo.disponible)}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-neutral-100">
                <th className="py-3 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                  Mes
                </th>
                <th className="py-3 text-right text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                  Utilidad
                </th>
                <th className="py-3 text-right text-[10px] font-bold tracking-[0.1em] text-green-600 uppercase">
                  Reinversión
                </th>
                <th className="py-3 text-right text-[10px] font-bold tracking-[0.1em] text-blue-600 uppercase">
                  Donación no fiscal
                </th>
                <th className="py-3 text-right text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                  Seguimiento
                </th>
              </tr>
            </thead>
            <tbody>
              {monthlyUtilityData.map((m) => {
                const status = apartadoStatus[m.key] || {};
                const disabled = m.utilidad <= 0;
                return (
                  <tr key={m.key} className="border-b border-neutral-50">
                    <td className="py-3 font-bold text-[#0a0a0a]">{m.name}</td>
                    <td className={`py-3 text-right font-bold ${m.utilidad >= 0 ? 'text-[#0a0a0a]' : 'text-red-600'}`}>
                      {formatCurrency(m.utilidad)}
                    </td>
                    <td className="py-3 text-right text-green-600 font-semibold">{formatCurrency(m.reinversion)}</td>
                    <td className="py-3 text-right text-blue-600 font-semibold">{formatCurrency(m.donacion)}</td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        <StatusButton
                          active={status.reinversion}
                          disabled={disabled}
                          onClick={() => toggleApartado(m.key, 'reinversion')}
                        >
                          Reinversión
                        </StatusButton>
                        <StatusButton
                          active={status.donacion}
                          disabled={disabled}
                          onClick={() => toggleApartado(m.key, 'donacion')}
                        >
                          Donación
                        </StatusButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="py-4 font-black text-[#0a0a0a]">Total {year}</td>
                <td
                  className={`py-4 text-right font-black ${apartadoAnual.utilidad >= 0 ? 'text-[#0a0a0a]' : 'text-red-600'}`}
                >
                  {formatCurrency(apartadoAnual.utilidad)}
                </td>
                <td className="py-4 text-right font-black text-green-600">
                  {formatCurrency(apartadoAnual.reinversion)}
                </td>
                <td className="py-4 text-right font-black text-blue-600">{formatCurrency(apartadoAnual.donacion)}</td>
                <td className="py-4">
                  <div className="flex justify-end gap-2">
                    <StatusButton
                      active={apartadoStatus[annualStatusKey]?.reinversion}
                      disabled={apartadoAnual.utilidad <= 0}
                      onClick={() => toggleApartado(annualStatusKey, 'reinversion')}
                    >
                      Reinversión anual
                    </StatusButton>
                    <StatusButton
                      active={apartadoStatus[annualStatusKey]?.donacion}
                      disabled={apartadoAnual.utilidad <= 0}
                      onClick={() => toggleApartado(annualStatusKey, 'donacion')}
                    >
                      Donación anual
                    </StatusButton>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Monthly Chart */}
      <div className="bg-white rounded-2xl border border-neutral-100 p-6 mb-8">
        <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-6">
          Ingresos vs Egresos por Mes
        </h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyData} barGap={2}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#a3a3a3' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: '#a3a3a3' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid #e5e5e5',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="Ingresos" fill="#16a34a" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Egresos" fill="#dc2626" radius={[6, 6, 0, 0]} />
              <Line type="monotone" dataKey="Ganancia" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Pie Charts — Ingresos left, Egresos right */}
        <div className="bg-white rounded-2xl border border-neutral-100 p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-green-600 uppercase mb-6">
            Ingresos por Concepto
          </h3>
          {conceptoData.length === 0 ? (
            <p className="text-sm text-neutral-300 text-center py-12">Sin datos</p>
          ) : (
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={conceptoData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={50}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent, x, y }) => (
                      <text
                        x={x}
                        y={y}
                        textAnchor={x > 200 ? 'start' : 'end'}
                        dominantBaseline="central"
                        style={{ fontSize: 12 }}
                      >
                        {`${name || ''} ${((percent as number) * 100).toFixed(0)}%`}
                      </text>
                    )}
                    labelLine={true}
                  >
                    {conceptoData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e5e5e5' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-neutral-100 p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-red-600 uppercase mb-6">Egresos por Categoria</h3>
          {categoriaData.length === 0 ? (
            <p className="text-sm text-neutral-300 text-center py-12">Sin datos</p>
          ) : (
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoriaData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={50}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent, x, y }) => (
                      <text
                        x={x}
                        y={y}
                        textAnchor={x > 200 ? 'start' : 'end'}
                        dominantBaseline="central"
                        style={{ fontSize: 12 }}
                      >
                        {`${name || ''} ${((percent as number) * 100).toFixed(0)}%`}
                      </text>
                    )}
                    labelLine={true}
                  >
                    {categoriaData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e5e5e5' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-[#0a0a0a] rounded-2xl p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-white/50 uppercase mb-5">Resumen Fiscal Anual</h3>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-white/50">Facturado (Ingresos)</span>
              <span className="text-sm font-bold text-white">{formatCurrency(facturadoIngresos)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-white/50">No Facturado</span>
              <span className="text-sm font-bold text-white/40">{formatCurrency(noFacturadoIngresos)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-white/50">IVA Cobrado</span>
              <span className="text-sm font-bold text-green-400">{formatCurrency(ivaCobradoYear)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-white/50">IVA Pagado</span>
              <span className="text-sm font-bold text-red-400">{formatCurrency(ivaPagadoYear)}</span>
            </div>
            <div className="border-t border-white/10 pt-4 flex justify-between">
              <span className="text-sm font-bold text-white">IVA Neto</span>
              <span className="text-lg font-black text-[#c72a09]">
                {formatCurrency(ivaCobradoYear - ivaPagadoYear)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-bold text-white">Margen</span>
              <span className="text-lg font-black text-white">
                {totalIngresosYear > 0 ? `${((gananciaYear / totalIngresosYear) * 100).toFixed(1)}%` : '—'}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-100 p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">Estadísticas</h3>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-neutral-500">Promedio por Venta</span>
              <span className="text-sm font-bold">
                {ingresosYear.length > 0 ? formatCurrency(totalIngresosYear / ingresosYear.length) : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-neutral-500">Ventas del Año</span>
              <span className="text-sm font-bold">{ingresosYear.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-neutral-500">Gastos del Año</span>
              <span className="text-sm font-bold">{egresosNegocio.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-neutral-500">Total Clientes</span>
              <span className="text-sm font-bold">{totalClientes}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-neutral-500">% Facturado</span>
              <span className="text-sm font-bold">
                {ingresosYear.length > 0
                  ? `${((ingresosYear.filter((i) => i.factura).length / ingresosYear.length) * 100).toFixed(0)}%`
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-neutral-500">Mejor Mes</span>
              <span className="text-sm font-bold text-[#c72a09]">{monthNames[bestMonth]}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
