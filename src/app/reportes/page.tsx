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

const COLORS = ['#7c3aed', '#f472b6', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#06b6d4'];

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

  if (!mounted) return <div className="p-8">Cargando...</div>;

  const years = Array.from(
    new Set([
      ...ingresos.map((i) => new Date(i.fecha).getFullYear()),
      ...egresos.map((e) => new Date(e.fecha).getFullYear()),
      new Date().getFullYear(),
    ])
  ).sort().reverse();

  const ingresosYear = ingresos.filter((i) => new Date(i.fecha).getFullYear() === year);
  const egresosYear = egresos.filter((e) => new Date(e.fecha).getFullYear() === year);

  const totalIngresosYear = ingresosYear.reduce((s, i) => s + i.montoTotal, 0);
  const totalEgresosYear = egresosYear.reduce((s, e) => s + e.montoTotal, 0);
  const gananciaYear = totalIngresosYear - totalEgresosYear;
  const ivaCobradoYear = ingresosYear.filter((i) => i.factura).reduce((s, i) => s + i.iva, 0);
  const ivaPagadoYear = egresosYear.filter((e) => e.factura).reduce((s, e) => s + e.iva, 0);

  // Monthly data for bar chart
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const monthlyData = monthNames.map((name, idx) => {
    const monthIngresos = ingresosYear
      .filter((i) => new Date(i.fecha).getMonth() === idx)
      .reduce((s, i) => s + i.montoTotal, 0);
    const monthEgresos = egresosYear
      .filter((e) => new Date(e.fecha).getMonth() === idx)
      .reduce((s, e) => s + e.montoTotal, 0);
    return { name, Ingresos: monthIngresos, Egresos: monthEgresos, Ganancia: monthIngresos - monthEgresos };
  });

  // Expense categories for pie chart
  const categoriaData = Object.entries(
    egresosYear.reduce<Record<string, number>>((acc, e) => {
      const cat = categoriaLabel(e.categoria);
      acc[cat] = (acc[cat] || 0) + e.montoTotal;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // Income concepts for pie chart
  const conceptoData = Object.entries(
    ingresosYear.reduce<Record<string, number>>((acc, i) => {
      const cat = conceptoLabel(i.concepto);
      acc[cat] = (acc[cat] || 0) + i.montoTotal;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // Top clients
  const clienteTotals = Object.entries(
    ingresosYear.reduce<Record<string, number>>((acc, i) => {
      const cId = i.clienteId || 'sin_cliente';
      acc[cId] = (acc[cId] || 0) + i.montoTotal;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const facturadoIngresos = ingresosYear.filter((i) => i.factura).reduce((s, i) => s + i.montoTotal, 0);
  const noFacturadoIngresos = totalIngresosYear - facturadoIngresos;

  return (
    <div>
      <PageHeader
        title="Reportes"
        description="Analisis financiero de tu negocio"
        action={
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        }
      />

      {/* Annual Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Ingresos Anuales" value={formatCurrency(totalIngresosYear)} icon="💰" color="green" />
        <StatCard label="Egresos Anuales" value={formatCurrency(totalEgresosYear)} icon="💸" color="red" />
        <StatCard label="Ganancia Anual" value={formatCurrency(gananciaYear)} icon="📈" color={gananciaYear >= 0 ? 'purple' : 'red'} />
        <StatCard label="IVA por Pagar" value={formatCurrency(ivaCobradoYear - ivaPagadoYear)} icon="🏛️" color="yellow" />
      </div>

      {/* Monthly Bar Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Ingresos vs Egresos por Mes
        </h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Legend />
              <Bar dataKey="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Egresos" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Expenses by Category Pie */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Egresos por Categoria
          </h3>
          {categoriaData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sin datos</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoriaData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) => `${name || ''} ${((percent as number) * 100).toFixed(0)}%`}
                  >
                    {categoriaData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Income by Concept Pie */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Ingresos por Concepto
          </h3>
          {conceptoData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sin datos</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={conceptoData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) => `${name || ''} ${((percent as number) * 100).toFixed(0)}%`}
                  >
                    {conceptoData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Tax Summary & Invoice Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Resumen Fiscal Anual
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Total Facturado (Ingresos)</span>
              <span className="font-semibold">{formatCurrency(facturadoIngresos)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">No Facturado (Ingresos)</span>
              <span className="font-semibold text-amber-600">{formatCurrency(noFacturadoIngresos)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">IVA Cobrado</span>
              <span className="font-semibold text-emerald-600">{formatCurrency(ivaCobradoYear)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">IVA Pagado (Deducible)</span>
              <span className="font-semibold text-red-600">{formatCurrency(ivaPagadoYear)}</span>
            </div>
            <div className="border-t pt-3 flex justify-between">
              <span className="font-semibold text-gray-700">IVA Neto por Pagar</span>
              <span className="font-bold text-purple-700">{formatCurrency(ivaCobradoYear - ivaPagadoYear)}</span>
            </div>
            <div className="border-t pt-3 flex justify-between">
              <span className="font-semibold text-gray-700">Margen de Ganancia</span>
              <span className="font-bold text-purple-700">
                {totalIngresosYear > 0
                  ? `${((gananciaYear / totalIngresosYear) * 100).toFixed(1)}%`
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Estadisticas Rapidas
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Promedio Ingreso por Venta</span>
              <span className="font-semibold">
                {ingresosYear.length > 0 ? formatCurrency(totalIngresosYear / ingresosYear.length) : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Ventas del Ano</span>
              <span className="font-semibold">{ingresosYear.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Gastos del Ano</span>
              <span className="font-semibold">{egresosYear.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Total Clientes</span>
              <span className="font-semibold">{totalClientes}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Ingresos Facturados</span>
              <span className="font-semibold">
                {ingresosYear.length > 0
                  ? `${((ingresosYear.filter((i) => i.factura).length / ingresosYear.length) * 100).toFixed(0)}%`
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Mes mas Fuerte</span>
              <span className="font-semibold">
                {monthlyData.reduce((best, m, idx) =>
                  m.Ingresos > (monthlyData[best]?.Ingresos || 0) ? idx : best, 0
                ) >= 0
                  ? monthNames[monthlyData.reduce((best, m, idx) =>
                      m.Ingresos > (monthlyData[best]?.Ingresos || 0) ? idx : best, 0
                    )]
                  : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
