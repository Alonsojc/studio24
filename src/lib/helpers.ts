import { FormaPago, ConceptoIngreso, CategoriaEgreso, EstadoPedido } from './types';

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

export function estadoPedidoLabel(e: EstadoPedido): string {
  const map: Record<EstadoPedido, string> = {
    pendiente: 'Pendiente',
    diseno: 'En Diseno',
    aprobado: 'Aprobado',
    en_maquina: 'En Maquina',
    terminado: 'Terminado',
    entregado: 'Entregado',
    cancelado: 'Cancelado',
  };
  return map[e] || e;
}

export function estadoPedidoColor(e: EstadoPedido): string {
  const map: Record<EstadoPedido, string> = {
    pendiente: 'bg-amber-100 text-amber-700',
    diseno: 'bg-blue-100 text-blue-700',
    aprobado: 'bg-purple-100 text-purple-700',
    en_maquina: 'bg-orange-100 text-orange-700',
    terminado: 'bg-green-100 text-green-700',
    entregado: 'bg-neutral-100 text-neutral-500',
    cancelado: 'bg-red-100 text-red-600',
  };
  return map[e] || 'bg-neutral-100 text-neutral-500';
}
