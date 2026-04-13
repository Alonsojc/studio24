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

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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
        description={`Resumen de ${monthName}`}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard
          label="Ingresos"
          value={formatCurrency(totalIngresosMes)}
          subtitle={`${ingresosDelMes.length} ventas`}
        />
        <StatCard
          label="Egresos"
          value={formatCurrency(totalEgresosMes)}
          subtitle={`${egresosDelMes.length} gastos`}
        />
        <StatCard
          label="Ganancia Neta"
          value={formatCurrency(ganancia)}
          subtitle={ganancia >= 0 ? 'Positiva' : 'Negativa'}
          accent
        />
        <StatCard
          label="Clientes"
          value={String(totalClientes)}
          subtitle="Registrados"
        />
      </div>

      {/* Fiscal + Payment */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-10">
        <div className="bg-white rounded-2xl border border-neutral-100 p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">
            Resumen Fiscal
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-neutral-500">Facturado</span>
              <span className="text-sm font-bold text-[#0a0a0a]">{formatCurrency(facturadoMes)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-neutral-500">IVA Cobrado</span>
              <span className="text-sm font-bold text-green-600">{formatCurrency(ivaCobrado)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-neutral-500">IVA Pagado</span>
              <span className="text-sm font-bold text-red-500">{formatCurrency(ivaPagado)}</span>
            </div>
            <div className="border-t border-neutral-100 pt-4 flex justify-between items-center">
              <span className="text-sm font-bold text-[#0a0a0a]">IVA por Pagar</span>
              <span className="text-lg font-black text-[#c72a09]">{formatCurrency(ivaCobrado - ivaPagado)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-100 p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">
            Formas de Pago
          </h3>
          <div className="space-y-4">
            {(['efectivo', 'tarjeta', 'transferencia', 'otro'] as const).map((fp) => {
              const total = ingresosDelMes
                .filter((i) => i.formaPago === fp)
                .reduce((s, i) => s + i.montoTotal, 0);
              const pct = totalIngresosMes > 0 ? (total / totalIngresosMes) * 100 : 0;
              return (
                <div key={fp}>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-neutral-500 font-medium">{formaPagoLabel(fp)}</span>
                    <span className="font-bold text-[#0a0a0a]">{formatCurrency(total)}</span>
                  </div>
                  <div className="w-full bg-neutral-100 rounded-full h-1.5">
                    <div
                      className="bg-[#c72a09] h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-neutral-100 p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">
            Ultimos Ingresos
          </h3>
          {recentIngresos.length === 0 ? (
            <p className="text-sm text-neutral-300 py-8 text-center">Sin ingresos</p>
          ) : (
            <div className="space-y-1">
              {recentIngresos.map((i) => (
                <div key={i.id} className="flex items-center justify-between py-3 border-b border-neutral-50 last:border-0">
                  <div>
                    <p className="text-sm font-semibold text-[#0a0a0a]">{i.descripcion}</p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {formatDate(i.fecha)} &middot; {conceptoLabel(i.concepto)}
                      {i.factura && <span className="text-[#c72a09] font-semibold"> &middot; F</span>}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-green-600">
                    +{formatCurrency(i.montoTotal)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-neutral-100 p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">
            Ultimos Egresos
          </h3>
          {recentEgresos.length === 0 ? (
            <p className="text-sm text-neutral-300 py-8 text-center">Sin egresos</p>
          ) : (
            <div className="space-y-1">
              {recentEgresos.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-3 border-b border-neutral-50 last:border-0">
                  <div>
                    <p className="text-sm font-semibold text-[#0a0a0a]">{e.descripcion}</p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {formatDate(e.fecha)} &middot; {categoriaLabel(e.categoria)}
                      {e.factura && <span className="text-[#c72a09] font-semibold"> &middot; F</span>}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-red-500">
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
