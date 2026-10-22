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

export function calculatePedidoCreditApplied(pedido: Pick<Pedido, 'pagos'>): number {
  return (
    Math.round(
      (pedido.pagos || [])
        .filter((pago) => pago.origen === 'saldo_cliente')
        .reduce((sum, pago) => sum + pago.monto, 0) * 100,
    ) / 100
  );
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
  const anteriores = pedido.pagos || [];
  // Older orders stored only an accumulated amount. Preserve its provenance
  // instead of dropping it when the first detailed payment is recorded.
  const saldoInicial: PagoPedido[] =
    anteriores.length === 0 && pedido.montoPagado > 0
      ? [
          {
            id: `saldo-inicial:${pago.id}`,
            fecha: '',
            formaPago: 'otro',
            monto: Math.round(pedido.montoPagado * 100) / 100,
            referencia: 'Saldo anterior sin detalle',
            origen: 'saldo_inicial',
            createdAt: pago.createdAt,
          },
        ]
      : [];
  const pagos = [...saldoInicial, ...anteriores, pago];
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

export function buildRepeatedPedido(
  pedido: Pedido,
  options: { id: string; trackingToken: string; fechaPedido: string; now?: Date },
): Pedido {
  const source = { ...pedido } as Pedido & { serverUpdatedAt?: string };
  delete source.serverUpdatedAt;
  delete source.updatedAt;
  return {
    ...source,
    id: options.id,
    trackingToken: options.trackingToken,
    estado: 'pendiente',
    estadoPago: 'pendiente',
    montoPagado: 0,
    pagos: [],
    inventarioUsado: [],
    fechaPedido: options.fechaPedido,
    fechaEntrega: '',
    fechaEntregaReal: '',
    fotos: [],
    paymentDueDate: null,
    nextFollowupDate: null,
    collectionNotes: '',
    checklist: {
      archivoListo: false,
      hilosCargados: false,
      aroColocado: false,
      estabilizador: false,
      pruebaHecha: false,
    },
    createdAt: (options.now || new Date()).toISOString(),
  };
}

export function canCreateIngresoForPedido(
  role: UserRole,
  pedido: Pick<Pedido, 'id' | 'estado' | 'estadoPago' | 'montoPagado' | 'montoTotal' | 'pagos'>,
  ingresos: Pick<Ingreso, 'pedidoId'>[],
): boolean {
  if (role !== 'admin' && role !== 'contador') return false;
  if (pedido.estado === 'cancelado') return false;
  if (pedido.montoTotal <= 0) return false;
  if (calculatePedidoCreditApplied(pedido) >= pedido.montoTotal) return false;
  if (hasIngresoForPedido(ingresos, pedido.id)) return false;
  return pedido.estadoPago === 'pagado' || pedido.montoPagado >= pedido.montoTotal;
}

export function buildIngresoFromPedido(
  pedido: Pick<Pedido, 'id' | 'clienteId' | 'descripcion' | 'concepto' | 'montoTotal' | 'pagos'>,
  opts: { id: string; conFactura: boolean; numeroFactura?: string; now?: Date },
): Ingreso {
  const credit = calculatePedidoCreditApplied(pedido);
  const cash = Math.round((pedido.montoTotal - credit) * 100) / 100;
  if (cash <= 0) throw new Error('El pedido ya esta cubierto por adelantos registrados');
  // Credit already entered cash when received. Only the additional collection is new.
  const monto = credit > 0 && opts.conFactura ? Math.round((cash / 1.16) * 100) / 100 : cash;
  const iva = opts.conFactura ? (credit > 0 ? Math.round((cash - monto) * 100) / 100 : calcIVA(monto)) : 0;
  const now = opts.now ?? new Date();
  return {
    id: opts.id,
    fecha: now.toISOString().split('T')[0],
    clienteId: pedido.clienteId,
    pedidoId: pedido.id,
    descripcion: pedido.descripcion,
    concepto: pedido.concepto,
    monto,
    iva,
    montoTotal: Math.round((monto + iva) * 100) / 100,
    formaPago: 'transferencia',
    factura: opts.conFactura,
    numeroFactura: opts.conFactura ? opts.numeroFactura || '' : '',
    notas:
      credit > 0
        ? `Cobro adicional del pedido; ${credit.toFixed(2)} cubiertos con adelantos ya registrados`
        : 'Generado desde pedido',
    createdAt: now.toISOString(),
  };
}
