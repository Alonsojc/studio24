'use client';

import { useState } from 'react';
import { v4 as uuid } from 'uuid';
import { getClientes, getIngresos, getPedidos } from '@/lib/store';
import { cloudGetClientes, cloudGetIngresos, cloudGetPedidos } from '@/lib/store-cloud';
import { addCliente, updateCliente, deleteCliente } from '@/lib/store-sync';
import { useCloudStore } from '@/lib/useCloudStore';
import { Cliente } from '@/lib/types';
import { formatCurrency, formatDate, validateCliente, estadoPedidoLabel, estadoPedidoColor } from '@/lib/helpers';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import EmptyState from '@/components/EmptyState';
import ActionMenu from '@/components/ActionMenu';
import { inputClass, labelClass, btnPrimary, btnSecondary } from '@/lib/styles';

function emptyCliente(): Omit<Cliente, 'id' | 'createdAt'> {
  return { nombre: '', telefono: '', email: '', direccion: '', logo: '', notas: '' };
}

export default function ClientesPage() {
  const { data: clientesRaw, reload: reloadClientes } = useCloudStore(
    getClientes,
    cloudGetClientes,
    'bordados_clientes',
  );
  const { data: ingresos, reload: reloadIngresos } = useCloudStore(getIngresos, cloudGetIngresos, 'bordados_ingresos');
  const { data: pedidos, reload: reloadPedidos } = useCloudStore(getPedidos, cloudGetPedidos, 'bordados_pedidos');
  const clientes = [...clientesRaw].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const reload = () => {
    reloadClientes();
    reloadIngresos();
    reloadPedidos();
  };
  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyCliente());
  const [formSnapshot, setFormSnapshot] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const openNew = () => {
    setEditingId(null);
    const initial = emptyCliente();
    setForm(initial);
    setFormSnapshot(JSON.stringify(initial));
    setFormError(null);
    setModalOpen(true);
  };
  const openEdit = (c: Cliente) => {
    setEditingId(c.id);
    setForm({ ...c });
    setFormSnapshot(JSON.stringify(c));
    setFormError(null);
    setModalOpen(true);
  };
  const openDetail = (c: Cliente) => {
    setSelectedCliente(c);
    setDetailOpen(true);
  };
  const handleSave = () => {
    const error = validateCliente(form);
    if (error) {
      setFormError(error);
      return;
    }
    setFormError(null);
    const data: Cliente = {
      ...(form as Cliente),
      id: editingId || uuid(),
      createdAt: editingId ? (form as Cliente).createdAt : new Date().toISOString(),
    };
    editingId ? updateCliente(data) : addCliente(data);
    setModalOpen(false);
    reload();
  };
  const handleDelete = (id: string) => {
    if (confirm('Eliminar cliente?')) {
      deleteCliente(id);
      reload();
    }
  };

  const clienteIngresos = (id: string) => ingresos.filter((i) => i.clienteId === id);
  const clientePedidos = (id: string) => pedidos.filter((p) => p.clienteId === id);
  const clienteTotal = (id: string) => clienteIngresos(id).reduce((s, i) => s + i.montoTotal, 0);

  const filtered = clientes.filter(
    (c) =>
      c.nombre.toLowerCase().includes(search.toLowerCase()) ||
      c.telefono.includes(search) ||
      c.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <PageHeader
        title="Clientes"
        description={`${clientes.length} clientes registrados`}
        action={
          <button onClick={openNew} className={btnPrimary}>
            + Nuevo Cliente
          </button>
        }
      />

      <div className="mb-8">
        <div className="relative max-w-md">
          <svg
            className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-300"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, telefono o email..."
            className="w-full border border-neutral-200 rounded-xl pl-10 pr-4 py-2.5 text-sm bg-white focus:outline-none focus:border-[#c72a09]"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Sin clientes"
          description="Agrega tu primer cliente al catálogo"
          action={
            <button
              onClick={openNew}
              className="text-[#c72a09] font-bold text-xs uppercase tracking-wide hover:underline"
            >
              + Agregar cliente
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => {
            const total = clienteTotal(c.id);
            const count = clienteIngresos(c.id).length;
            return (
              <div
                key={c.id}
                onClick={() => openDetail(c)}
                className="bg-white rounded-2xl border border-neutral-100 p-6 hover:border-neutral-300 transition-all cursor-pointer group relative"
              >
                <div className="absolute top-4 right-4">
                  <ActionMenu
                    items={[
                      { label: 'Ver detalle', onClick: () => openDetail(c) },
                      { label: 'Editar', onClick: () => openEdit(c) },
                      { label: 'Eliminar', onClick: () => handleDelete(c.id), danger: true },
                    ]}
                  />
                </div>
                {c.logo ? (
                  <img src={c.logo} alt={c.nombre} className="w-10 h-10 rounded-xl object-cover mb-3" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-[#0a0a0a] text-white flex items-center justify-center text-sm font-black mb-3">
                    {c.nombre.charAt(0).toUpperCase()}
                  </div>
                )}
                <h3 className="font-bold text-[#0a0a0a] group-hover:text-[#c72a09] transition-colors">{c.nombre}</h3>
                {c.telefono && <p className="text-xs text-neutral-400 mt-1">{c.telefono}</p>}
                {c.email && <p className="text-xs text-neutral-400">{c.email}</p>}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-50">
                  <p className="text-[10px] text-neutral-300 uppercase tracking-wide font-bold">
                    {count} ventas &middot;{' '}
                    {clientePedidos(c.id).filter((p) => p.estado !== 'entregado' && p.estado !== 'cancelado').length}{' '}
                    pedidos activos
                  </p>
                  <p className="text-sm font-black text-green-600">{formatCurrency(total)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={selectedCliente ? selectedCliente.nombre : 'Cliente'}
      >
        {selectedCliente && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              {selectedCliente.logo ? (
                <img
                  src={selectedCliente.logo}
                  alt={selectedCliente.nombre}
                  className="w-14 h-14 rounded-2xl object-cover shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-[#0a0a0a] text-white flex items-center justify-center text-xl font-black shrink-0">
                  {selectedCliente.nombre.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h3 className="font-bold text-lg text-[#0a0a0a]">{selectedCliente.nombre}</h3>
                <p className="text-xs text-neutral-400">
                  {[selectedCliente.telefono, selectedCliente.email].filter(Boolean).join(' · ') || 'Sin contacto'}
                </p>
              </div>
            </div>
            {selectedCliente.direccion && (
              <div>
                <span className={labelClass}>Dirección</span>
                <p className="text-sm text-neutral-600">{selectedCliente.direccion}</p>
              </div>
            )}
            {selectedCliente.notas && (
              <div>
                <span className={labelClass}>Notas</span>
                <p className="text-sm text-neutral-500">{selectedCliente.notas}</p>
              </div>
            )}

            {/* Pedidos del cliente */}
            {(() => {
              const peds = clientePedidos(selectedCliente.id).sort((a, b) =>
                b.fechaPedido.localeCompare(a.fechaPedido),
              );
              const activos = peds.filter((p) => p.estado !== 'entregado' && p.estado !== 'cancelado');
              return (
                <div>
                  <span className={labelClass}>
                    Pedidos ({peds.length} total &middot; {activos.length} activos)
                  </span>
                  <div className="space-y-1 max-h-48 overflow-y-auto mt-2">
                    {peds.length === 0 ? (
                      <p className="text-sm text-neutral-300 py-3 text-center">Sin pedidos</p>
                    ) : (
                      peds.map((p) => (
                        <div key={p.id} className="flex justify-between items-center py-2.5 border-b border-neutral-50">
                          <div>
                            <p className="text-sm font-semibold text-[#0a0a0a]">{p.descripcion}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span
                                className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase ${estadoPedidoColor(p.estado)}`}
                              >
                                {estadoPedidoLabel(p.estado)}
                              </span>
                              <span className="text-xs text-neutral-400">{formatDate(p.fechaPedido)}</span>
                              {p.urgente && (
                                <span className="text-[9px] font-bold text-red-500 uppercase">Urgente</span>
                              )}
                            </div>
                          </div>
                          <span className="text-sm font-bold text-[#0a0a0a]">{formatCurrency(p.montoTotal)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Ingresos del cliente */}
            <div>
              <span className={labelClass}>Ingresos ({clienteIngresos(selectedCliente.id).length} ventas)</span>
              <div className="space-y-1 max-h-48 overflow-y-auto mt-2">
                {clienteIngresos(selectedCliente.id).length === 0 ? (
                  <p className="text-sm text-neutral-300 py-3 text-center">Sin ingresos</p>
                ) : (
                  clienteIngresos(selectedCliente.id)
                    .sort((a, b) => b.fecha.localeCompare(a.fecha))
                    .map((i) => (
                      <div key={i.id} className="flex justify-between items-center py-2.5 border-b border-neutral-50">
                        <div>
                          <p className="text-sm font-semibold text-[#0a0a0a]">{i.descripcion}</p>
                          <p className="text-xs text-neutral-400">
                            {formatDate(i.fecha)}
                            {i.factura && <span className="text-[#c72a09] font-semibold"> &middot; F</span>}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-green-600">{formatCurrency(i.montoTotal)}</span>
                      </div>
                    ))
                )}
              </div>
              <div className="border-t border-neutral-100 mt-3 pt-3 flex justify-between">
                <span className="text-sm font-bold text-[#0a0a0a]">Total facturado</span>
                <span className="text-lg font-black text-[#c72a09]">
                  {formatCurrency(clienteTotal(selectedCliente.id))}
                </span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Form Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Editar Cliente' : 'Nuevo Cliente'}
        dirty={JSON.stringify(form) !== formSnapshot}
      >
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Nombre *</label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Nombre completo o empresa"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Teléfono</label>
              <input
                type="tel"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Dirección</label>
            <input
              type="text"
              value={form.direccion}
              onChange={(e) => setForm({ ...form, direccion: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Logo / Imagen (URL)</label>
            <input
              type="url"
              value={form.logo}
              onChange={(e) => setForm({ ...form, logo: e.target.value })}
              placeholder="https://ejemplo.com/logo.png"
              className={inputClass}
            />
            {form.logo && <img src={form.logo} alt="Preview" className="w-10 h-10 rounded-lg object-cover mt-2" />}
          </div>
          <div>
            <label className={labelClass}>Notas</label>
            <textarea
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              rows={2}
              placeholder="Preferencias, datos adicionales..."
              className={inputClass}
            />
          </div>
          {formError && (
            <p className="text-xs text-red-500 font-semibold bg-red-50 rounded-xl px-3.5 py-2.5">{formError}</p>
          )}
          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
            <button onClick={() => setModalOpen(false)} className={btnSecondary}>
              Cancelar
            </button>
            <button onClick={handleSave} className={btnPrimary}>
              {editingId ? 'Guardar' : 'Agregar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
