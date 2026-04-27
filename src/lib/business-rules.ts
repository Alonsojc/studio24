import type { EstadoPago, FormaPago, Ingreso, ItemInventario, PagoPedido, Pedido } from './types';
import type { UserRole } from './roles';
import { calcIVA } from './helpers';

export function calculatePedidoTotal(pedido: Pick<Pedido, 'piezas' | 'precioUnitario'>): number {
  return Math.round(pedido.piezas * pedido.precioUnitario * 100) / 100;
}

export function calculatePedidoPaidAmount(pedido: Pick<Pedido, 'montoPagado' | 'pagos'>): number {
  const pagos = pedido.pagos || [];
  if (pagos.length === 0) return Math.round((pedido.montoPagado || 0) * 100) / 100;
  return Math.round(pagos.reduce((sum, pago) => sum + Math.max(0, pago.monto || 0), 0) * 100) / 100;
}

export function calculateEstadoPago(montoTotal: number, montoPagado: number): EstadoPago {
  if (montoTotal > 0 && montoPagado >= montoTotal) return 'pagado';
  if (montoPagado > 0) return 'parcial';
  return 'pendiente';
}

export function buildPedidoPayment(opts: {
  id: string;
  monto: number;
  formaPago: FormaPago;
  referencia?: string;
  fecha?: string;
  now?: Date;
}): PagoPedido {
  const now = opts.now ?? new Date();
  const fecha = opts.fecha || now.toISOString().split('T')[0];
  return {
    id: opts.id,
    fecha,
    formaPago: opts.formaPago,
    monto: Math.round(Math.max(0, opts.monto) * 100) / 100,
    referencia: opts.referencia || '',
    createdAt: now.toISOString(),
  };
}

export function applyPedidoPayment<T extends Pick<Pedido, 'montoTotal' | 'montoPagado' | 'estadoPago' | 'pagos'>>(
  pedido: T,
  pago: PagoPedido,
): T {
  const pagos = [...(pedido.pagos || []), pago];
  const montoPagado = calculatePedidoPaidAmount({ montoPagado: pedido.montoPagado, pagos });
  return {
    ...pedido,
    pagos,
    montoPagado,
    estadoPago: calculateEstadoPago(pedido.montoTotal, montoPagado),
  };
}

export function applyInventoryConsumption(
  inventario: ItemInventario[],
  consumos: NonNullable<Pedido['inventarioUsado']>,
): ItemInventario[] {
  return inventario.map((item) => {
    const total = consumos
      .filter((consumo) => consumo.itemId === item.id)
      .reduce((sum, consumo) => sum + Math.max(0, consumo.cantidad || 0), 0);
    if (total === 0) return item;
    return { ...item, stock: Math.max(0, Math.round((item.stock - total) * 100) / 100) };
  });
}

export function hasIngresoForPedido(ingresos: Pick<Ingreso, 'pedidoId'>[], pedidoId: string): boolean {
  if (!pedidoId) return false;
  return ingresos.some((ingreso) => ingreso.pedidoId === pedidoId);
}

export function canCreateIngresoForPedido(
  role: UserRole,
  pedido: Pick<Pedido, 'id' | 'estado' | 'estadoPago' | 'montoPagado' | 'montoTotal'>,
  ingresos: Pick<Ingreso, 'pedidoId'>[],
): boolean {
  if (role !== 'admin' && role !== 'contador') return false;
  if (pedido.estado === 'cancelado') return false;
  if (pedido.montoTotal <= 0) return false;
  if (hasIngresoForPedido(ingresos, pedido.id)) return false;
  return pedido.estadoPago === 'pagado' || pedido.montoPagado >= pedido.montoTotal;
}

export function buildIngresoFromPedido(
  pedido: Pick<Pedido, 'id' | 'clienteId' | 'descripcion' | 'concepto' | 'montoTotal'>,
  opts: { id: string; conFactura: boolean; numeroFactura?: string; now?: Date },
): Ingreso {
  const iva = opts.conFactura ? calcIVA(pedido.montoTotal) : 0;
  const now = opts.now ?? new Date();
  return {
    id: opts.id,
    fecha: now.toISOString().split('T')[0],
    clienteId: pedido.clienteId,
    pedidoId: pedido.id,
    descripcion: pedido.descripcion,
    concepto: pedido.concepto,
    monto: pedido.montoTotal,
    iva,
    montoTotal: pedido.montoTotal + iva,
    formaPago: 'transferencia',
    factura: opts.conFactura,
    numeroFactura: opts.conFactura ? opts.numeroFactura || '' : '',
    notas: 'Generado desde pedido',
    createdAt: now.toISOString(),
  };
}
