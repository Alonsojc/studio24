'use client';

export interface InpcEntry {
  year: number;
  month: number;
  valor: number;
  source: string;
  updated_at?: string;
}

export interface InpcSyncHealth {
  latestLabel: string;
  expectedLabel: string;
  stale: boolean;
  monthsBehind: number;
}

export async function getInpc(): Promise<InpcEntry[]> {
  const { supabase } = await import('./supabase');
  const { data, error } = await supabase
    .from('inpc')
    .select('year, month, valor, source, updated_at')
    .order('year', { ascending: false })
    .order('month', { ascending: false });
  if (error) throw error;
  return (data || []) as InpcEntry[];
}

export async function saveInpc(entry: Pick<InpcEntry, 'year' | 'month' | 'valor'>): Promise<void> {
  const { supabase } = await import('./supabase');
  const { error } = await supabase.from('inpc').upsert(
    {
      year: entry.year,
      month: entry.month,
      valor: entry.valor,
      source: 'manual',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'year,month' },
  );
  if (error) throw error;
}

export async function deleteInpc(year: number, month: number): Promise<void> {
  const { supabase } = await import('./supabase');
  const { error } = await supabase.from('inpc').delete().eq('year', year).eq('month', month);
  if (error) throw error;
}

/** Invoca la Edge Function `fetch-inpc` para jalar datos frescos de Banxico. */
export async function syncInpcFromInegi(): Promise<{ updated: number; error?: string }> {
  try {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.functions.invoke('fetch-inpc', { body: {} });
    if (error) return { updated: 0, error: error.message };
    if (data && typeof data === 'object' && 'error' in data) {
      return { updated: 0, error: String(data.error) };
    }
    const updated = data && typeof data === 'object' && 'updated' in data ? Number(data.updated) : 0;
    return { updated };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'error desconocido';
    return { updated: 0, error: message };
  }
}

function periodIndex(year: number, month: number): number {
  return year * 12 + month;
}

function periodLabel(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function getExpectedInpcPeriod(now = new Date()): { year: number; month: number } {
  const monthOffset = now.getDate() >= 12 ? 1 : 2;
  const date = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function getInpcSyncHealth(entries: Pick<InpcEntry, 'year' | 'month'>[], now = new Date()): InpcSyncHealth {
  const expected = getExpectedInpcPeriod(now);
  const latest = [...entries].sort((a, b) => periodIndex(b.year, b.month) - periodIndex(a.year, a.month))[0];
  if (!latest) {
    return {
      latestLabel: 'sin datos',
      expectedLabel: periodLabel(expected.year, expected.month),
      stale: true,
      monthsBehind: Number.POSITIVE_INFINITY,
    };
  }
  const monthsBehind = Math.max(0, periodIndex(expected.year, expected.month) - periodIndex(latest.year, latest.month));
  return {
    latestLabel: periodLabel(latest.year, latest.month),
    expectedLabel: periodLabel(expected.year, expected.month),
    stale: monthsBehind > 0,
    monthsBehind,
  };
}

/** Busca el factor de actualización entre dos meses (YYYY-MM). */
export function actualizationFactor(map: Map<string, number>, fromYearMonth: string, toYearMonth: string): number {
  const from = map.get(fromYearMonth);
  const to = map.get(toYearMonth);
  if (!from || !to || from <= 0) return 1;
  return to / from;
}

/** Convierte array de entries a Map 'YYYY-MM' → valor, útil para lookups rápidos. */
export function inpcMap(entries: InpcEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) {
    const key = `${e.year}-${String(e.month).padStart(2, '0')}`;
    m.set(key, e.valor);
  }
  return m;
}
