'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { getInpc, saveInpc, deleteInpc, syncInpcFromInegi, type InpcEntry } from '@/lib/inpc';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function InpcPage() {
  const [entries, setEntries] = useState<InpcEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  // Edit form
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [valor, setValor] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await getInpc());
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Error al cargar' });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);
    const result = await syncInpcFromInegi();
    if (result.error) {
      setMessage({ type: 'error', text: `No se pudo sincronizar con Banxico: ${result.error}` });
    } else {
      setMessage({ type: 'ok', text: `${result.updated} valores actualizados desde Banxico.` });
      reload();
    }
    setSyncing(false);
  };

  const handleSave = async () => {
    const v = parseFloat(valor);
    if (isNaN(v) || v <= 0) {
      setMessage({ type: 'error', text: 'Ingresa un valor numérico mayor a 0' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await saveInpc({ year, month, valor: v });
      setMessage({ type: 'ok', text: `INPC ${MESES[month - 1]} ${year} guardado.` });
      setValor('');
      reload();
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Error al guardar' });
    }
    setSaving(false);
  };

  const handleDelete = async (y: number, m: number) => {
    if (!confirm(`¿Eliminar INPC de ${MESES[m - 1]} ${y}?`)) return;
    try {
      await deleteInpc(y, m);
      reload();
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Error al eliminar' });
    }
  };

  const byYear = useMemo(() => {
    const map = new Map<number, InpcEntry[]>();
    for (const e of entries) {
      if (!map.has(e.year)) map.set(e.year, []);
      map.get(e.year)!.push(e);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.month - b.month);
    return Array.from(map.entries()).sort(([a], [b]) => b - a);
  }, [entries]);

  const latest = entries[0];
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  return (
    <div>
      <PageHeader
        title="INPC"
        description="Índice Nacional de Precios al Consumidor — base 2Q jul 2018 = 100"
        action={
          <div className="flex gap-2 items-center">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-4 py-2.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase bg-[#c72a09] text-white hover:bg-[#a82207] transition-colors disabled:opacity-50"
            >
              {syncing ? 'Sincronizando…' : 'Sincronizar con Banxico'}
            </button>
            <Link
              href="/fiscal"
              className="text-[10px] font-bold uppercase tracking-[0.05em] text-neutral-500 hover:text-[#c72a09]"
            >
              Volver a fiscal
            </Link>
          </div>
        }
      />

      {message && (
        <div
          className={`rounded-2xl p-4 mb-6 border text-xs ${
            message.type === 'ok'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {latest && (
        <div className="bg-white rounded-2xl border border-neutral-100 p-5 mb-6 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase">Último publicado</p>
            <p className="text-sm text-neutral-500 mt-1">
              {MESES[latest.month - 1]} {latest.year} · fuente {latest.source}
            </p>
          </div>
          <p className="text-3xl font-black">{latest.valor.toFixed(4)}</p>
        </div>
      )}

      {/* Manual entry form */}
      <div className="bg-white rounded-2xl border border-neutral-100 p-5 mb-6">
        <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-3">Captura manual</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-[10px] font-bold text-neutral-500 block mb-1">Año</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border border-neutral-200 rounded-xl px-3 py-2 text-xs font-bold bg-white focus:outline-none focus:border-[#c72a09]"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-neutral-500 block mb-1">Mes</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="border border-neutral-200 rounded-xl px-3 py-2 text-xs font-bold bg-white focus:outline-none focus:border-[#c72a09]"
            >
              {MESES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="text-[10px] font-bold text-neutral-500 block mb-1">Valor INPC</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.0001"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="Ej. 143.7700"
              className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-xs font-bold bg-white focus:outline-none focus:border-[#c72a09]"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !valor}
            className="px-4 py-2.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase bg-[#0a0a0a] text-white hover:bg-[#222] transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Table by year */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[20vh]">
          <div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : byYear.length === 0 ? (
        <div className="bg-white rounded-2xl border border-neutral-100 p-10 text-center">
          <p className="text-sm text-neutral-400">Sin datos INPC. Carga el seed o sincroniza con Banxico.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {byYear.map(([y, rows]) => (
            <div key={y} className="bg-white rounded-2xl border border-neutral-100 overflow-x-auto">
              <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
                <h4 className="text-sm font-bold text-[#0a0a0a]">{y}</h4>
                <p className="text-[10px] text-neutral-400">{rows.length} meses</p>
              </div>
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-neutral-50">
                    {MESES.map((m) => (
                      <th
                        key={m}
                        className="px-3 py-2 text-center text-[9px] font-bold tracking-[0.1em] text-neutral-400 uppercase"
                      >
                        {m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {MESES.map((_, i) => {
                      const row = rows.find((r) => r.month === i + 1);
                      if (!row) {
                        return (
                          <td key={i} className="px-3 py-3 text-center text-xs text-neutral-200">
                            —
                          </td>
                        );
                      }
                      return (
                        <td
                          key={i}
                          className="px-3 py-3 text-center text-xs tabular-nums cursor-pointer hover:bg-neutral-50 group relative"
                          onClick={() => handleDelete(row.year, row.month)}
                          title={`Click para eliminar · fuente ${row.source}`}
                        >
                          {row.valor.toFixed(4)}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-neutral-400 mt-6 leading-relaxed">
        Fuente: Banco de México (SIE), serie <code>SP74665</code> — INPC General Mensual base 2018=100. El cron corre el día 11
        de cada mes; si algún valor no aparece, usa <strong>Sincronizar con Banxico</strong> o captúralo a mano.
      </p>
    </div>
  );
}
