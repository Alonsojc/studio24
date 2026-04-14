'use client';

import { useState, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { getDisenos, getClientes } from '@/lib/store';
import { addDiseno, updateDiseno, deleteDiseno } from '@/lib/store-sync';
import { Diseno, Cliente } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import ActionMenu from '@/components/ActionMenu';
import EmptyState from '@/components/EmptyState';
import PhotoGallery from '@/components/PhotoGallery';
import { inputClass, labelClass, btnPrimary, btnSecondary } from '@/lib/styles';

function emptyDiseno(): Omit<Diseno, 'id' | 'createdAt'> {
  return { nombre: '', archivo: '', clienteId: '', puntadas: 0, colores: 1, ancho: 0, alto: 0, tags: [], notas: '' };
}

export default function DisenosPage() {
  const isClient = typeof window !== 'undefined';
  const [disenos, setDisenos] = useState<Diseno[]>(() =>
    isClient ? getDisenos().sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [],
  );
  const [clientes] = useState<Cliente[]>(() => (isClient ? getClientes() : []));
  const [mounted] = useState(() => isClient);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedDiseno, setSelectedDiseno] = useState<Diseno | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyDiseno());
  const [formError, setFormError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterCliente, setFilterCliente] = useState('all');

  const reload = useCallback(() => {
    setDisenos(getDisenos().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, []);

  if (!mounted)
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" />
      </div>
    );

  const clienteName = (id: string) => clientes.find((c) => c.id === id)?.nombre || '';

  const openNew = () => {
    setEditingId(null);
    setForm(emptyDiseno());
    setFormError(null);
    setTagInput('');
    setModalOpen(true);
  };
  const openEdit = (d: Diseno) => {
    setEditingId(d.id);
    setForm({ ...d });
    setFormError(null);
    setTagInput('');
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!form.nombre.trim()) {
      setFormError('El nombre es requerido');
      return;
    }
    setFormError(null);
    const data: Diseno = {
      ...(form as Diseno),
      id: editingId || uuid(),
      createdAt: editingId ? (form as Diseno).createdAt : new Date().toISOString(),
    };
    editingId ? updateDiseno(data) : addDiseno(data);
    setModalOpen(false);
    reload();
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Eliminar este diseño?')) {
      deleteDiseno(id);
      reload();
    }
  };

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !form.tags.includes(tag)) {
      setForm({ ...form, tags: [...form.tags, tag] });
    }
    setTagInput('');
  };
  const removeTag = (tag: string) => setForm({ ...form, tags: form.tags.filter((t) => t !== tag) });

  const filtered = disenos.filter((d) => {
    if (filterCliente !== 'all' && d.clienteId !== filterCliente) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        d.nombre.toLowerCase().includes(q) || d.archivo.toLowerCase().includes(q) || d.tags.some((t) => t.includes(q))
      );
    }
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Biblioteca de Diseños"
        description={`${disenos.length} diseños guardados`}
        action={
          <button onClick={openNew} className={btnPrimary}>
            + Nuevo Diseño
          </button>
        }
      />

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
            placeholder="Buscar diseño, archivo o tag..."
            className="w-full border border-neutral-200 rounded-xl pl-10 pr-4 py-2.5 text-xs bg-white focus:outline-none focus:border-[#c72a09]"
          />
        </div>
        <select
          value={filterCliente}
          onChange={(e) => setFilterCliente(e.target.value)}
          className="border border-neutral-200 rounded-xl px-3.5 py-2.5 text-xs font-medium bg-white focus:outline-none focus:border-[#c72a09]"
        >
          <option value="all">Todos los clientes</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          title="Sin diseños"
          description="Agrega tu primer diseño a la biblioteca"
          action={
            <button
              onClick={openNew}
              className="text-[#c72a09] font-bold text-xs uppercase tracking-wide hover:underline"
            >
              + Agregar diseño
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((d) => (
            <div
              key={d.id}
              onClick={() => {
                setSelectedDiseno(d);
                setDetailOpen(true);
              }}
              className="bg-white rounded-2xl border border-neutral-100 p-5 hover:border-neutral-300 transition-all cursor-pointer group relative"
            >
              <div className="absolute top-3 right-3">
                <ActionMenu
                  items={[
                    { label: 'Editar', onClick: () => openEdit(d) },
                    { label: 'Eliminar', onClick: () => handleDelete(d.id), danger: true },
                  ]}
                />
              </div>
              <div className="w-12 h-12 rounded-xl bg-[#0a0a0a] text-white flex items-center justify-center text-lg mb-3">
                🎨
              </div>
              <h3 className="font-bold text-[#0a0a0a] group-hover:text-[#c72a09] transition-colors">{d.nombre}</h3>
              {d.archivo && <p className="text-[10px] text-neutral-400 mt-0.5 truncate">📄 {d.archivo}</p>}
              {d.clienteId && <p className="text-xs text-neutral-400 mt-1">{clienteName(d.clienteId)}</p>}
              <div className="flex items-center gap-3 mt-3 text-[10px] text-neutral-400">
                {d.puntadas > 0 && <span>{d.puntadas.toLocaleString()} puntadas</span>}
                {d.colores > 0 && <span>{d.colores} colores</span>}
                {d.ancho > 0 && d.alto > 0 && (
                  <span>
                    {d.ancho}x{d.alto}cm
                  </span>
                )}
              </div>
              {d.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {d.tags.slice(0, 4).map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded text-[9px] font-bold bg-neutral-100 text-neutral-500">
                      {t}
                    </span>
                  ))}
                  {d.tags.length > 4 && <span className="text-[9px] text-neutral-400">+{d.tags.length - 4}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title={selectedDiseno?.nombre || 'Diseño'}>
        {selectedDiseno && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className={labelClass}>Archivo</span>
                <p className="text-sm">{selectedDiseno.archivo || '—'}</p>
              </div>
              <div>
                <span className={labelClass}>Cliente</span>
                <p className="text-sm">{clienteName(selectedDiseno.clienteId) || 'Sin asignar'}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <span className={labelClass}>Puntadas</span>
                <p className="text-sm font-bold">
                  {selectedDiseno.puntadas > 0 ? selectedDiseno.puntadas.toLocaleString() : '—'}
                </p>
              </div>
              <div>
                <span className={labelClass}>Colores</span>
                <p className="text-sm font-bold">{selectedDiseno.colores || '—'}</p>
              </div>
              <div>
                <span className={labelClass}>Tamaño</span>
                <p className="text-sm font-bold">
                  {selectedDiseno.ancho > 0 ? `${selectedDiseno.ancho}x${selectedDiseno.alto}cm` : '—'}
                </p>
              </div>
            </div>
            {selectedDiseno.tags.length > 0 && (
              <div>
                <span className={labelClass}>Tags</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedDiseno.tags.map((t) => (
                    <span
                      key={t}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-neutral-100 text-neutral-600"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {selectedDiseno.notas && (
              <div>
                <span className={labelClass}>Notas</span>
                <p className="text-sm text-neutral-500">{selectedDiseno.notas}</p>
              </div>
            )}
            <div>
              <span className={labelClass}>Fotos de referencia</span>
              <PhotoGallery pedidoId={`diseno_${selectedDiseno.id}`} />
            </div>
          </div>
        )}
      </Modal>

      {/* Form modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Editar Diseño' : 'Nuevo Diseño'}>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Nombre del diseño *</label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Logo Empresa ABC"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Archivo (.dst, .tbf)</label>
              <input
                type="text"
                value={form.archivo}
                onChange={(e) => setForm({ ...form, archivo: e.target.value })}
                placeholder="logo_abc.dst"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Cliente</label>
              <select
                value={form.clienteId}
                onChange={(e) => setForm({ ...form, clienteId: e.target.value })}
                className={inputClass}
              >
                <option value="">Sin asignar</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Puntadas</label>
              <input
                type="number"
                min={0}
                value={form.puntadas}
                onChange={(e) => setForm({ ...form, puntadas: Number(e.target.value) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Colores</label>
              <input
                type="number"
                min={1}
                max={20}
                value={form.colores}
                onChange={(e) => setForm({ ...form, colores: Number(e.target.value) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Tamaño (cm)</label>
              <div className="flex gap-1">
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.ancho}
                  onChange={(e) => setForm({ ...form, ancho: Number(e.target.value) })}
                  placeholder="An"
                  className={inputClass}
                />
                <span className="self-center text-neutral-400">x</span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.alto}
                  onChange={(e) => setForm({ ...form, alto: Number(e.target.value) })}
                  placeholder="Al"
                  className={inputClass}
                />
              </div>
            </div>
          </div>
          <div>
            <label className={labelClass}>Tags</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Agregar tag..."
                className={inputClass}
              />
              <button
                type="button"
                onClick={addTag}
                className="px-3 py-2 rounded-xl text-xs font-bold border border-neutral-200 text-neutral-500 hover:border-[#c72a09] shrink-0"
              >
                +
              </button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {form.tags.map((t) => (
                  <button
                    key={t}
                    onClick={() => removeTag(t)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-neutral-100 text-neutral-600 hover:bg-red-100 hover:text-red-600 transition-colors"
                  >
                    {t} ×
                  </button>
                ))}
              </div>
            )}
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
