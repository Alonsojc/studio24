'use client';

import { useState, useRef, useCallback } from 'react';
import { getIngresos, getEgresos, getClientes, getProveedores } from '@/lib/store';
import { cloudGetIngresos, cloudGetEgresos, cloudGetClientes, cloudGetProveedores } from '@/lib/store-cloud';
import { useCloudStore } from '@/lib/useCloudStore';
import { formatCurrency, formatDate } from '@/lib/helpers';
import {
  parseBankCSV,
  matchMovimientos,
  calcSummary,
  type MatchResult,
  type ConciliacionSummary,
} from '@/lib/conciliacion';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import { btnPrimary } from '@/lib/styles';

type FilterTab = 'todos' | 'matched' | 'unmatched';

export default function ConciliacionPage() {
  const { data: ingresos } = useCloudStore(getIngresos, cloudGetIngresos, 'bordados_ingresos');
  const { data: egresos } = useCloudStore(getEgresos, cloudGetEgresos, 'bordados_egresos');
  const { data: clientes } = useCloudStore(getClientes, cloudGetClientes, 'bordados_clientes');
  const { data: proveedores } = useCloudStore(getProveedores, cloudGetProveedores, 'bordados_proveedores');
  const isClient = typeof window !== 'undefined';
  const [results, setResults] = useState<MatchResult[] | null>(null);
  const [summary, setSummary] = useState<ConciliacionSummary | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('todos');
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [mounted] = useState(() => isClient);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setParseError('');
      setFileName(file.name);

      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const text = ev.target?.result as string;
          const movimientos = parseBankCSV(text);
          if (movimientos.length === 0) {
            setParseError(
              'No se encontraron movimientos. Verifica que el archivo sea un CSV de estado de cuenta con columnas de fecha, descripción y monto.',
            );
            setResults(null);
            setSummary(null);
            return;
          }
          const matched = matchMovimientos(movimientos, ingresos, egresos);
          setResults(matched);
          setSummary(calcSummary(matched));
          setFilterTab('todos');
        } catch {
          setParseError('Error al leer el archivo. Asegúrate de que sea un CSV válido.');
          setResults(null);
          setSummary(null);
        }
      };
      reader.readAsText(file);
      // Reset input so re-uploading the same file triggers onChange
      e.target.value = '';
    },
    [ingresos, egresos],
  );

  const clienteName = (id: string) => clientes.find((c) => c.id === id)?.nombre || '';
  const proveedorName = (id: string) => proveedores.find((p) => p.id === id)?.nombre || '';

  const getMatchDetail = (r: MatchResult): string => {
    if (r.estado !== 'matched' || !r.matchId) return '';
    if (r.matchType === 'ingreso') {
      const ing = ingresos.find((i) => i.id === r.matchId);
      if (!ing) return r.matchDesc || '';
      const cliente = clienteName(ing.clienteId);
      return `${ing.descripcion}${cliente ? ` — ${cliente}` : ''}`;
    }
    if (r.matchType === 'egreso') {
      const eg = egresos.find((e) => e.id === r.matchId);
      if (!eg) return r.matchDesc || '';
      const prov = proveedorName(eg.proveedorId);
      return `${eg.descripcion}${prov ? ` — ${prov}` : ''}`;
    }
    return r.matchDesc || '';
  };

  const filtered = results
    ? results.filter((r) => {
        if (filterTab === 'matched') return r.estado === 'matched';
        if (filterTab === 'unmatched') return r.estado === 'unmatched';
        return true;
      })
    : [];

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Conciliación Bancaria"
        description="Sube tu estado de cuenta y matchea con ingresos/egresos"
        action={
          <div className="flex gap-2 items-center">
            <button onClick={() => fileRef.current?.click()} className={btnPrimary}>
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                  />
                </svg>
                Subir Estado de Cuenta
              </span>
            </button>
            <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" onChange={handleFile} className="hidden" />
          </div>
        }
      />

      {/* Upload area / instructions */}
      {!results && !parseError && (
        <div
          className="bg-white rounded-2xl border-2 border-dashed border-neutral-200 p-12 text-center cursor-pointer hover:border-[#c72a09]/40 transition-colors mb-8"
          onClick={() => fileRef.current?.click()}
        >
          <svg
            className="w-12 h-12 mx-auto text-neutral-300 mb-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
          <p className="text-sm font-semibold text-neutral-600 mb-1">Arrastra o haz clic para subir tu CSV</p>
          <p className="text-xs text-neutral-400">
            Soporta formatos de Banamex, BBVA, Banorte, Santander y otros bancos mexicanos
          </p>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-left max-w-xl mx-auto">
            <div className="bg-neutral-50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Paso 1</p>
              <p className="text-xs text-neutral-600">Descarga el estado de cuenta en CSV desde tu banca en línea</p>
            </div>
            <div className="bg-neutral-50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Paso 2</p>
              <p className="text-xs text-neutral-600">Sube el archivo aquí — detectamos las columnas automáticamente</p>
            </div>
            <div className="bg-neutral-50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Paso 3</p>
              <p className="text-xs text-neutral-600">Revisa los matches automáticos y los movimientos sin registro</p>
            </div>
          </div>
        </div>
      )}

      {parseError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6">
          <p className="text-xs text-red-600 font-semibold">{parseError}</p>
          <button
            onClick={() => {
              setParseError('');
              fileRef.current?.click();
            }}
            className="text-xs text-[#c72a09] font-bold mt-2 hover:underline"
          >
            Intentar con otro archivo
          </button>
        </div>
      )}

      {/* Results */}
      {results && summary && (
        <>
          {/* File info */}
          <div className="flex items-center gap-3 mb-6">
            <span className="px-3 py-1.5 bg-neutral-100 rounded-lg text-xs font-medium text-neutral-600">
              {fileName}
            </span>
            <span className="text-xs text-neutral-400">{summary.totalMovimientos} movimientos</span>
            <button
              onClick={() => {
                setResults(null);
                setSummary(null);
                setFileName('');
              }}
              className="text-xs text-neutral-400 hover:text-[#c72a09] transition-colors ml-auto"
            >
              Limpiar
            </button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Conciliados"
              value={`${summary.matched}/${summary.totalMovimientos}`}
              subtitle={`${summary.totalMovimientos > 0 ? Math.round((summary.matched / summary.totalMovimientos) * 100) : 0}% de coincidencia`}
              color="green"
            />
            <StatCard
              label="Sin registro"
              value={String(summary.unmatched)}
              subtitle="Movimientos sin match"
              color={summary.unmatched > 0 ? 'red' : 'default'}
            />
            <StatCard
              label="Depósitos"
              value={formatCurrency(summary.depositosTotal)}
              subtitle={`${summary.depositos} movimientos`}
              color="green"
            />
            <StatCard
              label="Retiros"
              value={formatCurrency(summary.retirosTotal)}
              subtitle={`${summary.retiros} movimientos`}
              color="red"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 mb-6">
            {(
              [
                { key: 'todos', label: 'Todos', count: summary.totalMovimientos },
                { key: 'matched', label: 'Conciliados', count: summary.matched },
                { key: 'unmatched', label: 'Sin registro', count: summary.unmatched },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilterTab(tab.key)}
                className={`px-4 py-2 rounded-xl text-xs font-bold tracking-[0.05em] uppercase transition-colors border ${
                  filterTab === tab.key
                    ? 'bg-[#0a0a0a] text-white border-[#0a0a0a]'
                    : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-400'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {/* Results table */}
          {filtered.length === 0 ? (
            <EmptyState title="Sin resultados" description="No hay movimientos en esta categoría" />
          ) : (
            <div className="bg-white rounded-2xl border border-neutral-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100">
                    <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                      Fecha
                    </th>
                    <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                      Descripción Banco
                    </th>
                    <th className="px-5 py-4 text-right text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                      Monto
                    </th>
                    <th className="px-5 py-4 text-center text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                      Estado
                    </th>
                    <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                      Match en Studio 24
                    </th>
                    <th className="px-5 py-4 text-center text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                      Confianza
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.movimiento.id}
                      className={`border-b border-neutral-50 transition-colors ${
                        r.estado === 'unmatched' ? 'bg-amber-50/30' : 'hover:bg-neutral-50/50'
                      }`}
                    >
                      <td className="px-5 py-4 text-neutral-400 text-xs">{formatDate(r.movimiento.fecha)}</td>
                      <td className="px-5 py-4">
                        <span className="font-semibold text-[#0a0a0a] text-xs">{r.movimiento.descripcion || '—'}</span>
                        {r.movimiento.referencia && (
                          <span className="block text-[10px] text-neutral-300 mt-0.5">
                            Ref: {r.movimiento.referencia}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className={`font-bold ${r.movimiento.monto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {r.movimiento.monto >= 0 ? '+' : ''}
                          {formatCurrency(r.movimiento.monto)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        {r.estado === 'matched' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-green-50 text-green-600 uppercase">
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                            OK
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-600 uppercase">
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                              />
                            </svg>
                            Sin match
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {r.estado === 'matched' ? (
                          <div>
                            <span className="text-xs font-semibold text-[#0a0a0a]">{getMatchDetail(r)}</span>
                            <span
                              className={`ml-2 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                                r.matchType === 'ingreso' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
                              }`}
                            >
                              {r.matchType === 'ingreso' ? 'Ingreso' : 'Egreso'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-neutral-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center">
                        {r.confianza != null ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="w-12 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  r.confianza >= 80 ? 'bg-green-500' : r.confianza >= 50 ? 'bg-amber-500' : 'bg-red-400'
                                }`}
                                style={{ width: `${r.confianza}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-neutral-400 font-medium">{r.confianza}%</span>
                          </div>
                        ) : (
                          <span className="text-neutral-200">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Disclaimer */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mt-8">
            <p className="text-xs text-amber-700">
              <span className="font-bold">Nota:</span> La conciliación automática usa el monto y la fecha para encontrar
              coincidencias. Revisa los resultados manualmente, especialmente los matches con baja confianza. Los
              movimientos sin registro pueden ser transferencias internas, comisiones bancarias, o transacciones que aún
              no se han capturado en el sistema.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
