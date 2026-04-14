'use client';

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

export default function Dashboard() {
  const { data: ingresos, loading: l1 } = useCloud<Ingreso[]>(cloudGetIngresos);
  const { data: egresos, loading: l2 } = useCloud<Egreso[]>(cloudGetEgresos);
  const { data: pedidos, loading: l3 } = useCloud<Pedido[]>(cloudGetPedidos);
  const { data: clientes, loading: l4 } = useCloud<Cliente[]>(cloudGetClientes);

  if (l1 || l2 || l3 || l4 || !ingresos || !egresos || !pedidos || !clientes) {
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
      <PageHeader title="Dashboard" description={`Resumen de ${monthName}`} />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard
          label="Ingresos"
          value={formatCurrency(totalIngresosMes)}
          subtitle={`${ingresosDelMes.length} ventas`}
        />
        <StatCard label="Egresos" value={formatCurrency(totalEgresosMes)} subtitle={`${egresosDelMes.length} gastos`} />
        <StatCard
          label="Ganancia Neta"
          value={formatCurrency(ganancia)}
          subtitle={ganancia >= 0 ? 'Positiva' : 'Negativa'}
          accent
        />
        <StatCard label="Clientes" value={String(clientes.length)} subtitle="Registrados" />
      </div>

      {/* Fiscal + Payment */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-10">
        <div className="bg-white rounded-2xl border border-neutral-100 p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">Resumen Fiscal</h3>
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
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">Formas de Pago</h3>
          <div className="space-y-4">
            {(['efectivo', 'tarjeta', 'transferencia', 'otro'] as const).map((fp) => {
              const total = ingresosDelMes.filter((i) => i.formaPago === fp).reduce((s, i) => s + i.montoTotal, 0);
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
                <h3 className="text-[10px] font-bold tracking-[0.12em] text-white/30 uppercase">Pedidos Activos</h3>
                <p className="text-xs text-white/20 mt-0.5">
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
                    <p className="text-[9px] font-bold tracking-[0.08em] text-white/25 uppercase mt-0.5">
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
                    <p className="text-sm font-semibold text-[#0a0a0a]">{e.descripcion}</p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {formatDate(e.fecha)} &middot; {categoriaLabel(e.categoria)}
                      {e.factura && <span className="text-[#c72a09] font-semibold"> &middot; F</span>}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-red-500">-{formatCurrency(e.montoTotal)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
