'use client';

import { useEffect, useState, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { getProveedores, addProveedor, updateProveedor, deleteProveedor, getEgresos } from '@/lib/store';
import { Proveedor, Egreso } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/helpers';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import EmptyState from '@/components/EmptyState';

const tiposProveedor = [
  'Insumos de bordado',
  'Telas y textiles',
  'Maquinaria',
  'Software/Digital',
  'Publicidad e impresion',
  'Servicios generales',
  'Otro',
];

function emptyProveedor(): Omit<Proveedor, 'id' | 'createdAt'> {
  return { nombre: '', contacto: '', telefono: '', email: '', tipo: '', notas: '' };
}

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyProveedor());
  const [search, setSearch] = useState('');
  const [mounted, setMounted] = useState(false);

  const reload = useCallback(() => {
    setProveedores(getProveedores().sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setEgresos(getEgresos());
  }, []);

  useEffect(() => {
    reload();
    setMounted(true);
  }, [reload]);

  if (!mounted) return <div className="p-8">Cargando...</div>;

  const openNew = () => {
    setEditingId(null);
    setForm(emptyProveedor());
    setModalOpen(true);
  };

  const openEdit = (p: Proveedor) => {
    setEditingId(p.id);
    setForm({ ...p });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!form.nombre) return;
    const data: Proveedor = {
      ...(form as Proveedor),
      id: editingId || uuid(),
      createdAt: editingId ? (form as Proveedor).createdAt : new Date().toISOString(),
    };
    if (editingId) {
      updateProveedor(data);
    } else {
      addProveedor(data);
    }
    setModalOpen(false);
    reload();
  };

  const handleDelete = (id: string) => {
    if (confirm('Estas seguro de eliminar este proveedor?')) {
      deleteProveedor(id);
      reload();
    }
  };

  const proveedorEgresos = (id: string) => egresos.filter((e) => e.proveedorId === id);
  const proveedorTotal = (id: string) => proveedorEgresos(id).reduce((s, e) => s + e.montoTotal, 0);

  const filtered = proveedores.filter((p) =>
    p.nombre.toLowerCase().includes(search.toLowerCase()) ||
    p.tipo.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader
        title="Proveedores"
        description={`${proveedores.length} proveedores registrados`}
        action={
          <button
            onClick={openNew}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
          >
            + Nuevo Proveedor
          </button>
        }
      />

      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o tipo..."
          className="w-full max-w-md border border-gray-200 rounded-lg px-4 py-2 text-sm bg-white"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="🏭"
          title="Sin proveedores"
          description="Registra tus proveedores para asociarlos a tus gastos"
          action={
            <button onClick={openNew} className="text-purple-600 font-medium text-sm hover:underline">
              + Agregar proveedor
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const total = proveedorTotal(p.id);
            const count = proveedorEgresos(p.id).length;
            return (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{p.nombre}</h3>
                    {p.tipo && (
                      <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-600">
                        {p.tipo}
                      </span>
                    )}
                    {p.contacto && <p className="text-sm text-gray-500 mt-1">{p.contacto}</p>}
                    {p.telefono && <p className="text-sm text-gray-500">{p.telefono}</p>}
                    {p.email && <p className="text-sm text-gray-500">{p.email}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-red-500">{formatCurrency(total)}</p>
                    <p className="text-xs text-gray-400">{count} compras</p>
                  </div>
                </div>
                {p.notas && (
                  <p className="text-xs text-gray-400 mt-2 truncate">{p.notas}</p>
                )}
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => openEdit(p)}
                    className="text-purple-600 hover:text-purple-800 text-xs"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Editar Proveedor' : 'Nuevo Proveedor'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nombre *</label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Nombre del proveedor"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Seleccionar...</option>
              {tiposProveedor.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Contacto</label>
              <input
                type="text"
                value={form.contacto}
                onChange={(e) => setForm({ ...form, contacto: e.target.value })}
                placeholder="Persona de contacto"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Telefono</label>
              <input
                type="tel"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
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
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notas</label>
            <textarea
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              rows={2}
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
              className="bg-purple-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-purple-700"
            >
              {editingId ? 'Guardar Cambios' : 'Agregar Proveedor'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
