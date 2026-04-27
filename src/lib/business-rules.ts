import type { EstadoPago, Ingreso, Pedido } from './types';
import type { UserRole } from './roles';
import { calcIVA } from './helpers';

export function calculatePedidoTotal(pedido: Pick<Pedido, 'piezas' | 'precioUnitario'>): number {
  return Math.round(pedido.piezas * pedido.precioUnitario * 100) / 100;
}

export function calculateEstadoPago(montoTotal: number, montoPagado: number): EstadoPago {
  if (montoTotal > 0 && montoPagado >= montoTotal) return 'pagado';
  if (montoPagado > 0) return 'parcial';
  return 'pendiente';
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
