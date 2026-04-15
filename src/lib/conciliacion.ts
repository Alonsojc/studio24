'use client';

import { Ingreso, Egreso } from './types';

// --- Types ---

export interface MovimientoBanco {
  id: string;
  fecha: string; // YYYY-MM-DD
  descripcion: string;
  referencia: string;
  monto: number; // positive = deposit, negative = withdrawal
  saldo: number;
  lineaOriginal: number;
}

export type EstadoMatch = 'matched' | 'unmatched';

export interface MatchResult {
  movimiento: MovimientoBanco;
  estado: EstadoMatch;
  matchType?: 'ingreso' | 'egreso';
  matchId?: string;
  matchDesc?: string;
  confianza?: number; // 0-100
}

export interface ConciliacionSummary {
  totalMovimientos: number;
  matched: number;
  unmatched: number;
  depositos: number;
  retiros: number;
  depositosTotal: number;
  retirosTotal: number;
}

// --- CSV Parsing ---

/**
 * Parse bank statement CSV. Supports common Mexican bank formats:
 * - Banamex, BBVA, Banorte, Santander generic CSV exports
 * - Auto-detects columns by header keywords
 */
export function parseBankCSV(csvText: string): MovimientoBanco[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  // Find header row (first row with fecha/date-like keyword)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes('fecha') || lower.includes('date') || lower.includes('concepto')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) headerIdx = 0;

  const headers = parseCSVLine(lines[headerIdx]).map((h) => h.toLowerCase().trim());

  // Auto-detect column indices
  const fechaIdx = headers.findIndex((h) => h.includes('fecha') || h.includes('date'));
  const descIdx = headers.findIndex(
    (h) => h.includes('descripci') || h.includes('concepto') || h.includes('detalle') || h.includes('description'),
  );
  const refIdx = headers.findIndex((h) => h.includes('referencia') || h.includes('ref') || h.includes('clave'));

  // Amount: some banks split into deposito/retiro, others use a single column
  const depositoIdx = headers.findIndex(
    (h) => h.includes('dep') || h.includes('abono') || h.includes('ingreso') || h.includes('credit'),
  );
  const retiroIdx = headers.findIndex(
    (h) => h.includes('retiro') || h.includes('cargo') || h.includes('egreso') || h.includes('debit'),
  );
  const montoIdx = headers.findIndex((h) => h.includes('monto') || h.includes('importe') || h.includes('amount'));
  const saldoIdx = headers.findIndex((h) => h.includes('saldo') || h.includes('balance'));

  if (fechaIdx === -1) return []; // Can't parse without dates

  const movimientos: MovimientoBanco[] = [];
  let counter = 0;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length <= fechaIdx) continue;

    const fechaRaw = cols[fechaIdx]?.trim();
    const fecha = normalizeDate(fechaRaw);
    if (!fecha) continue;

    const descripcion = descIdx >= 0 ? cols[descIdx]?.trim() || '' : '';
    const referencia = refIdx >= 0 ? cols[refIdx]?.trim() || '' : '';

    let monto = 0;
    if (depositoIdx >= 0 && retiroIdx >= 0) {
      const dep = parseAmount(cols[depositoIdx]);
      const ret = parseAmount(cols[retiroIdx]);
      monto = dep > 0 ? dep : -ret;
    } else if (montoIdx >= 0) {
      monto = parseAmount(cols[montoIdx]);
    }

    if (monto === 0 && !descripcion) continue;

    const saldo = saldoIdx >= 0 ? parseAmount(cols[saldoIdx]) : 0;

    counter++;
    movimientos.push({
      id: `bank-${counter}`,
      fecha,
      descripcion,
      referencia,
      monto,
      saldo,
      lineaOriginal: i + 1,
    });
  }

  return movimientos;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if ((ch === ',' || ch === ';' || ch === '\t') && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseAmount(s: string | undefined): number {
  if (!s) return 0;
  // Remove currency symbols, spaces, and thousand separators
  const cleaned = s.replace(/[$\s,]/g, '').replace(/\((.+)\)/, '-$1');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function normalizeDate(raw: string): string {
  if (!raw) return '';

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  // MM/DD/YYYY — assume if month > 12 it's DD/MM
  const mdy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (mdy && parseInt(mdy[1]) > 12) {
    return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  }

  // DD-Mon-YYYY (e.g. 15-Ene-2024)
  const meses: Record<string, string> = {
    ene: '01',
    feb: '02',
    mar: '03',
    abr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    ago: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dic: '12',
  };
  const dMonY = raw.match(/^(\d{1,2})[/-](\w{3})[/-](\d{4})$/i);
  if (dMonY) {
    const m = meses[dMonY[2].toLowerCase().substring(0, 3)];
    if (m) return `${dMonY[3]}-${m}-${dMonY[1].padStart(2, '0')}`;
  }

  return '';
}

// --- Matching ---

export function matchMovimientos(
  movimientos: MovimientoBanco[],
  ingresos: Ingreso[],
  egresos: Egreso[],
): MatchResult[] {
  // Track which records have been matched to avoid double-matching
  const usedIngresos = new Set<string>();
  const usedEgresos = new Set<string>();

  return movimientos.map((mov) => {
    if (mov.monto > 0) {
      // Deposit → match against ingresos
      const match = findBestMatch(
        mov,
        ingresos.filter((i) => !usedIngresos.has(i.id)),
        (i) => ({ monto: i.montoTotal, fecha: i.fecha, desc: i.descripcion, id: i.id }),
      );
      if (match) {
        usedIngresos.add(match.id);
        return {
          movimiento: mov,
          estado: 'matched' as const,
          matchType: 'ingreso' as const,
          matchId: match.id,
          matchDesc: match.desc,
          confianza: match.confianza,
        };
      }
    } else if (mov.monto < 0) {
      // Withdrawal → match against egresos
      const match = findBestMatch(
        mov,
        egresos.filter((e) => !usedEgresos.has(e.id)),
        (e) => ({ monto: e.montoTotal, fecha: e.fecha, desc: e.descripcion, id: e.id }),
      );
      if (match) {
        usedEgresos.add(match.id);
        return {
          movimiento: mov,
          estado: 'matched' as const,
          matchType: 'egreso' as const,
          matchId: match.id,
          matchDesc: match.desc,
          confianza: match.confianza,
        };
      }
    }

    return { movimiento: mov, estado: 'unmatched' as const };
  });
}

interface MatchCandidate {
  id: string;
  desc: string;
  confianza: number;
}

function findBestMatch<T>(
  mov: MovimientoBanco,
  items: T[],
  extract: (item: T) => { monto: number; fecha: string; desc: string; id: string },
): MatchCandidate | null {
  const movAmount = Math.abs(mov.monto);
  let bestScore = 0;
  let bestMatch: MatchCandidate | null = null;

  for (const item of items) {
    const { monto, fecha, desc, id } = extract(item);
    let score = 0;

    // Exact amount match (most important signal)
    const diff = Math.abs(monto - movAmount);
    if (diff < 0.01) {
      score += 50;
    } else if (diff / movAmount < 0.02) {
      // Within 2%
      score += 30;
    } else {
      continue; // Skip if amounts don't remotely match
    }

    // Date match
    if (fecha === mov.fecha) {
      score += 30;
    } else {
      const d1 = new Date(fecha + 'T00:00:00');
      const d2 = new Date(mov.fecha + 'T00:00:00');
      const daysDiff = Math.abs(d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff <= 1) score += 20;
      else if (daysDiff <= 3) score += 10;
      else if (daysDiff <= 7) score += 5;
    }

    // Description similarity (bonus)
    if (mov.descripcion && desc) {
      const words1 = mov.descripcion.toLowerCase().split(/\s+/);
      const words2 = desc.toLowerCase().split(/\s+/);
      const common = words1.filter((w) => w.length > 3 && words2.some((w2) => w2.includes(w) || w.includes(w2)));
      if (common.length > 0) score += Math.min(20, common.length * 5);
    }

    if (score > bestScore && score >= 40) {
      bestScore = score;
      bestMatch = { id, desc, confianza: Math.min(100, score) };
    }
  }

  return bestMatch;
}

export function calcSummary(results: MatchResult[]): ConciliacionSummary {
  const depositos = results.filter((r) => r.movimiento.monto > 0);
  const retiros = results.filter((r) => r.movimiento.monto < 0);

  return {
    totalMovimientos: results.length,
    matched: results.filter((r) => r.estado === 'matched').length,
    unmatched: results.filter((r) => r.estado === 'unmatched').length,
    depositos: depositos.length,
    retiros: retiros.length,
    depositosTotal: depositos.reduce((s, r) => s + r.movimiento.monto, 0),
    retirosTotal: retiros.reduce((s, r) => s + Math.abs(r.movimiento.monto), 0),
  };
}
