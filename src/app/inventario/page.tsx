'use client';

import { useState, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { getInventario } from '@/lib/store';
import { addItemInventario, updateItemInventario, deleteItemInventario } from '@/lib/store-sync';
import { ItemInventario, CategoriaInventario, UnidadInventario } from '@/lib/types';
import { formatCurrency } from '@/lib/helpers';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import ActionMenu from '@/components/ActionMenu';
import EmptyState from '@/components/EmptyState';
import { inputClass, labelClass, btnPrimary, btnSecondary } from '@/lib/styles';

const CATEGORIAS: { value: CategoriaInventario; label: string; color: string }[] = [
  { value: 'hilo', label: 'Hilo', color: 'bg-[#c72a09]/10 text-[#c72a09]' },
  { value: 'prenda', label: 'Prenda', color: 'bg-blue-100 text-blue-700' },
  { value: 'insumo', label: 'Insumo', color: 'bg-green-100 text-green-700' },
  { value: 'repuesto', label: 'Repuesto', color: 'bg-purple-100 text-purple-700' },
  { value: 'otro', label: 'Otro', color: 'bg-neutral-100 text-neutral-500' },
];

const UNIDADES: { value: UnidadInventario; label: string }[] = [
  { value: 'conos', label: 'Conos' },
  { value: 'piezas', label: 'Piezas' },
  { value: 'metros', label: 'Metros' },
  { value: 'rollos', label: 'Rollos' },
  { value: 'paquetes', label: 'Paquetes' },
  { value: 'unidades', label: 'Unidades' },
];

function emptyItem(): Omit<ItemInventario, 'id' | 'createdAt'> {
  return {
    nombre: '',
    categoria: 'hilo',
    unidad: 'conos',
    stock: 0,
    stockMinimo: 5,
    costo: 0,
    color: '',
    marca: '',
    ubicacion: '',
    notas: '',
  };
}

export default function InventarioPage() {
  const isClient = typeof window !== 'undefined';
  const [items, setItems] = useState<ItemInventario[]>(() =>
    isClient ? getInventario().sort((a, b) => a.nombre.localeCompare(b.nombre)) : [],
  );
  const [mounted] = useState(() => isClient);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyItem());
  const [formError, setFormError] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [adjustQty, setAdjustQty] = useState(0);

  const reload = useCallback(() => {
    setItems(getInventario().sort((a, b) => a.nombre.localeCompare(b.nombre)));
  }, []);

  if (!mounted)
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" />
      </div>
    );

  const openNew = () => {
    setEditingId(null);
    setForm(emptyItem());
    setFormError(null);
    setModalOpen(true);
  };
  const openEdit = (i: ItemInventario) => {
    setEditingId(i.id);
    setForm({ ...i });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!form.nombre.trim()) {
      setFormError('El nombre es requerido');
      return;
    }
    if (form.stock < 0) {
      setFormError('El stock no puede ser negativo');
      return;
    }
    setFormError(null);
    const data: ItemInventario = {
      ...(form as ItemInventario),
      id: editingId || uuid(),
      createdAt: editingId ? (form as ItemInventario).createdAt : new Date().toISOString(),
    };
    editingId ? updateItemInventario(data) : addItemInventario(data);
    setModalOpen(false);
    reload();
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Eliminar este material?')) {
      deleteItemInventario(id);
      reload();
    }
  };

  const handleAdjust = (item: ItemInventario) => {
    const newStock = item.stock + adjustQty;
    if (newStock < 0) return;
    updateItemInventario({ ...item, stock: newStock });
    setAdjustId(null);
    setAdjustQty(0);
    reload();
  };

  const catColor = (cat: CategoriaInventario) =>
    CATEGORIAS.find((c) => c.value === cat)?.color || 'bg-neutral-100 text-neutral-500';
  const catLabel = (cat: CategoriaInventario) => CATEGORIAS.find((c) => c.value === cat)?.label || cat;
  const unitLabel = (u: UnidadInventario) => UNIDADES.find((un) => un.value === u)?.label || u;

  const lowStock = items.filter((i) => i.stock <= i.stockMinimo);
  const filtered = items.filter((i) => {
    if (filterCat !== 'all' && i.categoria !== filterCat) return false;
    if (
      search &&
      !i.nombre.toLowerCase().includes(search.toLowerCase()) &&
      !i.color.toLowerCase().includes(search.toLowerCase()) &&
      !i.marca.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    return true;
  });
  const totalValue = items.reduce((s, i) => s + i.stock * i.costo, 0);

  return (
    <div>
      <PageHeader
        title="Inventario"
        description={`${items.length} materiales · Valor: ${formatCurrency(totalValue)}`}
        action={
          <button onClick={openNew} className={btnPrimary}>
            + Nuevo Material
          </button>
        }
      />

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
          <p className="text-xs font-bold text-amber-700 mb-2">
            Stock bajo en {lowStock.length} material{lowStock.length > 1 ? 'es' : ''}:
          </p>
          <div className="flex flex-wrap gap-2">
            {lowStock.map((i) => (
              <span key={i.id} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-700">
                {i.nombre} — {i.stock} {unitLabel(i.unidad)} (mín. {i.stockMinimo})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <div className="relative max-w-xs flex-1">
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
            placeholder="Buscar material, color, marca..."
            className="w-full border border-neutral-200 rounded-xl pl-10 pr-4 py-2.5 text-xs bg-white focus:outline-none focus:border-[#c72a09]"
          />
        </div>
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="border border-neutral-200 rounded-xl px-3.5 py-2.5 text-xs font-medium bg-white focus:outline-none focus:border-[#c72a09]"
        >
          <option value="all">Todas las categorías</option>
          {CATEGORIAS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          title="Sin materiales"
          description="Agrega tu primer material al inventario"
          action={
            <button
              onClick={openNew}
              className="text-[#c72a09] font-bold text-xs uppercase tracking-wide hover:underline"
            >
              + Agregar material
            </button>
          }
        />
      ) : (
        <div className="bg-white rounded-2xl border border-neutral-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100">
                <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                  Material
                </th>
                <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                  Categoría
                </th>
                <th className="px-5 py-4 text-center text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                  Stock
                </th>
                <th className="px-5 py-4 text-right text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                  Costo
                </th>
                <th className="px-5 py-4 text-right text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                  Valor
                </th>
                <th className="px-5 py-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const isLow = item.stock <= item.stockMinimo;
                return (
                  <tr key={item.id} className="border-b border-neutral-50 hover:bg-neutral-50/50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {item.color && (
                          <div
                            className="w-4 h-4 rounded-full border border-neutral-200 shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                        )}
                        <div>
                          <p className="font-semibold text-[#0a0a0a]">{item.nombre}</p>
                          <p className="text-[10px] text-neutral-400">
                            {[item.marca, item.ubicacion].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase ${catColor(item.categoria)}`}
                      >
                        {catLabel(item.categoria)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      {adjustId === item.id ? (
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            inputMode="decimal"
                            value={adjustQty}
                            onChange={(e) => setAdjustQty(Number(e.target.value))}
                            className="w-16 border border-neutral-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:border-[#c72a09]"
                          />
                          <button
                            onClick={() => handleAdjust(item)}
                            className="text-[10px] font-bold text-[#c72a09] hover:underline"
                          >
                            OK
                          </button>
                          <button onClick={() => setAdjustId(null)} className="text-[10px] text-neutral-400">
                            X
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setAdjustId(item.id);
                            setAdjustQty(0);
                          }}
                          className={`font-bold ${isLow ? 'text-red-500' : 'text-[#0a0a0a]'}`}
                        >
                          {item.stock}{' '}
                          <span className="text-[10px] text-neutral-400 font-normal">{unitLabel(item.unidad)}</span>
                          {isLow && <span className="block text-[9px] text-red-400">Bajo</span>}
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right text-neutral-500">{formatCurrency(item.costo)}</td>
                    <td className="px-5 py-4 text-right font-bold">{formatCurrency(item.stock * item.costo)}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end">
                        <ActionMenu
                          items={[
                            { label: 'Editar', onClick: () => openEdit(item) },
                            { label: 'Eliminar', onClick: () => handleDelete(item.id), danger: true },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Editar Material' : 'Nuevo Material'}
      >
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Nombre *</label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Hilo poliéster rojo"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Categoría</label>
              <select
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value as CategoriaInventario })}
                className={inputClass}
              >
                {CATEGORIAS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Unidad</label>
              <select
                value={form.unidad}
                onChange={(e) => setForm({ ...form, unidad: e.target.value as UnidadInventario })}
                className={inputClass}
              >
                {UNIDADES.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Stock actual</label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Stock mínimo</label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={form.stockMinimo}
                onChange={(e) => setForm({ ...form, stockMinimo: Number(e.target.value) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Costo unitario</label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.5}
                value={form.costo}
                onChange={(e) => setForm({ ...form, costo: Number(e.target.value) })}
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={form.color || '#000000'}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="w-10 h-10 rounded-lg border border-neutral-200 cursor-pointer"
                />
                <input
                  type="text"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  placeholder="#FF0000"
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Marca</label>
              <input
                type="text"
                value={form.marca}
                onChange={(e) => setForm({ ...form, marca: e.target.value })}
                placeholder="Ej: Madeira"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Ubicación</label>
              <input
                type="text"
                value={form.ubicacion}
                onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
                placeholder="Ej: Estante A"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Notas</label>
            <textarea
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              rows={2}
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
