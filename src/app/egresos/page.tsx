'use client';

import { useEffect, useState, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import {
  getEgresos, addEgreso, updateEgreso, deleteEgreso,
  getProveedores,
  getEgresosRecurrentes, addEgresoRecurrente, updateEgresoRecurrente, deleteEgresoRecurrente,
} from '@/lib/store';
import { Egreso, Proveedor, EgresoRecurrente, CategoriaEgreso, FormaPago } from '@/lib/types';
import { formatCurrency, formatDate, formaPagoLabel, categoriaLabel, todayString, calcIVA, validateEgreso, validateEgresoRecurrente } from '@/lib/helpers';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import EmptyState from '@/components/EmptyState';
import ActionMenu from '@/components/ActionMenu';
import { downloadCSV } from '@/lib/csv';
import { inputClass, labelClass, btnPrimary, btnSecondary } from '@/lib/styles';

const categorias: CategoriaEgreso[] = ['programas', 'mercancia', 'insumos', 'servicios', 'maquinaria', 'publicidad', 'renta', 'otro'];
const formasPago: FormaPago[] = ['efectivo', 'tarjeta', 'transferencia', 'otro'];
const subcategoriasInsumo = ['Telas', 'Hilos', 'Agujas', 'Repuestos de máquina', 'Estabilizadores', 'Otro'];
const subcategoriasProgramas = ['Photoshop', 'Canva', 'Software de automatización', 'Wilcom', 'Otro'];

function emptyEgreso(): Omit<Egreso, 'id' | 'createdAt'> {
  return { fecha: todayString(), descripcion: '', categoria: 'insumos', subcategoria: '', proveedorId: '', monto: 0, iva: 0, montoTotal: 0, formaPago: 'efectivo', factura: false, numeroFactura: '', notas: '' };
}

function emptyRecurrente(): Omit<EgresoRecurrente, 'id' | 'createdAt'> {
  return { descripcion: '', categoria: 'programas', subcategoria: '', proveedorId: '', monto: 0, formaPago: 'tarjeta', factura: false, diaDelMes: 1, activo: true };
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
  const [formError, setFormError] = useState<string | null>(null);
  const [recFormError, setRecFormError] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [mounted, setMounted] = useState(false);

  const reload = useCallback(() => {
    setEgresos(getEgresos().sort((a, b) => b.fecha.localeCompare(a.fecha)));
    setProveedores(getProveedores());
    setRecurrentes(getEgresosRecurrentes());
  }, []);

  useEffect(() => { reload(); setMounted(true); }, [reload]);

  if (!mounted) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" /></div>;

  const openNew = () => { setEditingId(null); setForm(emptyEgreso()); setFormError(null); setModalOpen(true); };
  const openEdit = (e: Egreso) => { setEditingId(e.id); setForm({ ...e }); setFormError(null); setModalOpen(true); };
  const handleSave = () => {
    const error = validateEgreso(form);
    if (error) { setFormError(error); return; }
    setFormError(null);
    const iva = form.factura ? calcIVA(form.monto) : 0;
    const data: Egreso = { ...(form as Egreso), id: editingId || uuid(), iva, montoTotal: form.monto + iva, createdAt: editingId ? (form as Egreso).createdAt : new Date().toISOString() };
    editingId ? updateEgreso(data) : addEgreso(data);
    setModalOpen(false); reload();
  };
  const handleDelete = (id: string) => { if (confirm('Eliminar este egreso?')) { deleteEgreso(id); reload(); } };

  const openNewRec = () => { setEditingRecId(null); setRecForm(emptyRecurrente()); setRecFormError(null); setRecModalOpen(true); };
  const openEditRec = (r: EgresoRecurrente) => { setEditingRecId(r.id); setRecForm({ ...r }); setRecFormError(null); setRecModalOpen(true); };
  const handleSaveRec = () => {
    const error = validateEgresoRecurrente(recForm);
    if (error) { setRecFormError(error); return; }
    setRecFormError(null);
    const data: EgresoRecurrente = { ...(recForm as EgresoRecurrente), id: editingRecId || uuid(), createdAt: editingRecId ? (recForm as EgresoRecurrente).createdAt : new Date().toISOString() };
    editingRecId ? updateEgresoRecurrente(data) : addEgresoRecurrente(data);
    setRecModalOpen(false); reload();
  };
  const handleDeleteRec = (id: string) => { if (confirm('Eliminar recurrente?')) { deleteEgresoRecurrente(id); reload(); } };
  const toggleRecActivo = (r: EgresoRecurrente) => { updateEgresoRecurrente({ ...r, activo: !r.activo }); reload(); };

  const proveedorName = (id: string) => proveedores.find((p) => p.id === id)?.nombre || '';
  const months = Array.from(new Set(egresos.map((e) => e.fecha.substring(0, 7)))).sort().reverse();
  const filtered = egresos.filter((e) => {
    if (filterCat !== 'all' && e.categoria !== filterCat) return false;
    if (filterMonth !== 'all' && !e.fecha.startsWith(filterMonth)) return false;
    return true;
  });
  const totalFiltered = filtered.reduce((s, e) => s + e.montoTotal, 0);
  const subcategorias = form.categoria === 'insumos' ? subcategoriasInsumo : form.categoria === 'programas' ? subcategoriasProgramas : [];
  const recSubcategorias = recForm.categoria === 'insumos' ? subcategoriasInsumo : recForm.categoria === 'programas' ? subcategoriasProgramas : [];
  const totalRecMensual = recurrentes.filter((r) => r.activo).reduce((s, r) => s + r.monto + (r.factura ? calcIVA(r.monto) : 0), 0);

  return (
    <div>
      <PageHeader
        title="Egresos"
        description="Control de gastos del negocio"
        action={
          <div className="flex gap-2">
            <button onClick={() => setRecPanelOpen(!recPanelOpen)} className={`px-4 py-2.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase transition-colors border ${recPanelOpen ? 'bg-[#0a0a0a] text-white border-[#0a0a0a]' : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-400'}`}>
              Recurrentes ({recurrentes.filter((r) => r.activo).length})
            </button>
            <button onClick={openNew} className={btnPrimary}>+ Nuevo Egreso</button>
          </div>
        }
      />

      {/* Recurring Panel */}
      {recPanelOpen && (
        <div className="bg-[#0a0a0a] rounded-2xl p-6 mb-8">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-[11px] font-bold tracking-[0.1em] text-white/40 uppercase">Egresos Recurrentes</h3>
              <p className="text-xs text-white/25 mt-1">Total mensual: <span className="text-[#c72a09] font-bold">{formatCurrency(totalRecMensual)}</span></p>
            </div>
            <button onClick={openNewRec} className="bg-[#c72a09] text-white px-3.5 py-2 rounded-lg text-[10px] font-bold tracking-[0.08em] uppercase hover:bg-[#a82207]">+ Nuevo</button>
          </div>
          {recurrentes.length === 0 ? (
            <p className="text-sm text-white/20 text-center py-6">Agrega gastos fijos como renta, suscripciones, etc.</p>
          ) : (
            <div className="space-y-2">
              {recurrentes.map((r) => (
                <div key={r.id} className={`flex items-center justify-between py-3 px-4 rounded-xl transition-all ${r.activo ? 'bg-white/[0.05]' : 'bg-white/[0.02] opacity-40'}`}>
                  <div className="flex items-center gap-3">
                    <button onClick={() => toggleRecActivo(r)} className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${r.activo ? 'bg-[#c72a09]' : 'bg-white/10'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow ${r.activo ? 'left-4' : 'left-0.5'}`} />
                    </button>
                    <div>
                      <p className="text-sm font-semibold text-white">{r.descripcion}</p>
                      <p className="text-xs text-white/30 mt-0.5">{categoriaLabel(r.categoria)} &middot; Dia {r.diaDelMes} &middot; {formaPagoLabel(r.formaPago)}{r.factura && <span className="text-[#c72a09]"> &middot; IVA</span>}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-white">{formatCurrency(r.monto + (r.factura ? calcIVA(r.monto) : 0))}<span className="text-white/20 text-xs font-normal">/mes</span></span>
                    <div className="[&_button]:text-white/30 [&_button:hover]:text-white [&_button:hover]:bg-white/10 [&>div>div]:bg-[#1a1a1a] [&>div>div]:border-white/10 [&>div>div_button]:text-white/60 [&>div>div_button:hover]:bg-white/10">
                      <ActionMenu items={[{ label: 'Editar', onClick: () => openEditRec(r) }, { label: 'Eliminar', onClick: () => handleDeleteRec(r.id), danger: true }]} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="border border-neutral-200 rounded-xl px-3.5 py-2.5 text-xs font-medium bg-white focus:outline-none focus:border-[#c72a09]">
          <option value="all">Todas las categorias</option>
          {categorias.map((c) => <option key={c} value={c}>{categoriaLabel(c)}</option>)}
        </select>
        <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="border border-neutral-200 rounded-xl px-3.5 py-2.5 text-xs font-medium bg-white focus:outline-none focus:border-[#c72a09]">
          <option value="all">Todos los meses</option>
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-neutral-400 font-medium">Total: <span className="font-black text-[#c72a09] text-sm">{formatCurrency(totalFiltered)}</span> &middot; {filtered.length}</span>
          {filtered.length > 0 && (
            <button onClick={() => downloadCSV(`egresos_${new Date().toISOString().slice(0,10)}`, ['Fecha','Descripción','Categoria','Subcategoria','Proveedor','Monto','IVA','Total','Forma de Pago','Factura','No. Factura'], filtered.map((e) => [e.fecha, e.descripcion, categoriaLabel(e.categoria), e.subcategoria, proveedorName(e.proveedorId), String(e.monto), String(e.iva), String(e.montoTotal), formaPagoLabel(e.formaPago), e.factura ? 'Si' : 'No', e.numeroFactura]))} className="text-[10px] font-bold tracking-[0.05em] text-neutral-400 hover:text-[#c72a09] uppercase transition-colors flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              CSV
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState title="Sin egresos" description="Registra tu primer gasto para empezar" action={<button onClick={openNew} className="text-[#c72a09] font-bold text-xs uppercase tracking-wide hover:underline">+ Agregar egreso</button>} />
      ) : (
        <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100">
                <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Fecha</th>
                <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Descripción</th>
                <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Categoria</th>
                <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Proveedor</th>
                <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Pago</th>
                <th className="px-5 py-4 text-right text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Monto</th>
                <th className="px-5 py-4 text-center text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Fact.</th>
                <th className="px-5 py-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors">
                  <td className="px-5 py-4 text-neutral-400 text-xs">{formatDate(e.fecha)}</td>
                  <td className="px-5 py-4">
                    <span className="font-semibold text-[#0a0a0a]">{e.descripcion}</span>
                    {e.subcategoria && <span className="block text-xs text-neutral-300 mt-0.5">{e.subcategoria}</span>}
                  </td>
                  <td className="px-5 py-4"><span className="px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide bg-neutral-100 text-neutral-500 uppercase">{categoriaLabel(e.categoria)}</span></td>
                  <td className="px-5 py-4 text-neutral-400 text-xs">{proveedorName(e.proveedorId) || '—'}</td>
                  <td className="px-5 py-4 text-neutral-400 text-xs">{formaPagoLabel(e.formaPago)}</td>
                  <td className="px-5 py-4 text-right">
                    <span className="font-bold text-[#0a0a0a]">{formatCurrency(e.montoTotal)}</span>
                    {e.iva > 0 && <span className="block text-[10px] text-neutral-300">IVA: {formatCurrency(e.iva)}</span>}
                  </td>
                  <td className="px-5 py-4 text-center">
                    {e.factura ? <span className="w-5 h-5 rounded-full bg-[#c72a09] text-white text-[9px] font-bold inline-flex items-center justify-center">F</span> : <span className="text-neutral-200">—</span>}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end">
                      <ActionMenu items={[{ label: 'Editar', onClick: () => openEdit(e) }, { label: 'Eliminar', onClick: () => handleDelete(e.id), danger: true }]} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Egreso Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Editar Egreso' : 'Nuevo Egreso'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Fecha</label><input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Categoria</label><select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value as CategoriaEgreso, subcategoria: '' })} className={inputClass}>{categorias.map((c) => <option key={c} value={c}>{categoriaLabel(c)}</option>)}</select></div>
          </div>
          {subcategorias.length > 0 && <div><label className={labelClass}>Subcategoria</label><select value={form.subcategoria} onChange={(e) => setForm({ ...form, subcategoria: e.target.value })} className={inputClass}><option value="">Seleccionar...</option>{subcategorias.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>}
          <div><label className={labelClass}>Descripción</label><input type="text" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Ej: Compra de hilos DMC" className={inputClass} /></div>
          <div><label className={labelClass}>Proveedor</label><select value={form.proveedorId} onChange={(e) => setForm({ ...form, proveedorId: e.target.value })} className={inputClass}><option value="">Sin proveedor</option>{proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Monto (sin IVA)</label><input type="number" step="0.01" min="0" value={form.monto || ''} onChange={(e) => setForm({ ...form, monto: parseFloat(e.target.value) || 0 })} className={inputClass} /></div>
            <div><label className={labelClass}>Forma de Pago</label><select value={form.formaPago} onChange={(e) => setForm({ ...form, formaPago: e.target.value as FormaPago })} className={inputClass}>{formasPago.map((fp) => <option key={fp} value={fp}>{formaPagoLabel(fp)}</option>)}</select></div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2.5 cursor-pointer"><input type="checkbox" checked={form.factura} onChange={(e) => setForm({ ...form, factura: e.target.checked })} className="w-4 h-4 accent-[#c72a09] rounded" /><span className="text-sm text-neutral-600">Factura (IVA 16%)</span></label>
            {form.factura && form.monto > 0 && <span className="text-xs text-neutral-400">IVA: {formatCurrency(calcIVA(form.monto))} &middot; Total: {formatCurrency(form.monto + calcIVA(form.monto))}</span>}
          </div>
          {form.factura && <div><label className={labelClass}>No. Factura</label><input type="text" value={form.numeroFactura} onChange={(e) => setForm({ ...form, numeroFactura: e.target.value })} className={inputClass} /></div>}
          <div><label className={labelClass}>Notas</label><textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={2} className={inputClass} /></div>
          {formError && <p className="text-xs text-red-500 font-semibold bg-red-50 rounded-xl px-3.5 py-2.5">{formError}</p>}
          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
            <button onClick={() => setModalOpen(false)} className={btnSecondary}>Cancelar</button>
            <button onClick={handleSave} className={btnPrimary}>{editingId ? 'Guardar' : 'Registrar'}</button>
          </div>
        </div>
      </Modal>

      {/* Recurrente Modal */}
      <Modal open={recModalOpen} onClose={() => setRecModalOpen(false)} title={editingRecId ? 'Editar Recurrente' : 'Nuevo Recurrente'}>
        <div className="space-y-4">
          <div className="bg-neutral-50 rounded-xl p-3.5 text-xs text-neutral-500">Se genera automaticamente cada mes en la fecha indicada.</div>
          <div><label className={labelClass}>Descripción</label><input type="text" value={recForm.descripcion} onChange={(e) => setRecForm({ ...recForm, descripcion: e.target.value })} placeholder="Ej: Suscripción Canva Pro" className={inputClass} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Categoria</label><select value={recForm.categoria} onChange={(e) => setRecForm({ ...recForm, categoria: e.target.value as CategoriaEgreso, subcategoria: '' })} className={inputClass}>{categorias.map((c) => <option key={c} value={c}>{categoriaLabel(c)}</option>)}</select></div>
            <div><label className={labelClass}>Dia del mes</label><select value={recForm.diaDelMes} onChange={(e) => setRecForm({ ...recForm, diaDelMes: Number(e.target.value) })} className={inputClass}>{Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Dia {d}</option>)}</select></div>
          </div>
          {recSubcategorias.length > 0 && <div><label className={labelClass}>Subcategoria</label><select value={recForm.subcategoria} onChange={(e) => setRecForm({ ...recForm, subcategoria: e.target.value })} className={inputClass}><option value="">Seleccionar...</option>{recSubcategorias.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>}
          <div><label className={labelClass}>Proveedor</label><select value={recForm.proveedorId} onChange={(e) => setRecForm({ ...recForm, proveedorId: e.target.value })} className={inputClass}><option value="">Sin proveedor</option>{proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Monto mensual (sin IVA)</label><input type="number" step="0.01" min="0" value={recForm.monto || ''} onChange={(e) => setRecForm({ ...recForm, monto: parseFloat(e.target.value) || 0 })} className={inputClass} /></div>
            <div><label className={labelClass}>Forma de Pago</label><select value={recForm.formaPago} onChange={(e) => setRecForm({ ...recForm, formaPago: e.target.value as FormaPago })} className={inputClass}>{formasPago.map((fp) => <option key={fp} value={fp}>{formaPagoLabel(fp)}</option>)}</select></div>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer"><input type="checkbox" checked={recForm.factura} onChange={(e) => setRecForm({ ...recForm, factura: e.target.checked })} className="w-4 h-4 accent-[#c72a09] rounded" /><span className="text-sm text-neutral-600">Factura (IVA 16%)</span>{recForm.factura && recForm.monto > 0 && <span className="text-xs text-neutral-400 ml-2">Total: {formatCurrency(recForm.monto + calcIVA(recForm.monto))}</span>}</label>
          {recFormError && <p className="text-xs text-red-500 font-semibold bg-red-50 rounded-xl px-3.5 py-2.5">{recFormError}</p>}
          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
            <button onClick={() => setRecModalOpen(false)} className={btnSecondary}>Cancelar</button>
            <button onClick={handleSaveRec} className={btnPrimary}>{editingRecId ? 'Guardar' : 'Crear'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
