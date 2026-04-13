'use client';

import { useEffect, useState, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import {
  getEgresos, addEgreso, updateEgreso, deleteEgreso,
  getProveedores,
  getEgresosRecurrentes, addEgresoRecurrente, updateEgresoRecurrente, deleteEgresoRecurrente,
} from '@/lib/store';
import { Egreso, Proveedor, EgresoRecurrente, CategoriaEgreso, FormaPago } from '@/lib/types';
import { formatCurrency, formatDate, formaPagoLabel, categoriaLabel, todayString, calcIVA } from '@/lib/helpers';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import EmptyState from '@/components/EmptyState';

const categorias: CategoriaEgreso[] = ['programas', 'mercancia', 'insumos', 'servicios', 'maquinaria', 'publicidad', 'renta', 'otro'];
const formasPago: FormaPago[] = ['efectivo', 'tarjeta', 'transferencia', 'otro'];

const subcategoriasInsumo = ['Telas', 'Hilos', 'Agujas', 'Repuestos de maquina', 'Estabilizadores', 'Otro'];
const subcategoriasProgramas = ['Photoshop', 'Canva', 'Software de automatizacion', 'Wilcom', 'Otro'];

function emptyEgreso(): Omit<Egreso, 'id' | 'createdAt'> {
  return {
    fecha: todayString(),
    descripcion: '',
    categoria: 'insumos',
    subcategoria: '',
    proveedorId: '',
    monto: 0,
    iva: 0,
    montoTotal: 0,
    formaPago: 'efectivo',
    factura: false,
    numeroFactura: '',
    notas: '',
  };
}

function emptyRecurrente(): Omit<EgresoRecurrente, 'id' | 'createdAt'> {
  return {
    descripcion: '',
    categoria: 'programas',
    subcategoria: '',
    proveedorId: '',
    monto: 0,
    formaPago: 'tarjeta',
    factura: false,
    diaDelMes: 1,
    activo: true,
  };
}

export default function EgresosPage() {
  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [recurrentes, setRecurrentes] = useState<EgresoRecurrente[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [recModalOpen, setRecModalOpen] = useState(false);
  const [recPanelOpen, setRecPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRecId, setEditingRecId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyEgreso());
  const [recForm, setRecForm] = useState(emptyRecurrente());
  const [filterCat, setFilterCat] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [mounted, setMounted] = useState(false);

  const reload = useCallback(() => {
    setEgresos(getEgresos().sort((a, b) => b.fecha.localeCompare(a.fecha)));
    setProveedores(getProveedores());
    setRecurrentes(getEgresosRecurrentes());
  }, []);

  useEffect(() => {
    reload();
    setMounted(true);
  }, [reload]);

  if (!mounted) return <div className="p-8">Cargando...</div>;

  // --- Egreso CRUD ---
  const openNew = () => {
    setEditingId(null);
    setForm(emptyEgreso());
    setModalOpen(true);
  };

  const openEdit = (e: Egreso) => {
    setEditingId(e.id);
    setForm({ ...e });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!form.descripcion || form.monto <= 0) return;
    const iva = form.factura ? calcIVA(form.monto) : 0;
    const data: Egreso = {
      ...(form as Egreso),
      id: editingId || uuid(),
      iva,
      montoTotal: form.monto + iva,
      createdAt: editingId ? (form as Egreso).createdAt : new Date().toISOString(),
    };
    if (editingId) {
      updateEgreso(data);
    } else {
      addEgreso(data);
    }
    setModalOpen(false);
    reload();
  };

  const handleDelete = (id: string) => {
    if (confirm('Estas seguro de eliminar este egreso?')) {
      deleteEgreso(id);
      reload();
    }
  };

  // --- Recurrente CRUD ---
  const openNewRec = () => {
    setEditingRecId(null);
    setRecForm(emptyRecurrente());
    setRecModalOpen(true);
  };

  const openEditRec = (r: EgresoRecurrente) => {
    setEditingRecId(r.id);
    setRecForm({ ...r });
    setRecModalOpen(true);
  };

  const handleSaveRec = () => {
    if (!recForm.descripcion || recForm.monto <= 0) return;
    const data: EgresoRecurrente = {
      ...(recForm as EgresoRecurrente),
      id: editingRecId || uuid(),
      createdAt: editingRecId ? (recForm as EgresoRecurrente).createdAt : new Date().toISOString(),
    };
    if (editingRecId) {
      updateEgresoRecurrente(data);
    } else {
      addEgresoRecurrente(data);
    }
    setRecModalOpen(false);
    reload();
  };

  const handleDeleteRec = (id: string) => {
    if (confirm('Eliminar este egreso recurrente?')) {
      deleteEgresoRecurrente(id);
      reload();
    }
  };

  const toggleRecActivo = (r: EgresoRecurrente) => {
    updateEgresoRecurrente({ ...r, activo: !r.activo });
    reload();
  };

  const proveedorName = (id: string) => proveedores.find((p) => p.id === id)?.nombre || '';

  const months = Array.from(
    new Set(egresos.map((e) => e.fecha.substring(0, 7)))
  ).sort().reverse();

  const filtered = egresos.filter((e) => {
    if (filterCat !== 'all' && e.categoria !== filterCat) return false;
    if (filterMonth !== 'all' && !e.fecha.startsWith(filterMonth)) return false;
    return true;
  });

  const totalFiltered = filtered.reduce((s, e) => s + e.montoTotal, 0);

  const subcategorias = form.categoria === 'insumos'
    ? subcategoriasInsumo
    : form.categoria === 'programas'
    ? subcategoriasProgramas
    : [];

  const recSubcategorias = recForm.categoria === 'insumos'
    ? subcategoriasInsumo
    : recForm.categoria === 'programas'
    ? subcategoriasProgramas
    : [];

  const totalRecurrenteMensual = recurrentes
    .filter((r) => r.activo)
    .reduce((s, r) => s + r.monto + (r.factura ? calcIVA(r.monto) : 0), 0);

  return (
    <div>
      <PageHeader
        title="Egresos"
        description="Control de gastos del negocio"
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setRecPanelOpen(!recPanelOpen)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                recPanelOpen
                  ? 'bg-purple-100 text-purple-700 border-purple-300'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
              }`}
            >
              Recurrentes ({recurrentes.filter((r) => r.activo).length})
            </button>
            <button
              onClick={openNew}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
            >
              + Nuevo Egreso
            </button>
          </div>
        }
      />

      {/* Panel de Recurrentes */}
      {recPanelOpen && (
        <div className="bg-white rounded-xl border border-purple-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-purple-700 uppercase tracking-wide">
                Egresos Recurrentes Mensuales
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Se generan automaticamente cada mes. Total mensual: <span className="font-semibold text-red-600">{formatCurrency(totalRecurrenteMensual)}</span>
              </p>
            </div>
            <button
              onClick={openNewRec}
              className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-purple-700"
            >
              + Nuevo Recurrente
            </button>
          </div>

          {recurrentes.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              Sin egresos recurrentes. Agrega gastos fijos como renta, suscripciones, etc.
            </p>
          ) : (
            <div className="space-y-2">
              {recurrentes.map((r) => (
                <div
                  key={r.id}
                  className={`flex items-center justify-between py-3 px-4 rounded-lg border ${
                    r.activo ? 'bg-white border-gray-100' : 'bg-gray-50 border-gray-100 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleRecActivo(r)}
                      className={`w-8 h-5 rounded-full transition-colors relative ${
                        r.activo ? 'bg-purple-500' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${
                          r.activo ? 'left-3.5' : 'left-0.5'
                        }`}
                      />
                    </button>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{r.descripcion}</p>
                      <p className="text-xs text-gray-500">
                        {categoriaLabel(r.categoria)}
                        {r.subcategoria && ` / ${r.subcategoria}`}
                        {' '}&middot; Dia {r.diaDelMes} de cada mes
                        {' '}&middot; {formaPagoLabel(r.formaPago)}
                        {r.factura && <span className="text-emerald-600"> &middot; Con factura</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-red-600">
                      {formatCurrency(r.monto + (r.factura ? calcIVA(r.monto) : 0))}
                      <span className="text-xs text-gray-400 font-normal">/mes</span>
                    </span>
                    <button onClick={() => openEditRec(r)} className="text-purple-600 hover:text-purple-800 text-xs">
                      Editar
                    </button>
                    <button onClick={() => handleDeleteRec(r.id)} className="text-red-500 hover:text-red-700 text-xs">
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="all">Todas las categorias</option>
          {categorias.map((c) => (
            <option key={c} value={c}>{categoriaLabel(c)}</option>
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
          Total: <span className="font-bold text-red-600">{formatCurrency(totalFiltered)}</span>
          {' '}({filtered.length} registros)
        </div>
      </div>

      {/* Tabla de Egresos */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="💸"
          title="Sin egresos"
          description="Registra tu primer gasto para empezar a llevar control"
          action={
            <button onClick={openNew} className="text-purple-600 font-medium text-sm hover:underline">
              + Agregar egreso
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
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Pago</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="px-4 py-3 text-center">Factura</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{formatDate(e.fecha)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {e.descripcion}
                    {e.subcategoria && (
                      <span className="block text-xs text-gray-400">{e.subcategoria}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-600">
                      {categoriaLabel(e.categoria)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{proveedorName(e.proveedorId) || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{formaPagoLabel(e.formaPago)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600">
                    {formatCurrency(e.montoTotal)}
                    {e.iva > 0 && (
                      <span className="block text-xs text-gray-400">IVA: {formatCurrency(e.iva)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {e.factura ? (
                      <span className="text-emerald-600 font-medium">Si</span>
                    ) : (
                      <span className="text-gray-400">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(e)} className="text-purple-600 hover:text-purple-800 text-xs">
                        Editar
                      </button>
                      <button onClick={() => handleDelete(e.id)} className="text-red-500 hover:text-red-700 text-xs">
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

      {/* Modal Egreso */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Editar Egreso' : 'Nuevo Egreso'}
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
              <label className="block text-xs font-medium text-gray-500 mb-1">Categoria</label>
              <select
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value as CategoriaEgreso, subcategoria: '' })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                {categorias.map((c) => (
                  <option key={c} value={c}>{categoriaLabel(c)}</option>
                ))}
              </select>
            </div>
          </div>

          {subcategorias.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Subcategoria</label>
              <select
                value={form.subcategoria}
                onChange={(e) => setForm({ ...form, subcategoria: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Seleccionar...</option>
                {subcategorias.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Descripcion</label>
            <input
              type="text"
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Ej: Compra de hilos DMC"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Proveedor</label>
            <select
              value={form.proveedorId}
              onChange={(e) => setForm({ ...form, proveedorId: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Sin proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
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
                className="w-4 h-4 accent-purple-600"
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
              className="bg-purple-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-purple-700"
            >
              {editingId ? 'Guardar Cambios' : 'Registrar Egreso'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Recurrente */}
      <Modal
        open={recModalOpen}
        onClose={() => setRecModalOpen(false)}
        title={editingRecId ? 'Editar Egreso Recurrente' : 'Nuevo Egreso Recurrente'}
      >
        <div className="space-y-4">
          <div className="bg-purple-50 rounded-lg p-3 text-xs text-purple-700">
            Los egresos recurrentes se generan automaticamente cada mes en la fecha que indiques.
            Ideal para renta, suscripciones de software, servicios fijos, etc.
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Descripcion *</label>
            <input
              type="text"
              value={recForm.descripcion}
              onChange={(e) => setRecForm({ ...recForm, descripcion: e.target.value })}
              placeholder="Ej: Suscripcion Canva Pro"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Categoria</label>
              <select
                value={recForm.categoria}
                onChange={(e) => setRecForm({ ...recForm, categoria: e.target.value as CategoriaEgreso, subcategoria: '' })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                {categorias.map((c) => (
                  <option key={c} value={c}>{categoriaLabel(c)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Dia del mes</label>
              <select
                value={recForm.diaDelMes}
                onChange={(e) => setRecForm({ ...recForm, diaDelMes: Number(e.target.value) })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>Dia {d}</option>
                ))}
              </select>
            </div>
          </div>

          {recSubcategorias.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Subcategoria</label>
              <select
                value={recForm.subcategoria}
                onChange={(e) => setRecForm({ ...recForm, subcategoria: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Seleccionar...</option>
                {recSubcategorias.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Proveedor</label>
            <select
              value={recForm.proveedorId}
              onChange={(e) => setRecForm({ ...recForm, proveedorId: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Sin proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Monto mensual (sin IVA) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={recForm.monto || ''}
                onChange={(e) => setRecForm({ ...recForm, monto: parseFloat(e.target.value) || 0 })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Forma de Pago</label>
              <select
                value={recForm.formaPago}
                onChange={(e) => setRecForm({ ...recForm, formaPago: e.target.value as FormaPago })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                {formasPago.map((fp) => (
                  <option key={fp} value={fp}>{formaPagoLabel(fp)}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={recForm.factura}
              onChange={(e) => setRecForm({ ...recForm, factura: e.target.checked })}
              className="w-4 h-4 accent-purple-600"
            />
            <span className="text-sm text-gray-700">Tiene factura (IVA 16%)</span>
            {recForm.factura && recForm.monto > 0 && (
              <span className="text-xs text-gray-400 ml-2">
                Total con IVA: {formatCurrency(recForm.monto + calcIVA(recForm.monto))}
              </span>
            )}
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setRecModalOpen(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveRec}
              className="bg-purple-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-purple-700"
            >
              {editingRecId ? 'Guardar Cambios' : 'Crear Recurrente'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
