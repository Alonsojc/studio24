'use client';

import { useEffect, useState, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { getProductos } from '@/lib/store';
import { addProducto, updateProducto, deleteProducto } from '@/lib/store-sync';
import { Producto, CategoriaProducto } from '@/lib/types';
import { formatCurrency, validateProducto } from '@/lib/helpers';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import ActionMenu from '@/components/ActionMenu';
import { inputClass, labelClass, btnPrimary, btnSecondary } from '@/lib/styles';

const categorias: { value: CategoriaProducto; label: string; color: string }[] = [
  { value: 'bordado', label: 'Bordado', color: 'bg-[#c72a09]/10 text-[#c72a09]' },
  { value: 'prenda', label: 'Prenda', color: 'bg-blue-100 text-blue-700' },
  { value: 'servicio', label: 'Servicio', color: 'bg-purple-100 text-purple-700' },
  { value: 'otro', label: 'Otro', color: 'bg-neutral-100 text-neutral-500' },
];

function emptyProducto(): Omit<Producto, 'id' | 'createdAt'> {
  return { nombre: '', categoria: 'bordado', precio: 0, activo: true };
}

export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyProducto());
  const [formError, setFormError] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<string>('all');
  const [mounted, setMounted] = useState(false);

  const reload = useCallback(() => {
    setProductos(getProductos().sort((a, b) => {
      const catOrder: Record<string, number> = { bordado: 0, prenda: 1, servicio: 2, otro: 3 };
      if (catOrder[a.categoria] !== catOrder[b.categoria]) return catOrder[a.categoria] - catOrder[b.categoria];
      return a.nombre.localeCompare(b.nombre);
    }));
  }, []);

  useEffect(() => { reload(); setMounted(true); }, [reload]);

  if (!mounted) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" /></div>;

  const openNew = (cat?: CategoriaProducto) => {
    setEditingId(null);
    setForm({ ...emptyProducto(), categoria: cat || 'bordado' });
    setFormError(null);
    setModalOpen(true);
  };
  const openEdit = (p: Producto) => { setEditingId(p.id); setForm({ ...p }); setFormError(null); setModalOpen(true); };
  const handleSave = () => {
    const error = validateProducto(form);
    if (error) { setFormError(error); return; }
    setFormError(null);
    const data: Producto = { ...(form as Producto), id: editingId || uuid(), createdAt: editingId ? (form as Producto).createdAt : new Date().toISOString() };
    editingId ? updateProducto(data) : addProducto(data);
    setModalOpen(false); reload();
  };
  const handleDelete = (id: string) => { if (confirm('Eliminar producto?')) { deleteProducto(id); reload(); } };
  const toggleActivo = (p: Producto) => { updateProducto({ ...p, activo: !p.activo }); reload(); };

  const filtered = filterCat === 'all' ? productos : productos.filter((p) => p.categoria === filterCat);
  const getCatInfo = (cat: string) => categorias.find((c) => c.value === cat) || categorias[3];

  return (
    <div>
      <PageHeader
        title="Productos y Precios"
        description={`${productos.filter((p) => p.activo).length} productos activos`}
        action={<button onClick={() => openNew()} className={btnPrimary}>+ Nuevo Producto</button>}
      />

      {/* Category filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button onClick={() => setFilterCat('all')} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-colors border ${filterCat === 'all' ? 'bg-[#0a0a0a] text-white border-[#0a0a0a]' : 'bg-white text-neutral-400 border-neutral-200 hover:border-neutral-400'}`}>
          Todos ({productos.length})
        </button>
        {categorias.map((c) => {
          const count = productos.filter((p) => p.categoria === c.value).length;
          return (
            <button key={c.value} onClick={() => setFilterCat(c.value)} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-colors border ${filterCat === c.value ? 'bg-[#0a0a0a] text-white border-[#0a0a0a]' : 'bg-white text-neutral-400 border-neutral-200 hover:border-neutral-400'}`}>
              {c.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Products grouped by category */}
      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-sm text-neutral-300 mb-3">Sin productos en esta categoria</p>
          <button onClick={() => openNew(filterCat !== 'all' ? filterCat as CategoriaProducto : undefined)} className="text-[#c72a09] font-bold text-xs uppercase tracking-wide hover:underline">+ Agregar producto</button>
        </div>
      ) : (
        <div className="space-y-6">
          {categorias.filter((c) => filterCat === 'all' || filterCat === c.value).map((cat) => {
            const items = filtered.filter((p) => p.categoria === cat.value);
            if (items.length === 0) return null;
            return (
              <div key={cat.value}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase">{cat.label}</h3>
                    <span className="text-[10px] text-neutral-300">{items.length}</span>
                  </div>
                  <button onClick={() => openNew(cat.value)} className="text-[10px] font-bold text-[#c72a09] uppercase tracking-wide hover:underline">+ Agregar</button>
                </div>
                <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
                  {items.map((p, idx) => (
                    <div key={p.id} className={`flex items-center justify-between px-5 py-4 ${idx > 0 ? 'border-t border-neutral-50' : ''} ${!p.activo ? 'opacity-40' : ''} hover:bg-neutral-50/50 transition-colors`}>
                      <div className="flex items-center gap-3">
                        <button onClick={() => toggleActivo(p)} className={`w-8 h-5 rounded-full transition-colors relative shrink-0 ${p.activo ? 'bg-[#c72a09]' : 'bg-neutral-200'}`}>
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow ${p.activo ? 'left-3.5' : 'left-0.5'}`} />
                        </button>
                        <div>
                          <p className="text-sm font-semibold text-[#0a0a0a]">{p.nombre}</p>
                          <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${getCatInfo(p.categoria).color}`}>{getCatInfo(p.categoria).label}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-lg font-black text-[#0a0a0a]">{formatCurrency(p.precio)}</span>
                        <ActionMenu items={[
                          { label: 'Editar', onClick: () => openEdit(p) },
                          { label: p.activo ? 'Desactivar' : 'Activar', onClick: () => toggleActivo(p) },
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Editar Producto' : 'Nuevo Producto'}>
        <div className="space-y-4">
          <div><label className={labelClass}>Nombre *</label><input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Playera Polo, Bordado Grande..." className={inputClass} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Categoria</label>
              <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value as CategoriaProducto })} className={inputClass}>
                {categorias.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Precio</label><input type="number" step="0.01" min="0" value={form.precio || ''} onChange={(e) => setForm({ ...form, precio: parseFloat(e.target.value) || 0 })} className={inputClass} /></div>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} className="w-4 h-4 accent-[#c72a09] rounded" />
            <span className="text-sm text-neutral-600">Producto activo (visible en cotizador)</span>
          </label>
          {formError && <p className="text-xs text-red-500 font-semibold bg-red-50 rounded-xl px-3.5 py-2.5">{formError}</p>}
          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
            <button onClick={() => setModalOpen(false)} className={btnSecondary}>Cancelar</button>
            <button onClick={handleSave} className={btnPrimary}>{editingId ? 'Guardar' : 'Crear'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
