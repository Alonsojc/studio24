'use client';

import { useEffect, useState } from 'react';
import { getIngresos, getEgresos, getClientes } from '@/lib/store';
import { Ingreso, Egreso } from '@/lib/types';
import { formatCurrency, formatDate, formaPagoLabel, conceptoLabel, categoriaLabel } from '@/lib/helpers';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';

export default function Dashboard() {
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [totalClientes, setTotalClientes] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setIngresos(getIngresos());
    setEgresos(getEgresos());
    setTotalClientes(getClientes().length);
    setMounted(true);
  }, []);

  if (!mounted) return <div className="p-8">Cargando...</div>;

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const ingresosDelMes = ingresos.filter((i) => {
    const d = new Date(i.fecha);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  const egresosDelMes = egresos.filter((e) => {
    const d = new Date(e.fecha);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const totalIngresosMes = ingresosDelMes.reduce((s, i) => s + i.montoTotal, 0);
  const totalEgresosMes = egresosDelMes.reduce((s, e) => s + e.montoTotal, 0);
  const ganancia = totalIngresosMes - totalEgresosMes;
  const ivaCobrado = ingresosDelMes.filter((i) => i.factura).reduce((s, i) => s + i.iva, 0);
  const ivaPagado = egresosDelMes.filter((e) => e.factura).reduce((s, e) => s + e.iva, 0);

  const facturadoMes = ingresosDelMes.filter((i) => i.factura).reduce((s, i) => s + i.montoTotal, 0);

  const recentIngresos = [...ingresos].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5);
  const recentEgresos = [...egresos].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5);

  const monthName = now.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Resumen del mes de ${monthName}`}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Ingresos del Mes"
          value={formatCurrency(totalIngresosMes)}
          icon="💰"
          color="green"
          trend={`${ingresosDelMes.length} transacciones`}
        />
        <StatCard
          label="Egresos del Mes"
          value={formatCurrency(totalEgresosMes)}
          icon="💸"
          color="red"
          trend={`${egresosDelMes.length} transacciones`}
        />
        <StatCard
          label="Ganancia Neta"
          value={formatCurrency(ganancia)}
          icon={ganancia >= 0 ? '📈' : '📉'}
          color={ganancia >= 0 ? 'purple' : 'red'}
          trend={ganancia >= 0 ? 'Positiva' : 'Negativa'}
        />
        <StatCard
          label="Clientes"
          value={String(totalClientes)}
          icon="👥"
          color="blue"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Resumen Fiscal del Mes
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Facturado (Ingresos)</span>
              <span className="font-semibold text-gray-900">{formatCurrency(facturadoMes)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">IVA Cobrado</span>
              <span className="font-semibold text-emerald-600">{formatCurrency(ivaCobrado)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">IVA Pagado (Egresos)</span>
              <span className="font-semibold text-red-600">{formatCurrency(ivaPagado)}</span>
            </div>
            <div className="border-t pt-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-gray-700">IVA por Pagar</span>
              <span className="font-bold text-purple-700">{formatCurrency(ivaCobrado - ivaPagado)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Formas de Pago (Ingresos)
          </h3>
          <div className="space-y-2">
            {(['efectivo', 'tarjeta', 'transferencia', 'otro'] as const).map((fp) => {
              const total = ingresosDelMes
                .filter((i) => i.formaPago === fp)
                .reduce((s, i) => s + i.montoTotal, 0);
              const pct = totalIngresosMes > 0 ? (total / totalIngresosMes) * 100 : 0;
              return (
                <div key={fp}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{formaPagoLabel(fp)}</span>
                    <span className="font-medium">{formatCurrency(total)}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-purple-500 h-2 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Ultimos Ingresos
          </h3>
          {recentIngresos.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Sin ingresos registrados</p>
          ) : (
            <div className="space-y-2">
              {recentIngresos.map((i) => (
                <div key={i.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{i.descripcion}</p>
                    <p className="text-xs text-gray-500">
                      {formatDate(i.fecha)} &middot; {conceptoLabel(i.concepto)}
                      {i.factura && <span className="ml-1 text-emerald-600">&middot; Facturado</span>}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-600">
                    +{formatCurrency(i.montoTotal)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Ultimos Egresos
          </h3>
          {recentEgresos.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Sin egresos registrados</p>
          ) : (
            <div className="space-y-2">
              {recentEgresos.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{e.descripcion}</p>
                    <p className="text-xs text-gray-500">
                      {formatDate(e.fecha)} &middot; {categoriaLabel(e.categoria)}
                      {e.factura && <span className="ml-1 text-emerald-600">&middot; Facturado</span>}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-red-500">
                    -{formatCurrency(e.montoTotal)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
