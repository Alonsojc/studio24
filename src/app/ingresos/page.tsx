'use client';

import { useEffect, useState, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { getIngresos, addIngreso, updateIngreso, deleteIngreso, getClientes } from '@/lib/store';
import { Ingreso, Cliente, ConceptoIngreso, FormaPago } from '@/lib/types';
import { formatCurrency, formatDate, formaPagoLabel, conceptoLabel, todayString, calcIVA } from '@/lib/helpers';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import EmptyState from '@/components/EmptyState';

const conceptos: ConceptoIngreso[] = ['solo_bordado', 'bordado_y_prenda', 'diseno', 'reparacion', 'otro'];
const formasPago: FormaPago[] = ['efectivo', 'tarjeta', 'transferencia', 'otro'];

function emptyIngreso(): Omit<Ingreso, 'id' | 'createdAt'> {
  return {
    fecha: todayString(),
    clienteId: '',
    descripcion: '',
    concepto: 'solo_bordado',
    monto: 0,
    iva: 0,
    montoTotal: 0,
    formaPago: 'efectivo',
    factura: false,
    numeroFactura: '',
    notas: '',
  };
}

export default function IngresosPage() {
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyIngreso());
  const [filterConcepto, setFilterConcepto] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [mounted, setMounted] = useState(false);

  const reload = useCallback(() => {
    setIngresos(getIngresos().sort((a, b) => b.fecha.localeCompare(a.fecha)));
    setClientes(getClientes());
  }, []);

  useEffect(() => {
    reload();
    setMounted(true);
  }, [reload]);

  if (!mounted) return <div className="p-8">Cargando...</div>;

  const openNew = () => {
    setEditingId(null);
    setForm(emptyIngreso());
    setModalOpen(true);
  };

  const openEdit = (i: Ingreso) => {
    setEditingId(i.id);
    setForm({ ...i });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!form.descripcion || form.monto <= 0) return;
    const iva = form.factura ? calcIVA(form.monto) : 0;
    const data: Ingreso = {
      ...(form as Ingreso),
      id: editingId || uuid(),
      iva,
      montoTotal: form.monto + iva,
      createdAt: editingId ? (form as Ingreso).createdAt : new Date().toISOString(),
    };
    if (editingId) {
      updateIngreso(data);
    } else {
      addIngreso(data);
    }
    setModalOpen(false);
    reload();
  };

  const handleDelete = (id: string) => {
    if (confirm('Estas seguro de eliminar este ingreso?')) {
      deleteIngreso(id);
      reload();
    }
  };

  const clienteName = (id: string) => clientes.find((c) => c.id === id)?.nombre || '';

  const months = Array.from(
    new Set(ingresos.map((i) => i.fecha.substring(0, 7)))
  ).sort().reverse();

  const filtered = ingresos.filter((i) => {
    if (filterConcepto !== 'all' && i.concepto !== filterConcepto) return false;
    if (filterMonth !== 'all' && !i.fecha.startsWith(filterMonth)) return false;
    return true;
  });

  const totalFiltered = filtered.reduce((s, i) => s + i.montoTotal, 0);

  return (
    <div>
      <PageHeader
        title="Ingresos"
        description="Control de ventas y servicios"
        action={
          <button
            onClick={openNew}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            + Nuevo Ingreso
          </button>
        }
      />

      <div className="flex gap-3 mb-6 flex-wrap">
        <select
          value={filterConcepto}
          onChange={(e) => setFilterConcepto(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="all">Todos los conceptos</option>
          {conceptos.map((c) => (
            <option key={c} value={c}>{conceptoLabel(c)}</option>
          ))}
        </select>
        <select
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="all">Todos los meses</option>
          {months.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <div className="ml-auto text-sm text-gray-500 self-center">
          Total: <span className="font-bold text-emerald-600">{formatCurrency(totalFiltered)}</span>
          {' '}({filtered.length} registros)
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="💰"
          title="Sin ingresos"
          description="Registra tu primera venta o servicio"
          action={
            <button onClick={openNew} className="text-emerald-600 font-medium text-sm hover:underline">
              + Agregar ingreso
            </button>
          }
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Descripcion</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Concepto</th>
                <th className="px-4 py-3">Pago</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="px-4 py-3 text-center">Factura</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{formatDate(i.fecha)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{i.descripcion}</td>
                  <td className="px-4 py-3 text-gray-600">{clienteName(i.clienteId) || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 rounded-full text-xs bg-emerald-50 text-emerald-700">
                      {conceptoLabel(i.concepto)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formaPagoLabel(i.formaPago)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                    {formatCurrency(i.montoTotal)}
                    {i.iva > 0 && (
                      <span className="block text-xs text-gray-400">IVA: {formatCurrency(i.iva)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {i.factura ? (
                      <span className="text-emerald-600 font-medium">Si</span>
                    ) : (
                      <span className="text-gray-400">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(i)} className="text-purple-600 hover:text-purple-800 text-xs">
                        Editar
                      </button>
                      <button onClick={() => handleDelete(i.id)} className="text-red-500 hover:text-red-700 text-xs">
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Editar Ingreso' : 'Nuevo Ingreso'}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Fecha</label>
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Concepto</label>
              <select
                value={form.concepto}
                onChange={(e) => setForm({ ...form, concepto: e.target.value as ConceptoIngreso })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                {conceptos.map((c) => (
                  <option key={c} value={c}>{conceptoLabel(c)}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Descripcion</label>
            <input
              type="text"
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Ej: Bordado de logo en 10 playeras"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Cliente</label>
            <select
              value={form.clienteId}
              onChange={(e) => setForm({ ...form, clienteId: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Sin cliente asignado</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Monto (sin IVA)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.monto || ''}
                onChange={(e) => setForm({ ...form, monto: parseFloat(e.target.value) || 0 })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Forma de Pago</label>
              <select
                value={form.formaPago}
                onChange={(e) => setForm({ ...form, formaPago: e.target.value as FormaPago })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                {formasPago.map((fp) => (
                  <option key={fp} value={fp}>{formaPagoLabel(fp)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.factura}
                onChange={(e) => setForm({ ...form, factura: e.target.checked })}
                className="w-4 h-4 accent-emerald-600"
              />
              <span className="text-sm text-gray-700">Tiene factura (IVA 16%)</span>
            </label>
            {form.factura && form.monto > 0 && (
              <span className="text-xs text-gray-400">
                IVA: {formatCurrency(calcIVA(form.monto))} &middot; Total: {formatCurrency(form.monto + calcIVA(form.monto))}
              </span>
            )}
          </div>

          {form.factura && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Numero de Factura</label>
              <input
                type="text"
                value={form.numeroFactura}
                onChange={(e) => setForm({ ...form, numeroFactura: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          )}

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
              className="bg-emerald-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700"
            >
              {editingId ? 'Guardar Cambios' : 'Registrar Ingreso'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
