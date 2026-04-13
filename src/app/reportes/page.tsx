'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { getIngresos, getEgresos, getClientes } from '@/lib/store';
import { Ingreso, Egreso } from '@/lib/types';
import { formatCurrency, categoriaLabel, conceptoLabel } from '@/lib/helpers';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';

const BarChart = dynamic(() => import('recharts').then((m) => m.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then((m) => m.Bar), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then((m) => m.ResponsiveContainer), { ssr: false });
const PieChart = dynamic(() => import('recharts').then((m) => m.PieChart), { ssr: false });
const Pie = dynamic(() => import('recharts').then((m) => m.Pie), { ssr: false });
const Cell = dynamic(() => import('recharts').then((m) => m.Cell), { ssr: false });
const Legend = dynamic(() => import('recharts').then((m) => m.Legend), { ssr: false });

const COLORS = ['#c72a09', '#2563eb', '#16a34a', '#d97706', '#9333ea', '#ec4899', '#0891b2', '#65a30d'];

export default function ReportesPage() {
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [totalClientes, setTotalClientes] = useState(0);
  const [year, setYear] = useState(new Date().getFullYear());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setIngresos(getIngresos());
    setEgresos(getEgresos());
    setTotalClientes(getClientes().length);
    setMounted(true);
  }, []);

  if (!mounted) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" /></div>;

  const years = Array.from(new Set([
    ...ingresos.map((i) => new Date(i.fecha).getFullYear()),
    ...egresos.map((e) => new Date(e.fecha).getFullYear()),
    new Date().getFullYear(),
  ])).sort().reverse();

  const ingresosYear = ingresos.filter((i) => new Date(i.fecha).getFullYear() === year);
  const egresosYear = egresos.filter((e) => new Date(e.fecha).getFullYear() === year);

  const totalIngresosYear = ingresosYear.reduce((s, i) => s + i.montoTotal, 0);
  const totalEgresosYear = egresosYear.reduce((s, e) => s + e.montoTotal, 0);
  const gananciaYear = totalIngresosYear - totalEgresosYear;
  const ivaCobradoYear = ingresosYear.filter((i) => i.factura).reduce((s, i) => s + i.iva, 0);
  const ivaPagadoYear = egresosYear.filter((e) => e.factura).reduce((s, e) => s + e.iva, 0);
  const facturadoIngresos = ingresosYear.filter((i) => i.factura).reduce((s, i) => s + i.montoTotal, 0);
  const noFacturadoIngresos = totalIngresosYear - facturadoIngresos;

  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const monthlyData = monthNames.map((name, idx) => ({
    name,
    Ingresos: ingresosYear.filter((i) => new Date(i.fecha).getMonth() === idx).reduce((s, i) => s + i.montoTotal, 0),
    Egresos: egresosYear.filter((e) => new Date(e.fecha).getMonth() === idx).reduce((s, e) => s + e.montoTotal, 0),
  }));

  const categoriaData = Object.entries(
    egresosYear.reduce<Record<string, number>>((acc, e) => { const cat = categoriaLabel(e.categoria); acc[cat] = (acc[cat] || 0) + e.montoTotal; return acc; }, {})
  ).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const conceptoData = Object.entries(
    ingresosYear.reduce<Record<string, number>>((acc, i) => { const cat = conceptoLabel(i.concepto); acc[cat] = (acc[cat] || 0) + i.montoTotal; return acc; }, {})
  ).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const bestMonth = monthlyData.reduce((best, m, idx) => m.Ingresos > (monthlyData[best]?.Ingresos || 0) ? idx : best, 0);

  return (
    <div>
      <PageHeader
        title="Reportes"
        description="Analisis financiero de tu negocio"
        action={
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-neutral-200 rounded-xl px-3.5 py-2.5 text-xs font-bold bg-white focus:outline-none focus:border-[#c72a09]">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard label="Ingresos Anuales" value={formatCurrency(totalIngresosYear)} subtitle={`${ingresosYear.length} ventas`} />
        <StatCard label="Egresos Anuales" value={formatCurrency(totalEgresosYear)} subtitle={`${egresosYear.length} gastos`} />
        <StatCard label="Ganancia Anual" value={formatCurrency(gananciaYear)} accent />
        <StatCard label="IVA por Pagar" value={formatCurrency(ivaCobradoYear - ivaPagadoYear)} subtitle="Anual acumulado" />
      </div>

      {/* Monthly Chart */}
      <div className="bg-white rounded-2xl border border-neutral-100 p-6 mb-8">
        <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-6">Ingresos vs Egresos por Mes</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} barGap={2}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#a3a3a3' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#a3a3a3' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: '12px', border: '1px solid #e5e5e5', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="Ingresos" fill="#0a0a0a" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Egresos" fill="#c72a09" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Pie Charts */}
        <div className="bg-white rounded-2xl border border-neutral-100 p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-6">Egresos por Categoria</h3>
          {categoriaData.length === 0 ? (
            <p className="text-sm text-neutral-300 text-center py-12">Sin datos</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoriaData} cx="50%" cy="50%" outerRadius={80} innerRadius={40} dataKey="value" label={({ name, percent }) => `${name || ''} ${((percent as number) * 100).toFixed(0)}%`} labelLine={false}>
                    {categoriaData.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: '12px', border: '1px solid #e5e5e5' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-neutral-100 p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-6">Ingresos por Concepto</h3>
          {conceptoData.length === 0 ? (
            <p className="text-sm text-neutral-300 text-center py-12">Sin datos</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={conceptoData} cx="50%" cy="50%" outerRadius={80} innerRadius={40} dataKey="value" label={({ name, percent }) => `${name || ''} ${((percent as number) * 100).toFixed(0)}%`} labelLine={false}>
                    {conceptoData.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: '12px', border: '1px solid #e5e5e5' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-[#0a0a0a] rounded-2xl p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-white/30 uppercase mb-5">Resumen Fiscal Anual</h3>
          <div className="space-y-4">
            <div className="flex justify-between"><span className="text-sm text-white/50">Facturado (Ingresos)</span><span className="text-sm font-bold text-white">{formatCurrency(facturadoIngresos)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-white/50">No Facturado</span><span className="text-sm font-bold text-white/40">{formatCurrency(noFacturadoIngresos)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-white/50">IVA Cobrado</span><span className="text-sm font-bold text-green-400">{formatCurrency(ivaCobradoYear)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-white/50">IVA Pagado</span><span className="text-sm font-bold text-red-400">{formatCurrency(ivaPagadoYear)}</span></div>
            <div className="border-t border-white/10 pt-4 flex justify-between"><span className="text-sm font-bold text-white">IVA Neto</span><span className="text-lg font-black text-[#c72a09]">{formatCurrency(ivaCobradoYear - ivaPagadoYear)}</span></div>
            <div className="flex justify-between"><span className="text-sm font-bold text-white">Margen</span><span className="text-lg font-black text-white">{totalIngresosYear > 0 ? `${((gananciaYear / totalIngresosYear) * 100).toFixed(1)}%` : '—'}</span></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-100 p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">Estadisticas</h3>
          <div className="space-y-4">
            <div className="flex justify-between"><span className="text-sm text-neutral-500">Promedio por Venta</span><span className="text-sm font-bold">{ingresosYear.length > 0 ? formatCurrency(totalIngresosYear / ingresosYear.length) : '—'}</span></div>
            <div className="flex justify-between"><span className="text-sm text-neutral-500">Ventas del Ano</span><span className="text-sm font-bold">{ingresosYear.length}</span></div>
            <div className="flex justify-between"><span className="text-sm text-neutral-500">Gastos del Ano</span><span className="text-sm font-bold">{egresosYear.length}</span></div>
            <div className="flex justify-between"><span className="text-sm text-neutral-500">Total Clientes</span><span className="text-sm font-bold">{totalClientes}</span></div>
            <div className="flex justify-between"><span className="text-sm text-neutral-500">% Facturado</span><span className="text-sm font-bold">{ingresosYear.length > 0 ? `${((ingresosYear.filter((i) => i.factura).length / ingresosYear.length) * 100).toFixed(0)}%` : '—'}</span></div>
            <div className="flex justify-between"><span className="text-sm text-neutral-500">Mejor Mes</span><span className="text-sm font-bold text-[#c72a09]">{monthNames[bestMonth]}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
