import { v4 as uuid } from 'uuid';
import {
  getEgresosRecurrentes,
  getRecurrentesLog,
} from './store';
import {
  addEgreso,
  addRecurrenteLog,
} from './store-sync';
import { Egreso } from './types';
import { calcIVA } from './helpers';

/**
 * Genera egresos automaticos para el mes actual basado en los egresos recurrentes activos.
 * Usa un log para evitar duplicados: cada combinacion recurrenteId+YYYY-MM se procesa una sola vez.
 * Retorna la cantidad de egresos generados.
 */
export function generarEgresosRecurrentes(): number {
  if (typeof window === 'undefined') return 0;

  const recurrentes = getEgresosRecurrentes().filter((r) => r.activo);
  if (recurrentes.length === 0) return 0;

  const now = new Date();
  const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const log = getRecurrentesLog();
  let generados = 0;

  for (const rec of recurrentes) {
    const logKey = `${rec.id}::${mesActual}`;
    if (log.includes(logKey)) continue;

    const dia = String(Math.min(rec.diaDelMes, 28)).padStart(2, '0');
    const fecha = `${mesActual}-${dia}`;
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

    addEgreso(egreso);
    addRecurrenteLog(logKey);
    generados++;
  }

  return generados;
}
