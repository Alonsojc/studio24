'use client';

import { useEffect, useState, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { getProveedores, addProveedor, updateProveedor, deleteProveedor, getEgresos } from '@/lib/store';
import { Proveedor, Egreso } from '@/lib/types';
import { formatCurrency, validateProveedor } from '@/lib/helpers';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import EmptyState from '@/components/EmptyState';
import ActionMenu from '@/components/ActionMenu';

const tiposProveedor = ['Insumos de bordado', 'Telas y textiles', 'Maquinaria', 'Software/Digital', 'Publicidad e impresion', 'Servicios generales', 'Otro'];

const inputClass = "w-full border border-neutral-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#c72a09] focus:ring-1 focus:ring-[#c72a09]/20 transition-colors";
const labelClass = "block text-[10px] font-bold tracking-[0.08em] text-neutral-400 uppercase mb-1.5";
const btnPrimary = "bg-[#c72a09] text-white px-5 py-2.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase hover:bg-[#a82207] transition-colors";
const btnSecondary = "px-4 py-2.5 text-xs font-semibold text-neutral-400 hover:text-neutral-600 transition-colors";

function emptyProveedor(): Omit<Proveedor, 'id' | 'createdAt'> {
  return { nombre: '', contacto: '', telefono: '', email: '', tipo: '', logo: '', notas: '' };
}

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyProveedor());
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [mounted, setMounted] = useState(false);

  const reload = useCallback(() => {
    setProveedores(getProveedores().sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setEgresos(getEgresos());
  }, []);

  useEffect(() => { reload(); setMounted(true); }, [reload]);

  if (!mounted) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" /></div>;

  const openNew = () => { setEditingId(null); setForm(emptyProveedor()); setFormError(null); setModalOpen(true); };
  const openEdit = (p: Proveedor) => { setEditingId(p.id); setForm({ ...p }); setFormError(null); setModalOpen(true); };
  const handleSave = () => {
    const error = validateProveedor(form);
    if (error) { setFormError(error); return; }
    setFormError(null);
    const data: Proveedor = { ...(form as Proveedor), id: editingId || uuid(), createdAt: editingId ? (form as Proveedor).createdAt : new Date().toISOString() };
    editingId ? updateProveedor(data) : addProveedor(data);
    setModalOpen(false); reload();
  };
  const handleDelete = (id: string) => { if (confirm('Eliminar proveedor?')) { deleteProveedor(id); reload(); } };

  const proveedorEgresos = (id: string) => egresos.filter((e) => e.proveedorId === id);
  const proveedorTotal = (id: string) => proveedorEgresos(id).reduce((s, e) => s + e.montoTotal, 0);

  const filtered = proveedores.filter((p) =>
    p.nombre.toLowerCase().includes(search.toLowerCase()) || p.tipo.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader title="Proveedores" description={`${proveedores.length} proveedores registrados`} action={<button onClick={openNew} className={btnPrimary}>+ Nuevo Proveedor</button>} />

      <div className="mb-8">
        <div className="relative max-w-md">
          <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o tipo..." className="w-full border border-neutral-200 rounded-xl pl-10 pr-4 py-2.5 text-sm bg-white focus:outline-none focus:border-[#c72a09]" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Sin proveedores" description="Registra tus proveedores para asociarlos a tus gastos" action={<button onClick={openNew} className="text-[#c72a09] font-bold text-xs uppercase tracking-wide hover:underline">+ Agregar proveedor</button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const total = proveedorTotal(p.id);
            const count = proveedorEgresos(p.id).length;
            return (
              <div key={p.id} className="bg-white rounded-2xl border border-neutral-100 p-6 hover:border-neutral-300 transition-all group relative">
                <div className="absolute top-4 right-4">
                  <ActionMenu items={[{ label: 'Editar', onClick: () => openEdit(p) }, { label: 'Eliminar', onClick: () => handleDelete(p.id), danger: true }]} />
                </div>
                {p.logo ? (
                  <img src={p.logo} alt={p.nombre} className="w-10 h-10 rounded-xl object-cover mb-3" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-neutral-100 text-neutral-500 flex items-center justify-center text-sm font-black mb-3">
                    {p.nombre.charAt(0).toUpperCase()}
                  </div>
                )}
                <h3 className="font-bold text-[#0a0a0a] group-hover:text-[#c72a09] transition-colors">{p.nombre}</h3>
                {p.tipo && <span className="inline-block mt-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-bold tracking-wide bg-neutral-100 text-neutral-500 uppercase">{p.tipo}</span>}
                {p.contacto && <p className="text-xs text-neutral-400 mt-1.5">{p.contacto}</p>}
                {p.telefono && <p className="text-xs text-neutral-400">{p.telefono}</p>}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-50">
                  <p className="text-[10px] text-neutral-300 uppercase tracking-wide font-bold">{count} compras</p>
                  <p className="text-sm font-black text-[#0a0a0a]">{formatCurrency(total)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Editar Proveedor' : 'Nuevo Proveedor'}>
        <div className="space-y-4">
          <div><label className={labelClass}>Nombre *</label><input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre del proveedor" className={inputClass} /></div>
          <div><label className={labelClass}>Tipo</label><select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className={inputClass}><option value="">Seleccionar...</option>{tiposProveedor.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Contacto</label><input type="text" value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} placeholder="Persona de contacto" className={inputClass} /></div>
            <div><label className={labelClass}>Telefono</label><input type="tel" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className={inputClass} /></div>
          </div>
          <div><label className={labelClass}>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} /></div>
          <div><label className={labelClass}>Logo / Imagen (URL)</label><input type="url" value={form.logo} onChange={(e) => setForm({ ...form, logo: e.target.value })} placeholder="https://ejemplo.com/logo.png" className={inputClass} />{form.logo && <img src={form.logo} alt="Preview" className="w-10 h-10 rounded-lg object-cover mt-2" />}</div>
          <div><label className={labelClass}>Notas</label><textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={2} className={inputClass} /></div>
          {formError && <p className="text-xs text-red-500 font-semibold bg-red-50 rounded-xl px-3.5 py-2.5">{formError}</p>}
          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
            <button onClick={() => setModalOpen(false)} className={btnSecondary}>Cancelar</button>
            <button onClick={handleSave} className={btnPrimary}>{editingId ? 'Guardar' : 'Agregar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
