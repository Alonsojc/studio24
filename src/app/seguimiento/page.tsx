'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getPedidos, getClientes, getConfig } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { EstadoPedido, Pedido, Cliente, ConfigNegocio } from '@/lib/types';
import { formatCurrency, formatDate, conceptoLabel } from '@/lib/helpers';

const STEPS: { estado: EstadoPedido; label: string; icon: string }[] = [
  { estado: 'pendiente', label: 'Recibido', icon: '📋' },
  { estado: 'diseno', label: 'En Diseño', icon: '🎨' },
  { estado: 'aprobado', label: 'Aprobado', icon: '✅' },
  { estado: 'en_maquina', label: 'En Máquina', icon: '🧵' },
  { estado: 'terminado', label: 'Terminado', icon: '📦' },
  { estado: 'entregado', label: 'Entregado', icon: '🤝' },
];

function stepIndex(estado: EstadoPedido): number {
  const idx = STEPS.findIndex((s) => s.estado === estado);
  return idx >= 0 ? idx : -1;
}

export default function SeguimientoPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SeguimientoContent />
    </Suspense>
  );
}

function SeguimientoContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('t');
  const id = searchParams.get('id');
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [cliente, setCliente] = useState<Pick<Cliente, 'nombre'> | null>(null);
  const [config, setConfig] = useState<Pick<ConfigNegocio, 'nombreNegocio' | 'telefono' | 'email'> | null>(null);
  const [loading, setLoading] = useState(Boolean(token || id));
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(Boolean(token || id));
      setNotFound(false);

      if (token) {
        const { data, error } = await supabase.rpc('get_public_pedido_tracking', { p_token: token });
        if (cancelled) return;
        if (error || !data) {
          setPedido(null);
          setNotFound(true);
          setLoading(false);
          return;
        }
        const payload = data as {
          pedido: Pedido;
          cliente?: Pick<Cliente, 'nombre'> | null;
          config?: Pick<ConfigNegocio, 'nombreNegocio' | 'telefono' | 'email'> | null;
        };
        setPedido(payload.pedido);
        setCliente(payload.cliente || null);
        setConfig(payload.config || null);
        setLoading(false);
        return;
      }

      if (id && typeof window !== 'undefined') {
        const p = getPedidos().find((pedidoItem) => pedidoItem.id === id) || null;
        if (!p) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setPedido(p);
        setCliente(getClientes().find((c) => c.id === p.clienteId) || null);
        setConfig(getConfig());
        setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  // Public layout — no sidebar
  if (!token && !id) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center p-4 -ml-0 lg:-ml-[260px]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#c72a09] text-white flex items-center justify-center text-2xl font-black mx-auto mb-4">
            S24
          </div>
          <h1 className="text-xl font-black text-[#0a0a0a]">Studio 24</h1>
          <p className="text-sm text-neutral-400 mt-2">Se necesita un ID de pedido para ver el seguimiento.</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center p-4 -ml-0 lg:-ml-[260px]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-neutral-200 text-neutral-400 flex items-center justify-center text-2xl font-black mx-auto mb-4">
            ?
          </div>
          <h1 className="text-xl font-black text-[#0a0a0a]">Pedido no encontrado</h1>
          <p className="text-sm text-neutral-400 mt-2">El enlace puede haber expirado o el pedido no existe.</p>
        </div>
      </div>
    );
  }

  if (loading || !pedido) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center -ml-0 lg:-ml-[260px]">
        <div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const currentStep = stepIndex(pedido.estado);
  const isCancelled = pedido.estado === 'cancelado';
  const negocio = config?.nombreNegocio || 'Studio 24';

  return (
    <div className="min-h-screen bg-[#fafafa] -ml-0 lg:-ml-[260px]">
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#c72a09] text-white flex items-center justify-center text-xl font-black mx-auto mb-3">
            S24
          </div>
          <h1 className="text-sm font-bold tracking-[0.1em] text-neutral-400 uppercase">{negocio}</h1>
          <p className="text-[10px] text-neutral-300 mt-1">Seguimiento de pedido</p>
        </div>

        {/* Order Card */}
        <div className="bg-white rounded-2xl border border-neutral-100 p-6 mb-6">
          <h2 className="text-lg font-black text-[#0a0a0a]">{pedido.descripcion}</h2>
          <p className="text-xs text-neutral-400 mt-1">
            {conceptoLabel(pedido.concepto)} &middot; {pedido.piezas} pieza{pedido.piezas !== 1 ? 's' : ''}
          </p>
          {cliente && <p className="text-xs text-neutral-400 mt-0.5">Cliente: {cliente.nombre}</p>}
          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-neutral-50">
            <div>
              <p className="text-[10px] font-bold tracking-[0.08em] text-neutral-400 uppercase">Fecha pedido</p>
              <p className="text-sm font-bold text-[#0a0a0a] mt-0.5">{formatDate(pedido.fechaPedido)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.08em] text-neutral-400 uppercase">Entrega estimada</p>
              <p className="text-sm font-bold text-[#0a0a0a] mt-0.5">
                {pedido.fechaEntrega ? formatDate(pedido.fechaEntrega) : 'Por definir'}
              </p>
            </div>
          </div>
          {pedido.urgente && (
            <div className="mt-3 bg-[#c72a09]/10 rounded-xl px-3 py-2">
              <p className="text-xs font-bold text-[#c72a09]">Pedido urgente</p>
            </div>
          )}
        </div>

        {/* Status Timeline */}
        {isCancelled ? (
          <div className="bg-white rounded-2xl border border-red-200 p-6 mb-6 text-center">
            <p className="text-3xl mb-2">❌</p>
            <p className="text-sm font-bold text-red-500">Pedido Cancelado</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-neutral-100 p-6 mb-6">
            <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">
              Estado del Pedido
            </h3>
            <div className="space-y-0">
              {STEPS.map((step, idx) => {
                const isDone = idx <= currentStep;
                const isCurrent = idx === currentStep;
                const isLast = idx === STEPS.length - 1;
                return (
                  <div key={step.estado} className="flex gap-4">
                    {/* Line + dot */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${
                          isCurrent
                            ? 'bg-[#c72a09] text-white shadow-lg shadow-[#c72a09]/30'
                            : isDone
                              ? 'bg-[#0a0a0a] text-white'
                              : 'bg-neutral-100 text-neutral-300'
                        }`}
                      >
                        {step.icon}
                      </div>
                      {!isLast && (
                        <div
                          className={`w-0.5 h-8 ${isDone && idx < currentStep ? 'bg-[#0a0a0a]' : 'bg-neutral-100'}`}
                        />
                      )}
                    </div>
                    {/* Label */}
                    <div className="pb-4">
                      <p
                        className={`text-sm font-bold ${isCurrent ? 'text-[#c72a09]' : isDone ? 'text-[#0a0a0a]' : 'text-neutral-300'}`}
                      >
                        {step.label}
                      </p>
                      {isCurrent && <p className="text-xs text-neutral-400 mt-0.5">Estado actual</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Payment Status */}
        <div className="bg-white rounded-2xl border border-neutral-100 p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-[10px] font-bold tracking-[0.08em] text-neutral-400 uppercase">Total</p>
              <p className="text-2xl font-black text-[#0a0a0a] mt-0.5">{formatCurrency(pedido.montoTotal)}</p>
            </div>
            <div
              className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase ${
                pedido.estadoPago === 'pagado'
                  ? 'bg-green-100 text-green-700'
                  : pedido.estadoPago === 'parcial'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-600'
              }`}
            >
              {pedido.estadoPago === 'pagado'
                ? 'Pagado'
                : pedido.estadoPago === 'parcial'
                  ? `Parcial (${formatCurrency(pedido.montoPagado)})`
                  : 'Pendiente'}
            </div>
          </div>
        </div>

        {/* Contact */}
        {config && (config.telefono || config.email) && (
          <div className="bg-[#0a0a0a] rounded-2xl p-6 text-center">
            <p className="text-[10px] font-bold tracking-[0.12em] text-white/50 uppercase mb-2">Contacto</p>
            <p className="text-sm font-bold text-white">{negocio}</p>
            {config.telefono && (
              <a
                href={`tel:${config.telefono}`}
                className="text-xs text-[#c72a09] font-bold mt-1 block hover:underline"
              >
                {config.telefono}
              </a>
            )}
            {config.email && (
              <a href={`mailto:${config.email}`} className="text-xs text-neutral-400 mt-0.5 block hover:underline">
                {config.email}
              </a>
            )}
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-[10px] text-neutral-300 mt-6">Powered by Studio 24</p>
      </div>
    </div>
  );
}
