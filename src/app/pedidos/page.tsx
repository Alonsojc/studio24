'use client';

import { useEffect, useState, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { getPedidos, addPedido, updatePedido, deletePedido, getClientes } from '@/lib/store';
import { Pedido, Cliente, EstadoPedido, ConceptoIngreso } from '@/lib/types';
import { formatCurrency, formatDate, conceptoLabel, estadoPedidoLabel, estadoPedidoColor, todayString } from '@/lib/helpers';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import ActionMenu from '@/components/ActionMenu';

const inputClass = "w-full border border-neutral-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#c72a09] focus:ring-1 focus:ring-[#c72a09]/20 transition-colors";
const labelClass = "block text-[10px] font-bold tracking-[0.08em] text-neutral-400 uppercase mb-1.5";
const btnPrimary = "bg-[#c72a09] text-white px-5 py-2.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase hover:bg-[#a82207] transition-colors";
const btnSecondary = "px-4 py-2.5 text-xs font-semibold text-neutral-400 hover:text-neutral-600 transition-colors";

const conceptos: ConceptoIngreso[] = ['solo_bordado', 'bordado_y_prenda', 'diseno', 'reparacion', 'otro'];

const pipeline: { estado: EstadoPedido; label: string; emoji: string }[] = [
  { estado: 'pendiente', label: 'Pendiente', emoji: '📋' },
  { estado: 'diseno', label: 'En Diseno', emoji: '🎨' },
  { estado: 'aprobado', label: 'Aprobado', emoji: '✅' },
  { estado: 'en_maquina', label: 'En Maquina', emoji: '🧵' },
  { estado: 'terminado', label: 'Terminado', emoji: '📦' },
  { estado: 'entregado', label: 'Entregado', emoji: '🤝' },
];

function emptyPedido(): Omit<Pedido, 'id' | 'createdAt'> {
  return {
    clienteId: '', descripcion: '', concepto: 'solo_bordado', piezas: 1,
    precioUnitario: 0, montoTotal: 0, estado: 'pendiente', maquina: '',
    fechaPedido: todayString(), fechaEntrega: '', fechaEntregaReal: '',
    urgente: false, notas: '',
  };
}

export default function PedidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyPedido());
  const [view, setView] = useState<'pipeline' | 'lista'>('pipeline');
  const [mounted, setMounted] = useState(false);

  const reload = useCallback(() => {
    setPedidos(getPedidos().sort((a, b) => {
      if (a.urgente && !b.urgente) return -1;
      if (!a.urgente && b.urgente) return 1;
      return b.fechaPedido.localeCompare(a.fechaPedido);
    }));
    setClientes(getClientes());
  }, []);

  useEffect(() => { reload(); setMounted(true); }, [reload]);

  if (!mounted) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" /></div>;

  const openNew = () => { setEditingId(null); setForm(emptyPedido()); setModalOpen(true); };
  const openEdit = (p: Pedido) => { setEditingId(p.id); setForm({ ...p }); setModalOpen(true); };

  const handleSave = () => {
    if (!form.descripcion) return;
    const montoTotal = form.piezas * form.precioUnitario;
    const data: Pedido = { ...(form as Pedido), id: editingId || uuid(), montoTotal, createdAt: editingId ? (form as Pedido).createdAt : new Date().toISOString() };
    editingId ? updatePedido(data) : addPedido(data);
    setModalOpen(false); reload();
  };

  const handleDelete = (id: string) => { if (confirm('Eliminar pedido?')) { deletePedido(id); reload(); } };

  const moveEstado = (p: Pedido, estado: EstadoPedido) => {
    const updated = { ...p, estado };
    if (estado === 'entregado') updated.fechaEntregaReal = todayString();
    updatePedido(updated); reload();
  };

  const nextEstado = (current: EstadoPedido): EstadoPedido | null => {
    const idx = pipeline.findIndex((s) => s.estado === current);
    return idx >= 0 && idx < pipeline.length - 1 ? pipeline[idx + 1].estado : null;
  };

  const clienteName = (id: string) => clientes.find((c) => c.id === id)?.nombre || 'Sin cliente';

  const activos = pedidos.filter((p) => p.estado !== 'entregado' && p.estado !== 'cancelado');
  const totalActivos = activos.reduce((s, p) => s + p.montoTotal, 0);

  return (
    <div>
      <PageHeader
        title="Pedidos"
        description={`${activos.length} pedidos activos &middot; ${formatCurrency(totalActivos)} en produccion`}
        action={
          <div className="flex gap-2">
            <div className="flex bg-neutral-100 rounded-xl p-0.5">
              <button onClick={() => setView('pipeline')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-colors ${view === 'pipeline' ? 'bg-white text-[#0a0a0a] shadow-sm' : 'text-neutral-400'}`}>Pipeline</button>
              <button onClick={() => setView('lista')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-colors ${view === 'lista' ? 'bg-white text-[#0a0a0a] shadow-sm' : 'text-neutral-400'}`}>Lista</button>
            </div>
            <button onClick={openNew} className={btnPrimary}>+ Nuevo Pedido</button>
          </div>
        }
      />

      {/* Pipeline View */}
      {view === 'pipeline' && (
        <div className="grid grid-cols-6 gap-3 min-h-[60vh]">
          {pipeline.map((col) => {
            const items = pedidos.filter((p) => p.estado === col.estado);
            return (
              <div key={col.estado} className="bg-neutral-50 rounded-2xl p-3">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className="text-sm">{col.emoji}</span>
                  <span className="text-[10px] font-bold tracking-[0.08em] text-neutral-400 uppercase">{col.label}</span>
                  <span className="ml-auto text-[10px] font-bold text-neutral-300 bg-white rounded-full w-5 h-5 flex items-center justify-center">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((p) => (
                    <div key={p.id} className={`bg-white rounded-xl p-3 border transition-all hover:shadow-md ${p.urgente ? 'border-[#c72a09]/30' : 'border-neutral-100'}`}>
                      {p.urgente && <span className="text-[9px] font-bold text-[#c72a09] uppercase tracking-wide">Urgente</span>}
                      <p className="text-xs font-semibold text-[#0a0a0a] mt-0.5 leading-tight">{p.descripcion}</p>
                      <p className="text-[10px] text-neutral-400 mt-1">{clienteName(p.clienteId)}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] text-neutral-300">{p.piezas} pzas</span>
                        <span className="text-xs font-bold text-[#0a0a0a]">{formatCurrency(p.montoTotal)}</span>
                      </div>
                      {p.fechaEntrega && (
                        <p className={`text-[10px] mt-1 font-semibold ${new Date(p.fechaEntrega) < new Date() && p.estado !== 'entregado' ? 'text-red-500' : 'text-neutral-300'}`}>
                          Entrega: {formatDate(p.fechaEntrega)}
                        </p>
                      )}
                      {p.maquina && <p className="text-[10px] text-neutral-300 mt-0.5">Maquina: {p.maquina}</p>}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-neutral-50">
                        {nextEstado(p.estado) ? (
                          <button onClick={() => moveEstado(p, nextEstado(p.estado)!)} className="text-[10px] font-bold text-[#c72a09] hover:underline uppercase tracking-wide">
                            Mover a {estadoPedidoLabel(nextEstado(p.estado)!)}
                          </button>
                        ) : <span />}
                        <ActionMenu items={[
                          { label: 'Editar', onClick: () => openEdit(p) },
                          ...(p.estado !== 'cancelado' ? [{ label: 'Cancelar', onClick: () => moveEstado(p, 'cancelado'), danger: true }] : []),
                          { label: 'Eliminar', onClick: () => handleDelete(p.id), danger: true },
                        ]} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {view === 'lista' && (
        pedidos.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-sm text-neutral-300">Sin pedidos registrados</p>
            <button onClick={openNew} className="text-[#c72a09] font-bold text-xs uppercase tracking-wide hover:underline mt-3">+ Crear pedido</button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100">
                  <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Pedido</th>
                  <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Cliente</th>
                  <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Estado</th>
                  <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Piezas</th>
                  <th className="px-5 py-4 text-right text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Monto</th>
                  <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Entrega</th>
                  <th className="px-5 py-4"></th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id} className="border-b border-neutral-50 hover:bg-neutral-50/50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        {p.urgente && <span className="w-2 h-2 rounded-full bg-[#c72a09] shrink-0" />}
                        <div>
                          <span className="font-semibold text-[#0a0a0a]">{p.descripcion}</span>
                          <span className="block text-[10px] text-neutral-300 mt-0.5">{conceptoLabel(p.concepto)}{p.maquina ? ` &middot; ${p.maquina}` : ''}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-neutral-400">{clienteName(p.clienteId)}</td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide ${estadoPedidoColor(p.estado)}`}>
                        {estadoPedidoLabel(p.estado)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-neutral-500">{p.piezas}</td>
                    <td className="px-5 py-4 text-right font-bold text-[#0a0a0a]">{formatCurrency(p.montoTotal)}</td>
                    <td className="px-5 py-4 text-xs text-neutral-400">{p.fechaEntrega ? formatDate(p.fechaEntrega) : '—'}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end">
                        <ActionMenu items={[
                          { label: 'Editar', onClick: () => openEdit(p) },
                          ...(nextEstado(p.estado) ? [{ label: `Mover a ${estadoPedidoLabel(nextEstado(p.estado)!)}`, onClick: () => moveEstado(p, nextEstado(p.estado)!) }] : []),
                          { label: 'Eliminar', onClick: () => handleDelete(p.id), danger: true },
                        ]} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Editar Pedido' : 'Nuevo Pedido'}>
        <div className="space-y-4">
          <div><label className={labelClass}>Descripcion *</label><input type="text" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Ej: 20 playeras con logo bordado" className={inputClass} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Cliente</label><select value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })} className={inputClass}><option value="">Sin cliente</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
            <div><label className={labelClass}>Concepto</label><select value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value as ConceptoIngreso })} className={inputClass}>{conceptos.map((c) => <option key={c} value={c}>{conceptoLabel(c)}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className={labelClass}>Piezas</label><input type="number" min="1" value={form.piezas} onChange={(e) => setForm({ ...form, piezas: Math.max(1, parseInt(e.target.value) || 1) })} className={inputClass} /></div>
            <div><label className={labelClass}>Precio unitario</label><input type="number" step="0.01" min="0" value={form.precioUnitario || ''} onChange={(e) => setForm({ ...form, precioUnitario: parseFloat(e.target.value) || 0 })} className={inputClass} /></div>
            <div>
              <label className={labelClass}>Total</label>
              <div className="h-[42px] flex items-center text-lg font-black text-[#c72a09]">{formatCurrency(form.piezas * form.precioUnitario)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Fecha de pedido</label><input type="date" value={form.fechaPedido} onChange={(e) => setForm({ ...form, fechaPedido: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Fecha de entrega</label><input type="date" value={form.fechaEntrega} onChange={(e) => setForm({ ...form, fechaEntrega: e.target.value })} className={inputClass} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Estado</label><select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as EstadoPedido })} className={inputClass}>{pipeline.map((s) => <option key={s.estado} value={s.estado}>{s.label}</option>)}<option value="cancelado">Cancelado</option></select></div>
            <div><label className={labelClass}>Maquina</label><select value={form.maquina} onChange={(e) => setForm({ ...form, maquina: e.target.value })} className={inputClass}><option value="">Sin asignar</option><option value="Maquina 1">Maquina 1</option><option value="Maquina 2">Maquina 2</option></select></div>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={form.urgente} onChange={(e) => setForm({ ...form, urgente: e.target.checked })} className="w-4 h-4 accent-[#c72a09] rounded" />
            <span className="text-sm font-semibold text-[#0a0a0a]">Urgente</span>
          </label>
          <div><label className={labelClass}>Notas</label><textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={2} placeholder="Detalles del pedido, colores, posiciones..." className={inputClass} /></div>
          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
            <button onClick={() => setModalOpen(false)} className={btnSecondary}>Cancelar</button>
            <button onClick={handleSave} className={btnPrimary}>{editingId ? 'Guardar' : 'Crear Pedido'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
