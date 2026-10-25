'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Wallet, RefreshCw } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { addCliente, updateCliente, deleteCliente } from '@/lib/store-sync';
import { flushPendingSync } from '@/lib/sync-flush';
import { useCustomerDirectory } from '@/lib/useCustomerDirectory';
import CustomerDetailHistory from '@/components/customer-accounts/CustomerDetailHistory';
import Pagination from '@/components/Pagination';
import { Cliente } from '@/lib/types';
import { formatCurrency, validateCliente } from '@/lib/helpers';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import EmptyState from '@/components/EmptyState';
import ActionMenu from '@/components/ActionMenu';
import { useRole } from '@/components/RoleProvider';
import { inputClass, labelClass, btnPrimary, btnSecondary } from '@/lib/styles';
import {
  customerSortOptions,
  emptyCustomerStats,
  type CustomerSort,
  type CustomerOrderFilter,
} from '@/lib/customer-list';

function emptyCliente(): Omit<Cliente, 'id' | 'createdAt'> {
  return { nombre: '', telefono: '', email: '', direccion: '', logo: '', notas: '' };
}

export default function ClientesPage() {
  const { role } = useRole();
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
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const {
    data: directory,
    reload,
    loading,
    syncing,
    error,
    hasSnapshot,
  } = useCustomerDirectory({ page, search: query, sort, orders: orderFilter, onlyDebtors });
  const filtered = directory.rows.map((row) => row.cliente);
  const customerStats = new Map(directory.rows.map((row) => [row.cliente.id, row.stats]));

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
    // Refresh server aggregates after the queued edit. SyncStatus reports failures.
    void flushPendingSync().then(reload, reload);
  };
  const handleDelete = (id: string) => {
    if (role !== 'admin') return;
    if (confirm('Eliminar cliente?')) {
      deleteCliente(id);
      void flushPendingSync().then(reload, reload);
    }
  };

  const clienteTotal = (id: string) => (customerStats.get(id)?.incomeCents || 0) / 100;

  const showAll = () => {
    setPage(0);
    setSearch('');
    setOrderFilter('all');
    setOnlyDebtors(false);
  };

  return (
    <div>
      <PageHeader
        title="Clientes"
        description={`${directory.registered} clientes registrados`}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={reload}
              disabled={syncing}
              title="Actualizar clientes"
              aria-label="Actualizar clientes"
              className={btnSecondary}
            >
              <RefreshCw size={16} />
            </button>
            <button onClick={openNew} className={btnPrimary}>
              + Nuevo Cliente
            </button>
          </div>
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
            maxLength={200}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
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
            onChange={(event) => {
              setSort(event.target.value as CustomerSort);
              setPage(0);
            }}
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
            onChange={(event) => {
              setOrderFilter(event.target.value as CustomerOrderFilter);
              setPage(0);
            }}
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
            onChange={(event) => {
              setOnlyDebtors(event.target.checked);
              setPage(0);
            }}
            className="h-4 w-4 accent-[#c72a09]"
          />
          Solo con saldo pendiente
        </label>
      </div>
      <p className="mb-4 text-xs text-neutral-500" role="status">
        {directory.total} de {directory.registered} clientes
      </p>

      {loading && !hasSnapshot ? (
        <p role="status" className="py-8 text-sm text-neutral-500">
          Consultando clientes...
        </p>
      ) : error && !hasSnapshot ? (
        <p role="alert" className="py-8 text-sm text-red-600">
          No se pudo confirmar el directorio.{' '}
          <button className="underline" onClick={reload}>
            Reintentar
          </button>
        </p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={directory.registered ? 'Sin coincidencias' : 'Sin clientes'}
          description={
            directory.registered ? 'No hay clientes con estos filtros.' : 'Agrega tu primer cliente al catálogo'
          }
          action={
            <button
              onClick={directory.registered ? showAll : openNew}
              className="text-[#c72a09] font-bold text-xs uppercase tracking-wide hover:underline"
            >
              {directory.registered ? 'Mostrar todos los clientes' : '+ Agregar cliente'}
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
      <Pagination total={directory.total} page={page} onPageChange={setPage} />
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

            <CustomerDetailHistory key={selectedCliente.id} clienteId={selectedCliente.id} />
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
