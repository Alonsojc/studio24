import { v4 as uuid } from 'uuid';
import { getEgresos, getEgresosRecurrentes, getRecurrentesLog } from './store';
import { addEgreso, addRecurrenteLog, deleteEgreso } from './store-sync';
import { Egreso } from './types';
import { calcIVA } from './helpers';

function isAutomaticEgreso(egreso: Egreso): boolean {
  return egreso.descripcion.endsWith(' (automático)') || egreso.notas.includes('Generado automáticamente');
}

function automaticSignature(
  egreso: Pick<
    Egreso,
    'fecha' | 'descripcion' | 'categoria' | 'subcategoria' | 'proveedorId' | 'monto' | 'formaPago' | 'factura'
  >,
): string {
  return [
    egreso.fecha,
    egreso.descripcion.trim().toLowerCase(),
    egreso.categoria,
    egreso.subcategoria.trim().toLowerCase(),
    egreso.proveedorId,
    egreso.monto.toFixed(2),
    egreso.formaPago,
    egreso.factura ? 'factura' : 'sin-factura',
  ].join('::');
}

/**
 * Limpia duplicados exactos creados por el generador automático.
 * También elimina cargos automáticos futuros que aún no deberían existir.
 */
export function limpiarEgresosAutomaticosDuplicados(now = new Date()): number {
  if (typeof window === 'undefined') return 0;

  const today = now.toISOString().split('T')[0];
  const seen = new Set<string>();
  let removed = 0;

  const automaticos = getEgresos()
    .filter(isAutomaticEgreso)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const egreso of automaticos) {
    const signature = automaticSignature(egreso);
    if (egreso.fecha > today || seen.has(signature)) {
      deleteEgreso(egreso.id);
      removed++;
      continue;
    }
    seen.add(signature);
  }

  return removed;
}

/**
 * Genera egresos automaticos para el mes actual y meses anteriores faltantes
 * del año en curso, basado en los egresos recurrentes activos.
 * Usa un log para evitar duplicados: cada combinacion recurrenteId+YYYY-MM se procesa una sola vez.
 * Retorna la cantidad de egresos generados.
 */
export function generarEgresosRecurrentes(): number {
  if (typeof window === 'undefined') return 0;

  limpiarEgresosAutomaticosDuplicados();

  const recurrentes = getEgresosRecurrentes().filter((r) => r.activo);
  if (recurrentes.length === 0) return 0;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed
  const currentDay = now.getDate();
  const log = new Set(getRecurrentesLog());
  const existingAutomaticSignatures = new Set(getEgresos().filter(isAutomaticEgreso).map(automaticSignature));
  let generados = 0;

  // Generate for each month from January to current month (backfill missed months)
  for (let m = 0; m <= currentMonth; m++) {
    const mes = `${currentYear}-${String(m + 1).padStart(2, '0')}`;

    for (const rec of recurrentes) {
      // Only backfill months after the recurrente was created
      const createdMonth = rec.createdAt ? rec.createdAt.substring(0, 7) : '2000-01';
      if (mes < createdMonth) continue;

      const diaNum = Math.min(rec.diaDelMes, 28);
      if (m === currentMonth && diaNum > currentDay) continue;

      const logKey = `${rec.id}::${mes}`;
      if (log.has(logKey)) continue;

      const dia = String(diaNum).padStart(2, '0');
      const fecha = `${mes}-${dia}`;
      const iva = rec.factura ? calcIVA(rec.monto) : 0;

      const egreso: Egreso = {
        id: uuid(),
        fecha,
        descripcion: `${rec.descripcion} (automático)`,
        categoria: rec.categoria,
        subcategoria: rec.subcategoria,
        proveedorId: rec.proveedorId,
        monto: rec.monto,
        iva,
        montoTotal: rec.monto + iva,
        formaPago: rec.formaPago,
        factura: rec.factura,
        numeroFactura: '',
        notas: `Generado automáticamente desde egreso recurrente`,
        createdAt: new Date().toISOString(),
      };

      const signature = automaticSignature(egreso);
      if (existingAutomaticSignatures.has(signature)) {
        addRecurrenteLog(logKey);
        log.add(logKey);
        continue;
      }

      addEgreso(egreso);
      addRecurrenteLog(logKey);
      log.add(logKey);
      existingAutomaticSignatures.add(signature);
      generados++;
    }
  }

  return generados;
}
