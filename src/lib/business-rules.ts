import type { EstadoPago, FormaPago, Ingreso, ItemInventario, PagoPedido, Pedido } from './types';
import type { UserRole } from './roles';
import { todayString } from './business-date';

export function calculatePedidoTotal(
  pedido: Pick<Pedido, 'piezas' | 'precioUnitario'> & Partial<Pick<Pedido, 'partidasCotizacion' | 'montoTotal'>>,
): number {
  if (pedido.partidasCotizacion?.length && typeof pedido.montoTotal === 'number') return pedido.montoTotal;
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
  const fecha = opts.fecha || todayString(now);
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
    partidasCotizacion: null,
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
    notas: pedido.notas.replace(/^Creado desde COT-[^\n]*(?:\n+|$)/, ''),
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
  if (calculatePedidoPaidAmount(pedido) !== pedido.montoTotal) return false;
  if (hasIngresoForPedido(ingresos, pedido.id)) return false;
  return unrecordedOrderPayments(pedido).length > 0;
}

export function unrecordedOrderPayments(pedido: Pick<Pedido, 'montoPagado' | 'pagos'>) {
  const pagos = pedido.pagos?.length
    ? pedido.pagos
    : [
        {
          id: 'legacy',
          origen: 'saldo_inicial',
          monto: pedido.montoPagado,
          fecha: '',
          formaPago: 'otro',
          referencia: '',
        } as const,
      ];
  return pagos
    .filter((pago) => pago.monto > 0 && !['saldo_cliente', 'ingreso_existente'].includes(pago.origen || ''))
    .map((pago) => ({
      ...pago,
      needsDetails: !pago.fecha || pago.origen === 'saldo_inicial' || pago.referencia === 'Pago previo registrado',
    }));
}

export function splitIncludedIVA(total: number) {
  const cents = Math.round(total * 100);
  const base = Math.round(cents / 1.16);
  return { monto: base / 100, iva: (cents - base) / 100 };
}
