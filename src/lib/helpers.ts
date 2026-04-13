import { FormaPago, ConceptoIngreso, CategoriaEgreso } from './types';

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formaPagoLabel(fp: FormaPago): string {
  const map: Record<FormaPago, string> = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    transferencia: 'Transferencia',
    otro: 'Otro',
  };
  return map[fp] || fp;
}

export function conceptoLabel(c: ConceptoIngreso): string {
  const map: Record<ConceptoIngreso, string> = {
    solo_bordado: 'Solo Bordado',
    bordado_y_prenda: 'Bordado + Prenda',
    diseno: 'Diseno',
    reparacion: 'Reparacion',
    otro: 'Otro',
  };
  return map[c] || c;
}

export function categoriaLabel(c: CategoriaEgreso): string {
  const map: Record<CategoriaEgreso, string> = {
    programas: 'Programas/Software',
    mercancia: 'Mercancia',
    insumos: 'Insumos',
    servicios: 'Servicios',
    maquinaria: 'Maquinaria',
    publicidad: 'Publicidad',
    renta: 'Renta/Local',
    otro: 'Otro',
  };
  return map[c] || c;
}

export function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

export function calcIVA(monto: number): number {
  return Math.round(monto * 0.16 * 100) / 100;
}
