'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cloudGetIngresos, cloudGetEgresos, cloudGetClientes, cloudGetPedidos } from '@/lib/store-cloud';
import { Ingreso, Egreso, Pedido, Cliente } from '@/lib/types';
import {
  formatCurrency,
  formatDate,
  formaPagoLabel,
  conceptoLabel,
  categoriaLabel,
  estadoPedidoLabel,
} from '@/lib/helpers';
import { useCloud } from '@/lib/useCloud';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';

type DashFilter = 'mes' | 'año' | 'todo';
const filterLabels: Record<DashFilter, string> = { mes: 'Mes actual', año: 'Año actual', todo: 'Histórico' };

export default function Dashboard() {
  const { data: ingresos, loading: l1 } = useCloud<Ingreso[]>(cloudGetIngresos);
  const { data: egresos, loading: l2 } = useCloud<Egreso[]>(cloudGetEgresos);
  const { data: pedidos, loading: l3 } = useCloud<Pedido[]>(cloudGetPedidos);
  const { data: clientes, loading: l4 } = useCloud<Cliente[]>(cloudGetClientes);
  const [filter, setFilter] = useState<DashFilter>('mes');

  if (l1 || l2 || l3 || l4 || !ingresos || !egresos || !pedidos || !clientes) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const now = new Date();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const currentYear = String(now.getFullYear());
  const currentYearMonth = `${currentYear}-${currentMonth}`;

  const filterFn = (fecha: string) => {
    if (filter === 'todo') return true;
    if (filter === 'año') return fecha.startsWith(currentYear + '-');
    return fecha.startsWith(currentYearMonth);
  };

  const ingresosFiltered = ingresos.filter((i) => filterFn(i.fecha));
  const egresosFiltered = egresos.filter((e) => filterFn(e.fecha));
  // Exclude soloFiscal egresos from business metrics (they only count in Fiscal)
  const egresosNegocio = egresosFiltered.filter((e) => !e.soloFiscal);

  const totalIngresos = ingresosFiltered.reduce((s, i) => s + i.montoTotal, 0);
  const totalEgresos = egresosNegocio.reduce((s, e) => s + e.montoTotal, 0);
  const ganancia = totalIngresos - totalEgresos;
  const ivaCobrado = ingresosFiltered.filter((i) => i.factura).reduce((s, i) => s + i.iva, 0);
  const ivaPagado = egresosFiltered.filter((e) => e.factura).reduce((s, e) => s + e.iva, 0);
  const facturado = ingresosFiltered.filter((i) => i.factura).reduce((s, i) => s + i.montoTotal, 0);

  const errores = egresosNegocio.filter((e) => e.categoria === 'error');
  const totalErrores = errores.reduce((s, e) => s + e.montoTotal, 0);

  // Trend: compare with previous period
  const prevFilterFn = (fecha: string) => {
    if (filter === 'todo') return false;
    const m = parseInt(fecha.substring(5, 7), 10);
    const y = parseInt(fecha.substring(0, 4), 10);
    const yearNum = parseInt(currentYear, 10);
    const monthNum = parseInt(currentMonth, 10);
    if (filter === 'año') return y === yearNum - 1;
    const prevM = monthNum; // currentMonth is 1-indexed; prevM equals the 1-indexed previous month
    if (prevM === 1) return y === yearNum - 1 && m === 12;
    return y === yearNum && m === prevM - 1;
  };
  const prevIngresos =
    filter !== 'todo' ? ingresos.filter((i) => prevFilterFn(i.fecha)).reduce((s, i) => s + i.montoTotal, 0) : 0;
  const prevEgresos =
    filter !== 'todo'
      ? egresos.filter((e) => prevFilterFn(e.fecha) && !e.soloFiscal).reduce((s, e) => s + e.montoTotal, 0)
      : 0;
  const trendIng = prevIngresos > 0 ? ((totalIngresos - prevIngresos) / prevIngresos) * 100 : 0;
  const trendEg = prevEgresos > 0 ? ((totalEgresos - prevEgresos) / prevEgresos) * 100 : 0;
  const trendLabel = (pct: number) => {
    if (pct === 0) return '';
    const arrow = pct > 0 ? '+' : '';
    return `${arrow}${pct.toFixed(0)}% vs anterior`;
  };

  const recentIngresos = [...ingresos].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5);
  const recentEgresos = [...egresos].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5);

  const monthName = now.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  const description =
    filter === 'mes' ? `Resumen de ${monthName}` : filter === 'año' ? `Resumen ${currentYear}` : 'Resumen histórico';

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={description}
        action={
          <div className="flex gap-1 bg-neutral-100 rounded-xl p-1">
            {(['mes', 'año', 'todo'] as DashFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold tracking-[0.03em] transition-all ${filter === f ? 'bg-white text-[#0a0a0a] shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}
              >
                {filterLabels[f]}
              </button>
            ))}
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-10">
        <StatCard
          label="Ingresos"
          value={formatCurrency(totalIngresos)}
          subtitle={trendLabel(trendIng) || `${ingresosFiltered.length} ventas`}
          color="green"
        />
        <StatCard
          label="Egresos"
          value={formatCurrency(totalEgresos)}
          subtitle={trendLabel(trendEg) || `${egresosNegocio.length} gastos`}
          color="red"
        />
        <StatCard
          label="Ganancia Neta"
          value={formatCurrency(ganancia)}
          subtitle={ganancia >= 0 ? 'Positiva' : 'Negativa'}
          color={ganancia >= 0 ? 'green' : 'red'}
        />
        <StatCard label="Clientes" value={String(clientes.length)} subtitle="Registrados" />
      </div>

      {/* Errores del mes */}
      {totalErrores > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-red-600">Errores y desperdicios</p>
              <p className="text-[10px] text-red-400 mt-0.5">
                {errores.length} errores · {totalEgresos > 0 ? ((totalErrores / totalEgresos) * 100).toFixed(1) : 0}% de
                los egresos
              </p>
            </div>
            <p className="text-lg font-black text-red-600">{formatCurrency(totalErrores)}</p>
          </div>
        </div>
      )}

      {/* Facturas pendientes + Facturado vs No facturado */}
      {(() => {
        const sinFacturaIng = ingresosFiltered.filter((i) => !i.factura && i.montoTotal >= 1000);
        const sinFacturaEg = egresosFiltered.filter((e) => !e.factura && e.montoTotal >= 1000);
        const totalSinFactura = sinFacturaIng.length + sinFacturaEg.length;
        const noFacturado = totalIngresos - facturado;
        const pctFacturado = totalIngresos > 0 ? (facturado / totalIngresos) * 100 : 0;
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-10">
            {/* Facturado vs No Facturado */}
            <div className="bg-white rounded-2xl border border-neutral-100 p-5">
              <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-3">
                Facturado vs No facturado
              </h3>
              <div className="flex items-center gap-4 mb-2">
                <span className="text-2xl font-black text-[#0a0a0a]">{pctFacturado.toFixed(0)}%</span>
                <div className="flex-1">
                  <div className="w-full bg-neutral-100 rounded-full h-2.5">
                    <div
                      className="bg-green-500 h-2.5 rounded-full transition-all"
                      style={{ width: `${pctFacturado}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-green-600 font-bold">Facturado: {formatCurrency(facturado)}</span>
                <span className="text-neutral-400 font-bold">Sin factura: {formatCurrency(noFacturado)}</span>
              </div>
            </div>

            {/* Facturas pendientes */}
            {totalSinFactura > 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                <h3 className="text-[10px] font-bold tracking-[0.12em] text-amber-700 uppercase mb-2">
                  Facturas pendientes
                </h3>
                <p className="text-xs text-amber-600">
                  <span className="font-black text-lg text-amber-700">{totalSinFactura}</span> registros mayores a
                  $1,000 sin factura
                </p>
                {sinFacturaIng.length > 0 && (
                  <p className="text-[10px] text-amber-500 mt-1">
                    {sinFacturaIng.length} ingreso{sinFacturaIng.length > 1 ? 's' : ''} — considera emitir factura
                  </p>
                )}
                {sinFacturaEg.length > 0 && (
                  <p className="text-[10px] text-amber-500 mt-0.5">
                    {sinFacturaEg.length} egreso{sinFacturaEg.length > 1 ? 's' : ''} — considera pedir factura
                  </p>
                )}
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex items-center">
                <p className="text-xs text-green-600 font-bold">Todos los registros mayores a $1,000 tienen factura</p>
              </div>
            )}
          </div>
        );
      })()}

      {/* Fiscal + Payment */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-10">
        <div className="bg-white rounded-2xl border border-neutral-100 p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">Resumen Fiscal</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-neutral-500">Facturado</span>
              <span className="text-sm font-bold text-[#0a0a0a]">{formatCurrency(facturado)}</span>
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
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">Formas de Pago</h3>
          <div className="space-y-4">
            {(['efectivo', 'tarjeta', 'transferencia', 'otro'] as const).map((fp) => {
              const total = ingresosFiltered.filter((i) => i.formaPago === fp).reduce((s, i) => s + i.montoTotal, 0);
              const pct = totalIngresos > 0 ? (total / totalIngresos) * 100 : 0;
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

      {/* Active Orders */}
      {(() => {
        const activos = pedidos.filter((p) => p.estado !== 'entregado' && p.estado !== 'cancelado');
        const urgentes = activos.filter((p) => p.urgente);
        const hoy = new Date();
        const en2dias = new Date(hoy.getTime() + 2 * 24 * 60 * 60 * 1000);
        const vencidos = activos.filter((p) => p.fechaEntrega && new Date(p.fechaEntrega) < hoy);
        const porVencer = activos.filter((p) => {
          if (!p.fechaEntrega) return false;
          const entrega = new Date(p.fechaEntrega);
          return entrega >= hoy && entrega <= en2dias;
        });
        const clientes = [...new Set(activos.map((p) => p.clienteId))];
        if (activos.length === 0) return null;
        return (
          <div className="bg-[#0a0a0a] rounded-2xl p-6 mb-10">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-[10px] font-bold tracking-[0.12em] text-white/50 uppercase">Pedidos Activos</h3>
                <p className="text-xs text-white/50 mt-0.5">
                  {activos.length} pedidos &middot; {clientes.length} clientes &middot;{' '}
                  {formatCurrency(activos.reduce((s, p) => s + p.montoTotal, 0))} en producción
                </p>
              </div>
              <Link
                href="/pedidos"
                className="text-[10px] font-bold tracking-[0.08em] text-[#c72a09] uppercase hover:underline"
              >
                Ver todos
              </Link>
            </div>
            {urgentes.length > 0 && (
              <div className="bg-[#c72a09]/10 border border-[#c72a09]/20 rounded-xl p-3 mb-4">
                <p className="text-xs font-bold text-[#c72a09]">
                  {urgentes.length} pedido{urgentes.length > 1 ? 's' : ''} urgente{urgentes.length > 1 ? 's' : ''}
                </p>
                {urgentes.map((p) => (
                  <p key={p.id} className="text-xs text-white/50 mt-1">
                    {p.descripcion} &middot; {estadoPedidoLabel(p.estado)}
                    {p.fechaEntrega ? ` · Entrega: ${formatDate(p.fechaEntrega)}` : ''}
                  </p>
                ))}
              </div>
            )}
            {vencidos.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-4">
                <p className="text-xs font-bold text-amber-400">
                  {vencidos.length} pedido{vencidos.length > 1 ? 's' : ''} vencido{vencidos.length > 1 ? 's' : ''}
                </p>
                {vencidos.map((p) => (
                  <p key={p.id} className="text-xs text-white/50 mt-1">
                    {p.descripcion} &middot; Venció: {formatDate(p.fechaEntrega)}
                  </p>
                ))}
              </div>
            )}
            {porVencer.length > 0 && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 mb-4">
                <p className="text-xs font-bold text-blue-400">
                  {porVencer.length} pedido{porVencer.length > 1 ? 's' : ''} por vencer en 48h
                </p>
                {porVencer.map((p) => (
                  <p key={p.id} className="text-xs text-white/50 mt-1">
                    {p.descripcion} &middot; Entrega: {formatDate(p.fechaEntrega)}
                  </p>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {(['pendiente', 'diseno', 'aprobado', 'en_maquina', 'terminado'] as const).map((estado) => {
                const count = activos.filter((p) => p.estado === estado).length;
                return (
                  <div key={estado} className="bg-white/[0.04] rounded-xl p-3 text-center">
                    <p className="text-lg font-black text-white">{count}</p>
                    <p className="text-[9px] font-bold tracking-[0.08em] text-white/50 uppercase mt-0.5">
                      {estadoPedidoLabel(estado)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-neutral-100 p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">Últimos Ingresos</h3>
          {recentIngresos.length === 0 ? (
            <p className="text-sm text-neutral-300 py-8 text-center">Sin ingresos</p>
          ) : (
            <div className="space-y-1">
              {recentIngresos.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center justify-between py-3 border-b border-neutral-50 last:border-0"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#0a0a0a]">{i.descripcion}</p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {formatDate(i.fecha)} &middot; {conceptoLabel(i.concepto)}
                      {i.factura && <span className="text-[#c72a09] font-semibold"> &middot; F</span>}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-green-600">+{formatCurrency(i.montoTotal)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-neutral-100 p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">Últimos Egresos</h3>
          {recentEgresos.length === 0 ? (
            <p className="text-sm text-neutral-300 py-8 text-center">Sin egresos</p>
          ) : (
            <div className="space-y-1">
              {recentEgresos.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between py-3 border-b border-neutral-50 last:border-0"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#0a0a0a]">
                      {e.descripcion}
                      {e.soloFiscal && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[8px] font-bold bg-purple-100 text-purple-600 uppercase">
                          Fiscal
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {formatDate(e.fecha)} &middot; {categoriaLabel(e.categoria)}
                      {e.factura && <span className="text-[#c72a09] font-semibold"> &middot; F</span>}
                    </p>
                  </div>
                  <span className={`text-sm font-bold ${e.soloFiscal ? 'text-purple-400' : 'text-red-500'}`}>
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
