'use client';

import { useEffect, useState, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { getIngresos, addIngreso, updateIngreso, deleteIngreso, getClientes } from '@/lib/store';
import { Ingreso, Cliente, ConceptoIngreso, FormaPago } from '@/lib/types';
import { formatCurrency, formatDate, formaPagoLabel, conceptoLabel, todayString, calcIVA } from '@/lib/helpers';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import EmptyState from '@/components/EmptyState';
import ActionMenu from '@/components/ActionMenu';
import { downloadCSV } from '@/lib/csv';

const conceptos: ConceptoIngreso[] = ['solo_bordado', 'bordado_y_prenda', 'diseno', 'reparacion', 'otro'];
const formasPago: FormaPago[] = ['efectivo', 'tarjeta', 'transferencia', 'otro'];

const inputClass = "w-full border border-neutral-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#c72a09] focus:ring-1 focus:ring-[#c72a09]/20 transition-colors";
const labelClass = "block text-[10px] font-bold tracking-[0.08em] text-neutral-400 uppercase mb-1.5";
const btnPrimary = "bg-[#c72a09] text-white px-5 py-2.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase hover:bg-[#a82207] transition-colors";
const btnSecondary = "px-4 py-2.5 text-xs font-semibold text-neutral-400 hover:text-neutral-600 transition-colors";

function emptyIngreso(): Omit<Ingreso, 'id' | 'createdAt'> {
  return { fecha: todayString(), clienteId: '', descripcion: '', concepto: 'solo_bordado', monto: 0, iva: 0, montoTotal: 0, formaPago: 'efectivo', factura: false, numeroFactura: '', notas: '' };
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

  useEffect(() => { reload(); setMounted(true); }, [reload]);

  if (!mounted) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" /></div>;

  const openNew = () => { setEditingId(null); setForm(emptyIngreso()); setModalOpen(true); };
  const openEdit = (i: Ingreso) => { setEditingId(i.id); setForm({ ...i }); setModalOpen(true); };
  const handleSave = () => {
    if (!form.descripcion || form.monto <= 0) return;
    const iva = form.factura ? calcIVA(form.monto) : 0;
    const data: Ingreso = { ...(form as Ingreso), id: editingId || uuid(), iva, montoTotal: form.monto + iva, createdAt: editingId ? (form as Ingreso).createdAt : new Date().toISOString() };
    editingId ? updateIngreso(data) : addIngreso(data);
    setModalOpen(false); reload();
  };
  const handleDelete = (id: string) => { if (confirm('Eliminar este ingreso?')) { deleteIngreso(id); reload(); } };

  const clienteName = (id: string) => clientes.find((c) => c.id === id)?.nombre || '';
  const months = Array.from(new Set(ingresos.map((i) => i.fecha.substring(0, 7)))).sort().reverse();
  const filtered = ingresos.filter((i) => {
    if (filterConcepto !== 'all' && i.concepto !== filterConcepto) return false;
    if (filterMonth !== 'all' && !i.fecha.startsWith(filterMonth)) return false;
    return true;
  });
  const totalFiltered = filtered.reduce((s, i) => s + i.montoTotal, 0);

  return (
    <div>
      <PageHeader title="Ingresos" description="Control de ventas y servicios" action={<button onClick={openNew} className={btnPrimary}>+ Nuevo Ingreso</button>} />

      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <select value={filterConcepto} onChange={(e) => setFilterConcepto(e.target.value)} className="border border-neutral-200 rounded-xl px-3.5 py-2.5 text-xs font-medium bg-white focus:outline-none focus:border-[#c72a09]">
          <option value="all">Todos los conceptos</option>
          {conceptos.map((c) => <option key={c} value={c}>{conceptoLabel(c)}</option>)}
        </select>
        <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="border border-neutral-200 rounded-xl px-3.5 py-2.5 text-xs font-medium bg-white focus:outline-none focus:border-[#c72a09]">
          <option value="all">Todos los meses</option>
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-neutral-400 font-medium">Total: <span className="font-black text-green-600 text-sm">{formatCurrency(totalFiltered)}</span> &middot; {filtered.length}</span>
          {filtered.length > 0 && (
            <button onClick={() => downloadCSV(`ingresos_${new Date().toISOString().slice(0,10)}`, ['Fecha','Descripcion','Cliente','Concepto','Monto','IVA','Total','Forma de Pago','Factura','No. Factura'], filtered.map((i) => [i.fecha, i.descripcion, clienteName(i.clienteId), conceptoLabel(i.concepto), String(i.monto), String(i.iva), String(i.montoTotal), formaPagoLabel(i.formaPago), i.factura ? 'Si' : 'No', i.numeroFactura]))} className="text-[10px] font-bold tracking-[0.05em] text-neutral-400 hover:text-[#c72a09] uppercase transition-colors flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              CSV
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Sin ingresos" description="Registra tu primera venta o servicio" action={<button onClick={openNew} className="text-[#c72a09] font-bold text-xs uppercase tracking-wide hover:underline">+ Agregar ingreso</button>} />
      ) : (
        <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100">
                <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Fecha</th>
                <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Descripcion</th>
                <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Cliente</th>
                <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Concepto</th>
                <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Pago</th>
                <th className="px-5 py-4 text-right text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Monto</th>
                <th className="px-5 py-4 text-center text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Fact.</th>
                <th className="px-5 py-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors">
                  <td className="px-5 py-4 text-neutral-400 text-xs">{formatDate(i.fecha)}</td>
                  <td className="px-5 py-4 font-semibold text-[#0a0a0a]">{i.descripcion}</td>
                  <td className="px-5 py-4 text-neutral-400 text-xs">{clienteName(i.clienteId) || '—'}</td>
                  <td className="px-5 py-4"><span className="px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide bg-green-50 text-green-700 uppercase">{conceptoLabel(i.concepto)}</span></td>
                  <td className="px-5 py-4 text-neutral-400 text-xs">{formaPagoLabel(i.formaPago)}</td>
                  <td className="px-5 py-4 text-right">
                    <span className="font-bold text-green-600">{formatCurrency(i.montoTotal)}</span>
                    {i.iva > 0 && <span className="block text-[10px] text-neutral-300">IVA: {formatCurrency(i.iva)}</span>}
                  </td>
                  <td className="px-5 py-4 text-center">
                    {i.factura ? <span className="w-5 h-5 rounded-full bg-[#c72a09] text-white text-[9px] font-bold inline-flex items-center justify-center">F</span> : <span className="text-neutral-200">—</span>}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end">
                      <ActionMenu items={[{ label: 'Editar', onClick: () => openEdit(i) }, { label: 'Eliminar', onClick: () => handleDelete(i.id), danger: true }]} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Editar Ingreso' : 'Nuevo Ingreso'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Fecha</label><input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Concepto</label><select value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value as ConceptoIngreso })} className={inputClass}>{conceptos.map((c) => <option key={c} value={c}>{conceptoLabel(c)}</option>)}</select></div>
          </div>
          <div><label className={labelClass}>Descripcion</label><input type="text" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Ej: Bordado de logo en 10 playeras" className={inputClass} /></div>
          <div><label className={labelClass}>Cliente</label><select value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })} className={inputClass}><option value="">Sin cliente</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
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
          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
            <button onClick={() => setModalOpen(false)} className={btnSecondary}>Cancelar</button>
            <button onClick={handleSave} className={btnPrimary}>{editingId ? 'Guardar' : 'Registrar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
