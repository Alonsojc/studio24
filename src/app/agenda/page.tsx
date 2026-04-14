'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getPedidos, getClientes } from '@/lib/store';
import { Pedido, Cliente } from '@/lib/types';
import { formatCurrency, estadoPedidoLabel, estadoPedidoColor } from '@/lib/helpers';
import PageHeader from '@/components/PageHeader';

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export default function AgendaPage() {
  const isClient = typeof window !== 'undefined';
  const [pedidos] = useState<Pedido[]>(() => (isClient ? getPedidos() : []));
  const [clientes] = useState<Cliente[]>(() => (isClient ? getClientes() : []));
  const [mounted] = useState(() => isClient);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const clienteName = (id: string) => clientes.find((c) => c.id === id)?.nombre || '';

  // Calendar math
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  // Monday = 0, Sunday = 6
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const today = new Date();
  const isToday = (d: number) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  // Pedidos by day (entrega)
  const pedidosByDay = new Map<number, Pedido[]>();
  const activePedidos = pedidos.filter((p) => p.estado !== 'cancelado');
  for (const p of activePedidos) {
    if (!p.fechaEntrega) continue;
    const d = new Date(p.fechaEntrega);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!pedidosByDay.has(day)) pedidosByDay.set(day, []);
      pedidosByDay.get(day)!.push(p);
    }
  }

  // Also track pedido dates (fechaPedido) with a different style
  const pedidoStartByDay = new Map<number, Pedido[]>();
  for (const p of activePedidos) {
    if (!p.fechaPedido) continue;
    const d = new Date(p.fechaPedido);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!pedidoStartByDay.has(day)) pedidoStartByDay.set(day, []);
      pedidoStartByDay.get(day)!.push(p);
    }
  }

  const prevMonth = () => {
    if (month === 0) {
      setYear(year - 1);
      setMonth(11);
    } else setMonth(month - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (month === 11) {
      setYear(year + 1);
      setMonth(0);
    } else setMonth(month + 1);
    setSelectedDay(null);
  };
  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDay(today.getDate());
  };

  // Build calendar grid
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedPedidos = selectedDay ? pedidosByDay.get(selectedDay) || [] : [];
  const selectedStarts = selectedDay
    ? (pedidoStartByDay.get(selectedDay) || []).filter((p) => !selectedPedidos.includes(p))
    : [];

  const exportarICS = () => {
    const events = activePedidos
      .filter((p) => p.fechaEntrega)
      .map((p) => {
        const d = p.fechaEntrega.replace(/-/g, '');
        const name = clienteName(p.clienteId);
        return [
          'BEGIN:VEVENT',
          `DTSTART;VALUE=DATE:${d}`,
          `DTEND;VALUE=DATE:${d}`,
          `SUMMARY:${p.urgente ? '🔴 ' : ''}${p.descripcion}`,
          `DESCRIPTION:${name ? `Cliente: ${name}\\n` : ''}Piezas: ${p.piezas}\\nTotal: ${formatCurrency(p.montoTotal)}\\nEstado: ${estadoPedidoLabel(p.estado)}`,
          `STATUS:${p.estado === 'entregado' ? 'COMPLETED' : 'CONFIRMED'}`,
          'END:VEVENT',
        ].join('\r\n');
      });

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Studio24//Entregas//ES',
      'CALSCALE:GREGORIAN',
      'X-WR-CALNAME:Studio 24 - Entregas',
      ...events,
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `studio24_entregas_${year}-${String(month + 1).padStart(2, '0')}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Stats
  const entregas = activePedidos.filter(
    (p) =>
      p.fechaEntrega &&
      new Date(p.fechaEntrega).getFullYear() === year &&
      new Date(p.fechaEntrega).getMonth() === month,
  );
  const vencidos = entregas.filter((p) => new Date(p.fechaEntrega) < today && p.estado !== 'entregado');

  return (
    <div>
      <PageHeader
        title="Agenda de Entregas"
        description={`${entregas.length} entregas programadas${vencidos.length > 0 ? ` · ${vencidos.length} vencidas` : ''}`}
        action={
          <button
            onClick={exportarICS}
            className="px-4 py-2.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase border border-neutral-200 text-neutral-500 hover:border-[#c72a09] hover:text-[#c72a09] transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
            Exportar .ics
          </button>
        }
      />

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={prevMonth}
            className="w-9 h-9 rounded-xl border border-neutral-200 flex items-center justify-center text-neutral-400 hover:text-[#0a0a0a] hover:border-neutral-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <h2 className="text-lg font-black text-[#0a0a0a] min-w-[200px] text-center">
            {MONTH_NAMES[month]} {year}
          </h2>
          <button
            onClick={nextMonth}
            className="w-9 h-9 rounded-xl border border-neutral-200 flex items-center justify-center text-neutral-400 hover:text-[#0a0a0a] hover:border-neutral-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
        <button
          onClick={goToday}
          className="px-4 py-2 rounded-xl text-xs font-bold tracking-[0.05em] uppercase border border-neutral-200 text-neutral-500 hover:border-[#c72a09] hover:text-[#c72a09] transition-colors"
        >
          Hoy
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-neutral-100 p-5">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAY_NAMES.map((d) => (
              <div
                key={d}
                className="text-center text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase py-2"
              >
                {d}
              </div>
            ))}
          </div>
          {/* Days */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (day === null) return <div key={i} />;
              const entregas = pedidosByDay.get(day) || [];
              const urgentes = entregas.filter((p) => p.urgente);
              const vencido = entregas.some((p) => new Date(p.fechaEntrega) < today && p.estado !== 'entregado');
              const isSelected = selectedDay === day;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                  className={`relative rounded-xl p-2 min-h-[70px] text-left transition-all border ${
                    isSelected
                      ? 'border-[#c72a09] bg-[#c72a09]/5'
                      : isToday(day)
                        ? 'border-[#c72a09]/30 bg-[#c72a09]/[0.03]'
                        : 'border-transparent hover:border-neutral-200 hover:bg-neutral-50/50'
                  }`}
                >
                  <span className={`text-sm font-bold ${isToday(day) ? 'text-[#c72a09]' : 'text-[#0a0a0a]'}`}>
                    {day}
                  </span>
                  {entregas.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {entregas.slice(0, 2).map((p) => (
                        <div
                          key={p.id}
                          className={`text-[8px] font-bold px-1.5 py-0.5 rounded truncate ${vencido && p.estado !== 'entregado' ? 'bg-red-100 text-red-600' : urgentes.includes(p) ? 'bg-[#c72a09]/10 text-[#c72a09]' : 'bg-neutral-100 text-neutral-600'}`}
                        >
                          {p.descripcion.substring(0, 15)}
                          {p.descripcion.length > 15 ? '...' : ''}
                        </div>
                      ))}
                      {entregas.length > 2 && (
                        <p className="text-[8px] text-neutral-400 font-bold">+{entregas.length - 2} más</p>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail panel */}
        <div className="bg-white rounded-2xl border border-neutral-100 p-5">
          {selectedDay ? (
            <div>
              <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-4">
                {selectedDay} de {MONTH_NAMES[month]}
              </h3>
              {selectedPedidos.length === 0 && selectedStarts.length === 0 ? (
                <p className="text-sm text-neutral-300 text-center py-8">Sin pedidos este día</p>
              ) : (
                <div className="space-y-3">
                  {selectedPedidos.length > 0 && (
                    <>
                      <p className="text-[9px] font-bold tracking-[0.1em] text-[#c72a09] uppercase">Entregas</p>
                      {selectedPedidos.map((p) => (
                        <div key={p.id} className="border border-neutral-100 rounded-xl p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-bold text-[#0a0a0a]">{p.descripcion}</p>
                              <p className="text-xs text-neutral-400 mt-0.5">
                                {clienteName(p.clienteId) || 'Sin cliente'} &middot; {p.piezas} pzas
                              </p>
                            </div>
                            <span className="text-sm font-bold text-[#0a0a0a] shrink-0">
                              {formatCurrency(p.montoTotal)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <span
                              className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase ${estadoPedidoColor(p.estado)}`}
                            >
                              {estadoPedidoLabel(p.estado)}
                            </span>
                            {p.urgente && (
                              <span className="text-[9px] font-bold text-[#c72a09] uppercase">Urgente</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  {selectedStarts.length > 0 && (
                    <>
                      <p className="text-[9px] font-bold tracking-[0.1em] text-neutral-400 uppercase mt-2">
                        Iniciados este día
                      </p>
                      {selectedStarts.map((p) => (
                        <div key={p.id} className="border border-neutral-50 rounded-xl p-3">
                          <p className="text-sm font-semibold text-neutral-600">{p.descripcion}</p>
                          <p className="text-xs text-neutral-400 mt-0.5">
                            {clienteName(p.clienteId)} &middot; {p.piezas} pzas
                          </p>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <svg
                className="w-10 h-10 text-neutral-200 mx-auto mb-3"
                fill="none"
                stroke="currentColor"
                strokeWidth={1}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                />
              </svg>
              <p className="text-xs text-neutral-300">Selecciona un día para ver los pedidos</p>
            </div>
          )}

          {/* Quick link */}
          <div className="border-t border-neutral-100 mt-4 pt-4">
            <Link
              href="/pedidos"
              className="text-[10px] font-bold tracking-[0.08em] text-[#c72a09] uppercase hover:underline"
            >
              Ver todos los pedidos
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
