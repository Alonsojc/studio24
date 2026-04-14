import { FormaPago, ConceptoIngreso, CategoriaEgreso, EstadoPedido, Ingreso, Egreso, Pedido, Cliente, Proveedor, Producto, EgresoRecurrente } from './types';

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
    diseno: 'Diseño',
    reparacion: 'Reparación',
    otro: 'Otro',
  };
  return map[c] || c;
}

export function categoriaLabel(c: CategoriaEgreso): string {
  const map: Record<CategoriaEgreso, string> = {
    programas: 'Programas/Software',
    mercancia: 'Mercancía',
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
    diseno: 'En Diseño',
    aprobado: 'Aprobado',
    en_maquina: 'En Máquina',
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

// --- Validaciones de formularios ---

function isValidDate(s: string): boolean {
  if (!s) return false;
  const d = new Date(s + 'T00:00:00');
  return !isNaN(d.getTime());
}

export function validateIngreso(form: Omit<Ingreso, 'id' | 'createdAt'>): string | null {
  if (!form.descripcion.trim()) return 'La descripción es requerida';
  if (!form.fecha || !isValidDate(form.fecha)) return 'La fecha no es válida';
  if (form.monto <= 0) return 'El monto debe ser mayor a 0';
  if (form.factura && !form.numeroFactura.trim()) return 'Si tiene factura, ingresa el número de factura';
  return null;
}

export function validateEgreso(form: Omit<Egreso, 'id' | 'createdAt'>): string | null {
  if (!form.descripcion.trim()) return 'La descripción es requerida';
  if (!form.fecha || !isValidDate(form.fecha)) return 'La fecha no es válida';
  if (form.monto <= 0) return 'El monto debe ser mayor a 0';
  if (form.factura && !form.numeroFactura.trim()) return 'Si tiene factura, ingresa el número de factura';
  return null;
}

export function validatePedido(form: Omit<Pedido, 'id' | 'createdAt'>): string | null {
  if (!form.descripcion.trim()) return 'La descripción es requerida';
  if (!form.clienteId) return 'Selecciona un cliente';
  if (form.piezas < 1) return 'Debe tener al menos 1 pieza';
  if (form.precioUnitario <= 0) return 'El precio unitario debe ser mayor a 0';
  if (!form.fechaPedido || !isValidDate(form.fechaPedido)) return 'La fecha de pedido no es válida';
  if (form.fechaEntrega && !isValidDate(form.fechaEntrega)) return 'La fecha de entrega no es válida';
  if (form.montoPagado < 0) return 'El monto pagado no puede ser negativo';
  return null;
}

export function validateCliente(form: Omit<Cliente, 'id' | 'createdAt'>): string | null {
  if (!form.nombre.trim()) return 'El nombre es requerido';
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'El email no es válido';
  return null;
}

export function validateProveedor(form: Omit<Proveedor, 'id' | 'createdAt'>): string | null {
  if (!form.nombre.trim()) return 'El nombre es requerido';
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'El email no es válido';
  return null;
}

export function validateProducto(form: Omit<Producto, 'id' | 'createdAt'>): string | null {
  if (!form.nombre.trim()) return 'El nombre es requerido';
  if (form.precio < 0) return 'El precio no puede ser negativo';
  return null;
}

export function validateEgresoRecurrente(form: Omit<EgresoRecurrente, 'id' | 'createdAt'>): string | null {
  if (!form.descripcion.trim()) return 'La descripción es requerida';
  if (form.monto <= 0) return 'El monto debe ser mayor a 0';
  if (form.diaDelMes < 1 || form.diaDelMes > 28) return 'El día debe estar entre 1 y 28';
  return null;
}
