'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { getEgresos, getProveedores } from '@/lib/store';
import { cloudGetEgresos, cloudGetProveedores } from '@/lib/store-cloud';
import { useCloudStore } from '@/lib/useCloudStore';
import { buildDiotRows, diotCsv, diotTxt, downloadTextFile } from '@/lib/diot';
import { formatCurrency } from '@/lib/helpers';
import PageHeader from '@/components/PageHeader';

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export default function DiotPage() {
  const { data: egresos } = useCloudStore(getEgresos, cloudGetEgresos, 'bordados_egresos');
  const { data: proveedores } = useCloudStore(getProveedores, cloudGetProveedores, 'bordados_proveedores');

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const yearMonth = `${year}-${String(month + 1).padStart(2, '0')}`;

  const { rows, sinProveedor, sinRFC } = useMemo(
    () => buildDiotRows(egresos, proveedores, yearMonth),
    [egresos, proveedores, yearMonth],
  );

  const years = Array.from(new Set([...egresos.map((e) => parseInt(e.fecha.substring(0, 4), 10)), now.getFullYear()]))
    .sort()
    .reverse();

  const totalValor16 = rows.reduce((s, r) => s + r.valorActos16, 0);
  const totalIva16 = rows.reduce((s, r) => s + r.ivaAcreditable16, 0);
  const totalValor0 = rows.reduce((s, r) => s + r.valorActos0, 0);
  const totalPagado = rows.reduce((s, r) => s + r.totalPagado, 0);

  const nombreMes = MESES[month];
  const stem = `diot_${year}_${String(month + 1).padStart(2, '0')}`;

  const descargarCsv = () => downloadTextFile(`${stem}.csv`, diotCsv(rows), 'text/csv;charset=utf-8');
  const descargarTxt = () => downloadTextFile(`${stem}.txt`, diotTxt(rows));

  return (
    <div>
      <PageHeader
        title="DIOT"
        description={`Operaciones con terceros — ${nombreMes} ${year}`}
        action={
          <div className="flex gap-2 items-center">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border border-neutral-200 rounded-xl px-3 py-2.5 text-xs font-bold bg-white focus:outline-none focus:border-[#c72a09]"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="border border-neutral-200 rounded-xl px-3 py-2.5 text-xs font-bold bg-white focus:outline-none focus:border-[#c72a09]"
            >
              {MESES.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
            <Link
              href="/fiscal"
              className="text-[10px] font-bold uppercase tracking-[0.05em] text-neutral-500 hover:text-[#c72a09]"
            >
              Volver a fiscal
            </Link>
          </div>
        }
      />

      {/* Totales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-2xl border border-neutral-100 p-4">
          <p className="text-[9px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Proveedores</p>
          <p className="text-xl font-black mt-1">{rows.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-neutral-100 p-4">
          <p className="text-[9px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Subtotal 16%</p>
          <p className="text-xl font-black mt-1">{formatCurrency(totalValor16)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-neutral-100 p-4">
          <p className="text-[9px] font-bold tracking-[0.1em] text-neutral-400 uppercase">IVA Acreditable</p>
          <p className="text-xl font-black mt-1 text-green-600">{formatCurrency(totalIva16)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-neutral-100 p-4">
          <p className="text-[9px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Total pagado</p>
          <p className="text-xl font-black mt-1">{formatCurrency(totalPagado + totalValor0)}</p>
        </div>
      </div>

      {/* Warnings */}
      {(sinProveedor.length > 0 || sinRFC.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 space-y-1">
          {sinProveedor.length > 0 && (
            <p className="text-xs text-amber-700">
              <span className="font-bold">
                {sinProveedor.length} egreso{sinProveedor.length > 1 ? 's' : ''} sin proveedor
              </span>{' '}
              — asigna proveedor en /egresos para incluirlos en el DIOT.
            </p>
          )}
          {sinRFC.length > 0 && (
            <p className="text-xs text-amber-700">
              <span className="font-bold">
                {sinRFC.length} egreso{sinRFC.length > 1 ? 's' : ''} con proveedor sin RFC
              </span>{' '}
              — edita el proveedor en /proveedores y agrega su RFC.
            </p>
          )}
        </div>
      )}

      {/* Export buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={descargarCsv}
          disabled={rows.length === 0}
          className="px-4 py-2.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase bg-[#0a0a0a] text-white hover:bg-[#222] transition-colors disabled:opacity-40"
        >
          Descargar CSV
        </button>
        <button
          onClick={descargarTxt}
          disabled={rows.length === 0}
          className="px-4 py-2.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase bg-[#c72a09] text-white hover:bg-[#a82207] transition-colors disabled:opacity-40"
          title="Formato pipe-separated para subir al portal DIOT del SAT"
        >
          Descargar TXT (SAT)
        </button>
      </div>

      {/* Tabla */}
      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-neutral-100 p-10 text-center">
          <p className="text-sm text-neutral-400">
            No hay operaciones con factura en {nombreMes} {year}.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-neutral-100 overflow-x-auto">
          <table className="w-full text-sm min-w-[880px]">
            <thead>
              <tr className="border-b border-neutral-100">
                <th className="px-4 py-3 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                  RFC
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                  Proveedor
                </th>
                <th className="px-4 py-3 text-center text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                  Tercero
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                  Subtotal 16%
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                  IVA 16%
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                  Actos 0%
                </th>
                <th className="px-4 py-3 text-right text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                  Total
                </th>
                <th className="px-4 py-3 text-center text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                  Ops.
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.proveedorId} className="border-b border-neutral-50 hover:bg-neutral-50/50">
                  <td className="px-4 py-3 font-mono text-xs">{r.rfc}</td>
                  <td className="px-4 py-3 font-semibold text-[#0a0a0a]">{r.nombre}</td>
                  <td className="px-4 py-3 text-center text-[10px] text-neutral-500">{r.tipoTercero}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(r.valorActos16)}</td>
                  <td className="px-4 py-3 text-right text-green-600 font-semibold">
                    {formatCurrency(r.ivaAcreditable16)}
                  </td>
                  <td className="px-4 py-3 text-right text-neutral-400">
                    {r.valorActos0 > 0 ? formatCurrency(r.valorActos0) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-bold">{formatCurrency(r.totalPagado)}</td>
                  <td className="px-4 py-3 text-center text-[10px] text-neutral-400">{r.operaciones}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-neutral-400 mt-4 leading-relaxed">
        El TXT sigue el formato &quot;DIOT masivo&quot; (campos separados por pipe). El SAT actualiza este formato
        ocasionalmente, así que valida con tu contador antes de subirlo al portal. El CSV es una vista limpia para
        revisión.
      </p>
    </div>
  );
}
