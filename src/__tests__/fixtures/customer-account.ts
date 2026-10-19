import type { Cliente, Ingreso, Pedido } from '@/lib/types';
import type { CustomerAccount, CustomerAdvance, CustomerMovement } from '@/lib/customer-accounts';

export const accountCliente: Cliente = {
  id: 'client-1',
  nombre: 'Maria Nunez',
  telefono: '5551234567',
  email: 'cliente@example.invalid',
  direccion: '',
  logo: '',
  notas: '',
  createdAt: '2026-10-01T12:00:00Z',
};
export const accountAdvance: CustomerAdvance = {
  id: '11111111-1111-1111-1111-111111111111',
  clienteId: accountCliente.id,
  ingresoId: 'income-1',
  source: 'new',
  fecha: '2026-10-01',
  amount: 5000,
  formaPago: 'transferencia',
  referencia: 'SPEI-123',
  notas: 'Adelanto para uniformes',
  voidedAt: null,
};
export function accountOrder(id: string, total: number, paid = 0): Pedido {
  return {
    id,
    clienteId: accountCliente.id,
    descripcion: `Pedido ${id}`,
    concepto: 'solo_bordado',
    piezas: 1,
    precioUnitario: total,
    montoTotal: total,
    montoPagado: paid,
    estadoPago: paid >= total ? 'pagado' : paid > 0 ? 'parcial' : 'pendiente',
    estado: 'pendiente',
    pagos: [],
    costoMateriales: 0,
    maquina: '',
    archivoDiseno: '',
    fotos: [],
    checklist: {
      archivoListo: false,
      hilosCargados: false,
      aroColocado: false,
      estabilizador: false,
      pruebaHecha: false,
    },
    fechaPedido: '2026-10-01',
    fechaEntrega: '',
    fechaEntregaReal: '',
    urgente: false,
    notas: '',
    createdAt: '2026-10-01T12:00:00Z',
  };
}
export const accountIncome: Ingreso = {
  id: 'income-1',
  clienteId: accountCliente.id,
  fecha: '2026-10-01',
  descripcion: 'Adelanto para uniformes',
  concepto: 'otro',
  monto: 5000,
  montoTotal: 5000,
  iva: 0,
  formaPago: 'transferencia',
  factura: false,
  numeroFactura: '',
  notas: '',
  createdAt: '2026-10-01T12:00:00Z',
};
export function accountMovement(
  id: string,
  sequence: number,
  kind: CustomerMovement['kind'],
  amount: number,
  fecha: string,
): CustomerMovement {
  return {
    id,
    sequence,
    clienteId: accountCliente.id,
    advanceId: accountAdvance.id,
    pedidoId: kind === 'apply' || kind === 'reverse_application' ? 'order-1' : null,
    pedidoDescripcion: kind === 'deposit' ? '' : 'Uniformes bordados',
    kind,
    fecha,
    amount,
    referencia: '',
    notas: '',
    reversesId: null,
    operationId: id,
  };
}
export function accountFixture(): CustomerAccount {
  const movements = [
    accountMovement('deposit-1', 1, 'deposit', 5000, '2026-10-01'),
    accountMovement('apply-1', 2, 'apply', 1200, '2026-10-02'),
    accountMovement('apply-2', 3, 'apply', 800, '2026-10-03'),
    { ...accountMovement('reverse-1', 4, 'reverse_application', 800, '2026-10-04'), reversesId: 'apply-2' },
  ];
  return {
    cliente: { ...accountCliente },
    advances: [{ ...accountAdvance }],
    movements,
    pedidos: [accountOrder('order-1', 1200, 1200), accountOrder('order-2', 2000)],
    ingresos: [{ ...accountIncome }],
  };
}
