'use client';

import { supabase } from './supabase';

export interface InpcEntry {
  year: number;
  month: number;
  valor: number;
  source: string;
  updated_at?: string;
}

export async function getInpc(): Promise<InpcEntry[]> {
  const { data, error } = await supabase
    .from('inpc')
    .select('year, month, valor, source, updated_at')
    .order('year', { ascending: false })
    .order('month', { ascending: false });
  if (error) throw error;
  return (data || []) as InpcEntry[];
}

export async function saveInpc(entry: Pick<InpcEntry, 'year' | 'month' | 'valor'>): Promise<void> {
  const { error } = await supabase
    .from('inpc')
    .upsert(
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
  const { error } = await supabase.from('inpc').delete().eq('year', year).eq('month', month);
  if (error) throw error;
}

/** Invoca la Edge Function `fetch-inpc` para jalar datos frescos de INEGI. */
export async function syncInpcFromInegi(): Promise<{ updated: number; error?: string }> {
  try {
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
