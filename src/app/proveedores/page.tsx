'use client';

import { useEffect, useState, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { getProveedores, addProveedor, updateProveedor, deleteProveedor, getEgresos } from '@/lib/store';
import { Proveedor, Egreso } from '@/lib/types';
import { formatCurrency } from '@/lib/helpers';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import EmptyState from '@/components/EmptyState';

const tiposProveedor = ['Insumos de bordado', 'Telas y textiles', 'Maquinaria', 'Software/Digital', 'Publicidad e impresion', 'Servicios generales', 'Otro'];

const inputClass = "w-full border border-neutral-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#c72a09] focus:ring-1 focus:ring-[#c72a09]/20 transition-colors";
const labelClass = "block text-[10px] font-bold tracking-[0.08em] text-neutral-400 uppercase mb-1.5";
const btnPrimary = "bg-[#c72a09] text-white px-5 py-2.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase hover:bg-[#a82207] transition-colors";
const btnSecondary = "px-4 py-2.5 text-xs font-semibold text-neutral-400 hover:text-neutral-600 transition-colors";

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

  useEffect(() => { reload(); setMounted(true); }, [reload]);

  if (!mounted) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" /></div>;

  const openNew = () => { setEditingId(null); setForm(emptyProveedor()); setModalOpen(true); };
  const openEdit = (p: Proveedor) => { setEditingId(p.id); setForm({ ...p }); setModalOpen(true); };
  const handleSave = () => {
    if (!form.nombre) return;
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
              <div key={p.id} className="bg-white rounded-2xl border border-neutral-100 p-6 hover:border-neutral-300 transition-all group">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-neutral-100 text-neutral-500 flex items-center justify-center mb-3">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" /></svg>
                    </div>
                    <h3 className="font-bold text-[#0a0a0a] group-hover:text-[#c72a09] transition-colors">{p.nombre}</h3>
                    {p.tipo && <span className="inline-block mt-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-bold tracking-wide bg-neutral-100 text-neutral-500 uppercase">{p.tipo}</span>}
                    {p.contacto && <p className="text-xs text-neutral-400 mt-1.5">{p.contacto}</p>}
                    {p.telefono && <p className="text-xs text-neutral-400">{p.telefono}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-[#0a0a0a]">{formatCurrency(total)}</p>
                    <p className="text-[10px] text-neutral-300 uppercase tracking-wide font-bold mt-0.5">{count} compras</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-4 pt-4 border-t border-neutral-50">
                  <button onClick={() => openEdit(p)} className="text-neutral-300 hover:text-[#c72a09] text-xs font-semibold transition-colors">Editar</button>
                  <button onClick={() => handleDelete(p.id)} className="text-neutral-200 hover:text-red-500 text-xs font-semibold transition-colors">Eliminar</button>
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
          <div><label className={labelClass}>Notas</label><textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={2} className={inputClass} /></div>
          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
            <button onClick={() => setModalOpen(false)} className={btnSecondary}>Cancelar</button>
            <button onClick={handleSave} className={btnPrimary}>{editingId ? 'Guardar' : 'Agregar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
