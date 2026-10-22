'use client';

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Wallet } from 'lucide-react';
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
import { useRole } from '@/components/RoleProvider';
import { inputClass, labelClass, btnPrimary, btnSecondary } from '@/lib/styles';
import {
  buildCustomerStats,
  customerSortOptions,
  emptyCustomerStats,
  selectCustomers,
  type CustomerSort,
  type CustomerOrderFilter,
} from '@/lib/customer-list';

function emptyCliente(): Omit<Cliente, 'id' | 'createdAt'> {
  return { nombre: '', telefono: '', email: '', direccion: '', logo: '', notas: '' };
}

export default function ClientesPage() {
  const { role } = useRole();
  const { data: clientesRaw, reload: reloadClientes } = useCloudStore(
    getClientes,
    cloudGetClientes,
    'bordados_clientes',
  );
  const { data: ingresos, reload: reloadIngresos } = useCloudStore(getIngresos, cloudGetIngresos, 'bordados_ingresos');
  const { data: pedidos, reload: reloadPedidos } = useCloudStore(getPedidos, cloudGetPedidos, 'bordados_pedidos');
  const clientes = clientesRaw;
  const customerStats = useMemo(() => buildCustomerStats(ingresos, pedidos), [ingresos, pedidos]);
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
  const [sort, setSort] = useState<CustomerSort>('name-asc');
  const [orderFilter, setOrderFilter] = useState<CustomerOrderFilter>('with-orders');
  const [onlyDebtors, setOnlyDebtors] = useState(false);

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
    if (editingId) updateCliente(data);
    else addCliente(data);
    setModalOpen(false);
    reload();
  };
  const handleDelete = (id: string) => {
    if (role !== 'admin') return;
    if (confirm('Eliminar cliente?')) {
      deleteCliente(id);
      reload();
    }
  };

  const clienteIngresos = (id: string) => ingresos.filter((i) => i.clienteId === id);
  const clientePedidos = (id: string) => pedidos.filter((p) => p.clienteId === id);
  const clienteTotal = (id: string) => (customerStats.get(id)?.incomeCents || 0) / 100;

  const filtered = selectCustomers(clientes, customerStats, { search, sort, orders: orderFilter, onlyDebtors });
  const showAll = () => {
    setSearch('');
    setOrderFilter('all');
    setOnlyDebtors(false);
  };

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

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="relative w-full lg:max-w-md">
          <Search
            size={16}
            aria-hidden="true"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-300"
          />
          <input
            aria-label="Buscar clientes"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, telefono o email..."
            className="w-full border border-neutral-200 rounded-xl pl-10 pr-4 py-2.5 text-sm bg-white focus:outline-none focus:border-[#c72a09]"
          />
        </div>
        <div className="w-full min-w-0 sm:w-60">
          <label htmlFor="customer-sort" className={labelClass}>
            Ordenar por
          </label>
          <select
            id="customer-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as CustomerSort)}
            className={`${inputClass} bg-white text-sm`}
          >
            {customerSortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full min-w-0 sm:w-52">
          <label htmlFor="customer-orders" className={labelClass}>
            Pedidos
          </label>
          <select
            id="customer-orders"
            value={orderFilter}
            onChange={(event) => setOrderFilter(event.target.value as CustomerOrderFilter)}
            className={`${inputClass} bg-white text-sm`}
          >
            <option value="with-orders">Con pedidos</option>
            <option value="active">Solo pedidos activos</option>
            <option value="all">Todos los clientes</option>
          </select>
        </div>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={onlyDebtors}
            onChange={(event) => setOnlyDebtors(event.target.checked)}
            className="h-4 w-4 accent-[#c72a09]"
          />
          Solo con saldo pendiente
        </label>
      </div>
      <p className="mb-4 text-xs text-neutral-500" role="status">
        {filtered.length} de {clientes.length} clientes
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          title={clientes.length ? 'Sin coincidencias' : 'Sin clientes'}
          description={clientes.length ? 'No hay clientes con estos filtros.' : 'Agrega tu primer cliente al catálogo'}
          action={
            <button
              onClick={clientes.length ? showAll : openNew}
              className="text-[#c72a09] font-bold text-xs uppercase tracking-wide hover:underline"
            >
              {clientes.length ? 'Mostrar todos los clientes' : '+ Agregar cliente'}
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-3">
          {filtered.map((c) => {
            const total = clienteTotal(c.id);
            const stats = customerStats.get(c.id) || emptyCustomerStats;
            const count = stats.incomeCount;
            const accountHref = `/clientes/cuenta?cliente=${encodeURIComponent(c.id)}`;
            return (
              <article
                key={c.id}
                aria-label={c.nombre}
                className="flex min-w-0 flex-col bg-white rounded-lg border border-neutral-200 p-3.5 hover:border-neutral-300 transition-colors"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <button
                    type="button"
                    onClick={() => openDetail(c)}
                    aria-label={`Ver detalle de ${c.nombre}`}
                    className="flex min-w-0 flex-1 items-start gap-2.5 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c72a09]"
                  >
                    {c.logo ? (
                      <img src={c.logo} alt="" className="w-8 h-8 shrink-0 rounded-md object-cover" />
                    ) : (
                      <span className="w-8 h-8 shrink-0 rounded-md bg-[#0a0a0a] text-white flex items-center justify-center text-xs font-bold">
                        {c.nombre.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-bold leading-5 text-[#0a0a0a]">{c.nombre}</span>
                      <span className="mt-0.5 block break-all text-xs leading-4 text-neutral-500">
                        {c.telefono || c.email || 'Sin contacto'}
                      </span>
                    </span>
                  </button>
                  <ActionMenu
                    items={[
                      { label: 'Ver detalle', onClick: () => openDetail(c) },
                      { label: 'Editar', onClick: () => openEdit(c) },
                      ...(role === 'admin'
                        ? [{ label: 'Eliminar', onClick: () => handleDelete(c.id), danger: true }]
                        : []),
                    ]}
                  />
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 mt-auto pt-1.5">
                  <div>
                    <p className="text-[11px] text-neutral-500">
                      {count} {count === 1 ? 'ingreso' : 'ingresos'} &middot; {stats.activeOrderCount} pedidos activos
                    </p>
                    {stats.pendingCents > 0 && (
                      <p className="mt-0.5 text-[11px] font-semibold text-red-600">
                        Pendiente {formatCurrency(stats.pendingCents / 100)}
                      </p>
                    )}
                  </div>
                  <Link
                    href={accountHref}
                    aria-label={`Ver ingresos de ${c.nombre}: ${formatCurrency(total)}`}
                    className="rounded-sm text-right hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c72a09]"
                  >
                    <span className="block text-[10px] leading-4 text-neutral-500">Total ingresado</span>
                    <span className="block text-sm font-bold text-green-600 tabular-nums">{formatCurrency(total)}</span>
                  </Link>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 pt-1 border-t border-neutral-100">
                  <Link
                    href={accountHref}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-sm text-xs font-semibold text-neutral-700 hover:text-[#c72a09] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c72a09]"
                  >
                    <Wallet size={15} aria-hidden="true" />
                    Cuenta y movimientos
                  </Link>
                  {(role === 'admin' || role === 'contador') && (
                    <Link
                      href={`${accountHref}&accion=adelanto`}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-sm text-xs font-semibold text-[#c72a09] hover:text-[#a82207] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c72a09]"
                    >
                      <Plus size={15} aria-hidden="true" />
                      Registrar adelanto
                    </Link>
                  )}
                </div>
              </article>
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

            <Link
              href={`/clientes/cuenta?cliente=${encodeURIComponent(selectedCliente.id)}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              <Wallet size={17} />
              Cuenta y movimientos
            </Link>

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
              <span className={labelClass}>Ingresos ({clienteIngresos(selectedCliente.id).length} registros)</span>
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
                <span className="text-sm font-bold text-[#0a0a0a]">Total ingresado</span>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
