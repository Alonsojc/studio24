'use client';

import { useEffect, useState, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { getClientes, addCliente, updateCliente, deleteCliente, getIngresos } from '@/lib/store';
import { Cliente, Ingreso } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/helpers';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import EmptyState from '@/components/EmptyState';

function emptyCliente(): Omit<Cliente, 'id' | 'createdAt'> {
  return { nombre: '', telefono: '', email: '', direccion: '', notas: '' };
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyCliente());
  const [search, setSearch] = useState('');
  const [mounted, setMounted] = useState(false);

  const reload = useCallback(() => {
    setClientes(getClientes().sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setIngresos(getIngresos());
  }, []);

  useEffect(() => {
    reload();
    setMounted(true);
  }, [reload]);

  if (!mounted) return <div className="p-8">Cargando...</div>;

  const openNew = () => {
    setEditingId(null);
    setForm(emptyCliente());
    setModalOpen(true);
  };

  const openEdit = (c: Cliente) => {
    setEditingId(c.id);
    setForm({ ...c });
    setModalOpen(true);
  };

  const openDetail = (c: Cliente) => {
    setSelectedCliente(c);
    setDetailOpen(true);
  };

  const handleSave = () => {
    if (!form.nombre) return;
    const data: Cliente = {
      ...(form as Cliente),
      id: editingId || uuid(),
      createdAt: editingId ? (form as Cliente).createdAt : new Date().toISOString(),
    };
    if (editingId) {
      updateCliente(data);
    } else {
      addCliente(data);
    }
    setModalOpen(false);
    reload();
  };

  const handleDelete = (id: string) => {
    if (confirm('Estas seguro de eliminar este cliente?')) {
      deleteCliente(id);
      reload();
    }
  };

  const clienteIngresos = (id: string) => ingresos.filter((i) => i.clienteId === id);
  const clienteTotal = (id: string) => clienteIngresos(id).reduce((s, i) => s + i.montoTotal, 0);

  const filtered = clientes.filter((c) =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    c.telefono.includes(search) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader
        title="Catalogo de Clientes"
        description={`${clientes.length} clientes registrados`}
        action={
          <button
            onClick={openNew}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + Nuevo Cliente
          </button>
        }
      />

      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, telefono o email..."
          className="w-full max-w-md border border-gray-200 rounded-lg px-4 py-2 text-sm bg-white"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="👥"
          title="Sin clientes"
          description="Agrega tu primer cliente al catalogo"
          action={
            <button onClick={openNew} className="text-blue-600 font-medium text-sm hover:underline">
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
                className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => openDetail(c)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{c.nombre}</h3>
                    {c.telefono && <p className="text-sm text-gray-500 mt-1">{c.telefono}</p>}
                    {c.email && <p className="text-sm text-gray-500">{c.email}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-emerald-600">{formatCurrency(total)}</p>
                    <p className="text-xs text-gray-400">{count} trabajos</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(c); }}
                    className="text-purple-600 hover:text-purple-800 text-xs"
                  >
                    Editar
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                    className="text-red-500 hover:text-red-700 text-xs"
                  >
                    Eliminar
                  </button>
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
        title={selectedCliente ? `Cliente: ${selectedCliente.nombre}` : 'Cliente'}
      >
        {selectedCliente && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {selectedCliente.telefono && (
                <div>
                  <span className="text-xs text-gray-500">Telefono</span>
                  <p className="font-medium">{selectedCliente.telefono}</p>
                </div>
              )}
              {selectedCliente.email && (
                <div>
                  <span className="text-xs text-gray-500">Email</span>
                  <p className="font-medium">{selectedCliente.email}</p>
                </div>
              )}
              {selectedCliente.direccion && (
                <div className="col-span-2">
                  <span className="text-xs text-gray-500">Direccion</span>
                  <p className="font-medium">{selectedCliente.direccion}</p>
                </div>
              )}
            </div>
            {selectedCliente.notas && (
              <div>
                <span className="text-xs text-gray-500">Notas</span>
                <p className="text-sm text-gray-700">{selectedCliente.notas}</p>
              </div>
            )}
            <div>
              <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Historial de Trabajos ({clienteIngresos(selectedCliente.id).length})
              </h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {clienteIngresos(selectedCliente.id).length === 0 ? (
                  <p className="text-sm text-gray-400">Sin trabajos registrados</p>
                ) : (
                  clienteIngresos(selectedCliente.id)
                    .sort((a, b) => b.fecha.localeCompare(a.fecha))
                    .map((i) => (
                      <div key={i.id} className="flex justify-between items-center py-2 border-b border-gray-50">
                        <div>
                          <p className="text-sm font-medium">{i.descripcion}</p>
                          <p className="text-xs text-gray-400">{formatDate(i.fecha)}</p>
                        </div>
                        <span className="text-sm font-semibold text-emerald-600">
                          {formatCurrency(i.montoTotal)}
                        </span>
                      </div>
                    ))
                )}
              </div>
              <div className="border-t mt-3 pt-3 flex justify-between">
                <span className="text-sm font-semibold">Total</span>
                <span className="font-bold text-emerald-600">
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
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nombre *</label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Nombre completo o empresa"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Telefono</label>
              <input
                type="tel"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Direccion</label>
            <input
              type="text"
              value={form.direccion}
              onChange={(e) => setForm({ ...form, direccion: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notas</label>
            <textarea
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              rows={2}
              placeholder="Preferencias, datos adicionales..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              {editingId ? 'Guardar Cambios' : 'Agregar Cliente'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
