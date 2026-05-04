'use client';

import { useState } from 'react';
import { v4 as uuid } from 'uuid';
import { getIngresos, getClientes } from '@/lib/store';
import { cloudGetIngresosByYear, cloudGetClientes } from '@/lib/store-cloud';
import { addIngreso, updateIngreso, deleteIngreso, getNextFolioAsync } from '@/lib/store-sync';
import { useCloudStore } from '@/lib/useCloudStore';
import { Ingreso, ConceptoIngreso, FormaPago } from '@/lib/types';
import {
  formatCurrency,
  formatDate,
  formaPagoLabel,
  conceptoLabel,
  todayString,
  calcIVA,
  validateIngreso,
} from '@/lib/helpers';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import EmptyState from '@/components/EmptyState';
import ActionMenu from '@/components/ActionMenu';
import { downloadCSV } from '@/lib/csv';
import { inputClass, labelClass, btnPrimary, btnSecondary } from '@/lib/styles';
import MonthBar from '@/components/MonthBar';
import Pagination, { PAGE_SIZE } from '@/components/Pagination';
import { deleteFacturaFiles, openFacturaFile } from '@/lib/cfdi-storage';

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
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState<string>(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
  );
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const { data: ingresosRaw, reload } = useCloudStore(
    getIngresos,
    () => cloudGetIngresosByYear(filterYear),
    'bordados_ingresos',
    [filterYear],
  );
  const { data: clientes } = useCloudStore(getClientes, cloudGetClientes, 'bordados_clientes');
  const ingresos = [...ingresosRaw].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyIngreso());
  const [formSnapshot, setFormSnapshot] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [filterConcepto, setFilterConcepto] = useState<string>('all');
  const [page, setPage] = useState(0);

  const openNew = () => {
    setEditingId(null);
    const initial = emptyIngreso();
    setForm(initial);
    setFormSnapshot(JSON.stringify(initial));
    setFormError(null);
    setModalOpen(true);
  };
  const openEdit = (i: Ingreso) => {
    setEditingId(i.id);
    setForm({ ...i });
    setFormSnapshot(JSON.stringify(i));
    setFormError(null);
    setModalOpen(true);
  };
  const handleSave = async () => {
    const nextForm = {
      ...form,
      numeroFactura: form.factura && !form.numeroFactura ? await getNextFolioAsync('ING') : form.numeroFactura,
    };
    const error = validateIngreso(nextForm);
    if (error) {
      setFormError(error);
      return;
    }
    setFormError(null);
    const iva = nextForm.factura ? calcIVA(nextForm.monto) : 0;
    const data: Ingreso = {
      ...(nextForm as Ingreso),
      id: editingId || uuid(),
      iva,
      montoTotal: nextForm.monto + iva,
      createdAt: editingId ? (form as Ingreso).createdAt : new Date().toISOString(),
    };
    if (editingId) updateIngreso(data);
    else addIngreso(data);
    setModalOpen(false);
    reload();
  };
  const handleDelete = (id: string) => {
    const ingreso = ingresos.find((i) => i.id === id);
    if (ingreso?.factura) {
      if (
        !confirm(
          `Este ingreso tiene factura (${ingreso.numeroFactura || 'sin número'}). Eliminarlo puede afectar tu contabilidad fiscal. ¿Continuar?`,
        )
      )
        return;
    } else {
      if (!confirm('¿Eliminar este ingreso?')) return;
    }
    deleteIngreso(id);
    reload();
  };
  const handleReplaceFactura = async (ingreso: Ingreso) => {
    const hasCfdi = Boolean(ingreso.uuidCFDI || ingreso.xmlUrl || ingreso.pdfUrl || ingreso.numeroFactura);
    if (!hasCfdi) {
      alert('Este ingreso no tiene CFDI o archivos de factura guardados.');
      return;
    }
    if (
      !confirm(
        'Se borrarán el PDF/XML guardados y se limpiará el UUID para que puedas subir la factura correcta desde Facturas. El ingreso se conserva. ¿Continuar?',
      )
    )
      return;

    try {
      await deleteFacturaFiles({ pdfUrl: ingreso.pdfUrl, xmlUrl: ingreso.xmlUrl });
      updateIngreso({
        ...ingreso,
        numeroFactura: '',
        uuidCFDI: '',
        xmlUrl: '',
        pdfUrl: '',
      });
      reload();
      alert('Listo. Ahora sube el XML/PDF nuevo desde Facturas para vincularlo otra vez.');
    } catch (err) {
      alert(`No se pudo borrar la factura: ${err instanceof Error ? err.message : 'error desconocido'}`);
    }
  };

  const clienteName = (id: string) => clientes.find((c) => c.id === id)?.nombre || '';
  const years = Array.from(
    new Set(ingresos.map((i) => parseInt(i.fecha.substring(0, 4), 10)).concat(new Date().getFullYear())),
  )
    .sort()
    .reverse();
  const filtered = ingresos.filter((i) => {
    if (filterConcepto !== 'all' && i.concepto !== filterConcepto) return false;
    if (filterMonth === 'all') {
      if (!i.fecha.startsWith(String(filterYear) + '-')) return false;
    } else {
      if (!i.fecha.startsWith(filterMonth)) return false;
    }
    return true;
  });
  const totalFiltered = filtered.reduce((s, i) => s + i.montoTotal, 0);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div>
      <PageHeader
        title="Ingresos"
        description="Control de ventas y servicios"
        action={
          <div className="flex gap-2 items-center">
            <select
              value={filterYear}
              onChange={(e) => {
                setFilterYear(Number(e.target.value));
                setFilterMonth('all');
                setPage(0);
              }}
              className="border border-neutral-200 rounded-xl px-3.5 py-2.5 text-xs font-bold bg-white focus:outline-none focus:border-[#c72a09]"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button onClick={openNew} className={btnPrimary}>
              + Nuevo Ingreso
            </button>
          </div>
        }
      />

      <MonthBar
        items={ingresos}
        year={filterYear}
        selectedMonth={filterMonth}
        onSelect={(m: string) => {
          setFilterMonth(m);
          setPage(0);
        }}
        color="green"
      />

      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <select
          value={filterConcepto}
          onChange={(e) => {
            setFilterConcepto(e.target.value);
            setPage(0);
          }}
          className="border border-neutral-200 rounded-xl px-3.5 py-2.5 text-xs font-medium bg-white focus:outline-none focus:border-[#c72a09]"
        >
          <option value="all">Todos los conceptos</option>
          {conceptos.map((c) => (
            <option key={c} value={c}>
              {conceptoLabel(c)}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-neutral-400 font-medium">
            Total: <span className="font-black text-green-600 text-sm">{formatCurrency(totalFiltered)}</span> &middot;{' '}
            {filtered.length}
          </span>
          {filtered.length > 0 && (
            <button
              onClick={() =>
                downloadCSV(
                  `ingresos_${new Date().toISOString().slice(0, 10)}`,
                  [
                    'Fecha',
                    'Descripción',
                    'Cliente',
                    'Concepto',
                    'Monto',
                    'IVA',
                    'Total',
                    'Forma de Pago',
                    'Factura',
                    'No. Factura',
                  ],
                  filtered.map((i) => [
                    i.fecha,
                    i.descripcion,
                    clienteName(i.clienteId),
                    conceptoLabel(i.concepto),
                    String(i.monto),
                    String(i.iva),
                    String(i.montoTotal),
                    formaPagoLabel(i.formaPago),
                    i.factura ? 'Si' : 'No',
                    i.numeroFactura,
                  ]),
                )
              }
              className="text-[10px] font-bold tracking-[0.05em] text-neutral-400 hover:text-[#c72a09] uppercase transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
              CSV
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Sin ingresos"
          description="Registra tu primera venta o servicio"
          action={
            <button
              onClick={openNew}
              className="text-[#c72a09] font-bold text-xs uppercase tracking-wide hover:underline"
            >
              + Agregar ingreso
            </button>
          }
        />
      ) : (
        <div className="bg-white rounded-2xl border border-neutral-100 overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-neutral-100">
                <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                  Fecha
                </th>
                <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                  Descripción
                </th>
                <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                  Cliente
                </th>
                <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                  Concepto
                </th>
                <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                  Pago
                </th>
                <th className="px-5 py-4 text-right text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                  Monto
                </th>
                <th className="px-5 py-4 text-center text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                  Fact.
                </th>
                <th className="px-5 py-4"></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((i) => {
                const canReplaceFactura = Boolean(i.factura || i.uuidCFDI || i.xmlUrl || i.pdfUrl || i.numeroFactura);
                return (
                  <tr key={i.id} className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors">
                    <td className="px-5 py-4 text-neutral-400 text-xs">{formatDate(i.fecha)}</td>
                    <td className="px-5 py-4 font-semibold text-[#0a0a0a]">
                      {i.descripcion}
                      {i.pedidoId && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[8px] font-bold bg-orange-50 text-orange-500 uppercase">
                          Pedido
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-neutral-400 text-xs">{clienteName(i.clienteId) || '—'}</td>
                    <td className="px-5 py-4">
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide bg-green-50 text-green-700 uppercase">
                        {conceptoLabel(i.concepto)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-neutral-400 text-xs">{formaPagoLabel(i.formaPago)}</td>
                    <td className="px-5 py-4 text-right">
                      <span className="font-bold text-green-600">{formatCurrency(i.montoTotal)}</span>
                      {i.iva > 0 && (
                        <span className="block text-[10px] text-neutral-300">IVA: {formatCurrency(i.iva)}</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center">
                      {canReplaceFactura ? (
                        <div className="flex items-center justify-center gap-1.5">
                          {i.factura ? (
                            <button
                              onClick={async () => {
                                const ok = await openFacturaFile({ pdfUrl: i.pdfUrl, xmlUrl: i.xmlUrl });
                                if (!ok) alert('Esta factura no tiene archivo guardado. Súbela desde /facturas.');
                              }}
                              title={i.pdfUrl || i.xmlUrl ? 'Ver factura' : 'Sin archivo guardado'}
                              className={`w-7 h-7 rounded-full bg-[#c72a09] text-white text-[9px] font-bold inline-flex items-center justify-center transition-opacity ${i.pdfUrl || i.xmlUrl ? 'hover:bg-[#a82207]' : 'opacity-60 hover:opacity-100'}`}
                            >
                              F
                            </button>
                          ) : null}
                          <button
                            onClick={() => handleReplaceFactura(i)}
                            title="Reemplazar factura"
                            aria-label="Reemplazar factura"
                            className="w-7 h-7 rounded-full border border-neutral-200 text-neutral-400 inline-flex items-center justify-center hover:border-[#c72a09] hover:text-[#c72a09] transition-colors"
                          >
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4 4v6h6M20 20v-6h-6M20 9A8 8 0 0 0 6.3 3.7L4 6m16 12-2.3 2.3A8 8 0 0 1 4 15"
                              />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <span className="text-neutral-200">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end">
                        <ActionMenu
                          items={[
                            { label: 'Editar', onClick: () => openEdit(i) },
                            ...(canReplaceFactura
                              ? [
                                  {
                                    label: 'Reemplazar factura',
                                    onClick: () => handleReplaceFactura(i),
                                    danger: true,
                                  },
                                ]
                              : []),
                            { label: 'Eliminar', onClick: () => handleDelete(i.id), danger: true },
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

      <Pagination total={filtered.length} page={page} onPageChange={setPage} />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Editar Ingreso' : 'Nuevo Ingreso'}
        dirty={JSON.stringify(form) !== formSnapshot}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Fecha</label>
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Concepto</label>
              <select
                value={form.concepto}
                onChange={(e) => setForm({ ...form, concepto: e.target.value as ConceptoIngreso })}
                className={inputClass}
              >
                {conceptos.map((c) => (
                  <option key={c} value={c}>
                    {conceptoLabel(c)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Descripción</label>
            <input
              type="text"
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Ej: Bordado de logo en 10 playeras"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Cliente</label>
            <select
              value={form.clienteId}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  window.open('/studio24/clientes', '_blank');
                  return;
                }
                setForm({ ...form, clienteId: e.target.value });
              }}
              className={inputClass}
            >
              <option value="">Sin cliente</option>
              <option value="__new__">+ Nuevo cliente</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Monto (sin IVA)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={form.monto || ''}
                onChange={(e) => setForm({ ...form, monto: parseFloat(e.target.value) || 0 })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Forma de Pago</label>
              <select
                value={form.formaPago}
                onChange={(e) => setForm({ ...form, formaPago: e.target.value as FormaPago })}
                className={inputClass}
              >
                {formasPago.map((fp) => (
                  <option key={fp} value={fp}>
                    {formaPagoLabel(fp)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.factura}
                onChange={(e) => {
                  setForm({ ...form, factura: e.target.checked });
                }}
                className="w-4 h-4 accent-[#c72a09] rounded"
              />
              <span className="text-sm text-neutral-600">Factura (IVA 16%)</span>
            </label>
            {form.factura && form.monto > 0 && (
              <span className="text-xs text-neutral-400">
                IVA: {formatCurrency(calcIVA(form.monto))} &middot; Total:{' '}
                {formatCurrency(form.monto + calcIVA(form.monto))}
              </span>
            )}
          </div>
          {form.factura && (
            <div>
              <label className={labelClass}>No. Factura</label>
              <input
                type="text"
                value={form.numeroFactura}
                onChange={(e) => setForm({ ...form, numeroFactura: e.target.value })}
                placeholder="Se genera al guardar"
                className={inputClass}
              />
            </div>
          )}
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
              {editingId ? 'Guardar' : 'Registrar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
