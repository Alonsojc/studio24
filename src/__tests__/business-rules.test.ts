import { describe, expect, it } from 'vitest';
import {
  applyInventoryConsumption,
  applyPedidoPayment,
  buildPedidoPayment,
  buildRepeatedPedido,
  calculateEstadoPago,
  calculatePedidoPaidAmount,
  calculatePedidoTotal,
  canCreateIngresoForPedido,
  hasIngresoForPedido,
  splitIncludedIVA,
  unrecordedOrderPayments,
} from '@/lib/business-rules';
import type { Ingreso, Pedido } from '@/lib/types';

const pedido: Pedido = {
  id: 'pedido-1',
  clienteId: 'cliente-1',
  descripcion: 'Playeras bordadas',
  concepto: 'bordado_y_prenda',
  piezas: 10,
  precioUnitario: 150,
  montoTotal: 1500,
  costoMateriales: 500,
  estado: 'entregado',
  estadoPago: 'pagado',
  montoPagado: 1500,
  pagos: [],
  maquina: '',
  archivoDiseno: '',
  fotos: [],
  inventarioUsado: [],
  checklist: {
    archivoListo: true,
    hilosCargados: true,
    aroColocado: true,
    estabilizador: true,
    pruebaHecha: true,
  },
  fechaPedido: '2026-04-01',
  fechaEntrega: '2026-04-10',
  fechaEntregaReal: '2026-04-09',
  urgente: false,
  notas: '',
  createdAt: '2026-04-01T10:00:00.000Z',
};

const ingreso: Ingreso = {
  id: 'ingreso-1',
  fecha: '2026-04-09',
  clienteId: 'cliente-1',
  pedidoId: 'pedido-1',
  descripcion: 'Playeras bordadas',
  concepto: 'bordado_y_prenda',
  monto: 1500,
  iva: 0,
  montoTotal: 1500,
  formaPago: 'transferencia',
  factura: false,
  numeroFactura: '',
  notas: '',
  createdAt: '2026-04-09T10:00:00.000Z',
};

describe('reglas de negocio de pedidos e ingresos', () => {
  it('repite un pedido sin copiar su version, cobros ni seguimiento financiero', () => {
    const source = {
      ...pedido,
      serverUpdatedAt: '2026-10-01T12:00:00Z',
      paymentDueDate: '2026-10-01',
      nextFollowupDate: '2026-10-20',
      collectionNotes: 'Original',
    };
    const copy = buildRepeatedPedido(source, {
      id: 'new-order',
      trackingToken: 'new-token',
      fechaPedido: '2026-10-22',
    });
    expect(copy).not.toHaveProperty('serverUpdatedAt');
    expect(copy).toMatchObject({
      id: 'new-order',
      montoPagado: 0,
      pagos: [],
      paymentDueDate: null,
      nextFollowupDate: null,
      collectionNotes: '',
    });
    expect(source.collectionNotes).toBe('Original');
  });
  it('calcula total y estado de pago del pedido', () => {
    expect(calculatePedidoTotal({ piezas: 3, precioUnitario: 99.99 })).toBe(299.97);
    expect(calculatePedidoPaidAmount({ montoPagado: 200, pagos: [] })).toBe(200);
    expect(
      calculatePedidoPaidAmount({
        montoPagado: 0,
        pagos: [
          { id: 'p1', fecha: '2026-04-01', formaPago: 'efectivo', monto: 100, referencia: '', createdAt: '' },
          { id: 'p2', fecha: '2026-04-02', formaPago: 'transferencia', monto: 250, referencia: 'ABC', createdAt: '' },
        ],
      }),
    ).toBe(350);
    expect(calculateEstadoPago(1000, 0)).toBe('pendiente');
    expect(calculateEstadoPago(1000, 250)).toBe('parcial');
    expect(calculateEstadoPago(1000, 1000)).toBe('pagado');
  });

  it('registra pagos parciales con historial', () => {
    const pago = buildPedidoPayment({
      id: 'pago-1',
      monto: 500,
      formaPago: 'transferencia',
      referencia: 'SPEI-1',
      now: new Date('2026-04-02T09:00:00.000Z'),
    });
    const updated = applyPedidoPayment({ ...pedido, montoPagado: 0, pagos: [], estadoPago: 'pendiente' }, pago);
    expect(updated.montoPagado).toBe(500);
    expect(updated.estadoPago).toBe('parcial');
    expect(updated.pagos?.[0]).toMatchObject({ referencia: 'SPEI-1', fecha: '2026-04-02' });
  });

  it('preserva el saldo anterior al agregar el primer abono detallado', () => {
    const pago = buildPedidoPayment({ id: 'nuevo', monto: 200, formaPago: 'efectivo' });
    const original: Pedido = { ...pedido, montoTotal: 1000, montoPagado: 500, pagos: [] };
    const updated = applyPedidoPayment(original, pago);
    expect(updated.montoPagado).toBe(700);
    expect(updated.pagos?.[0]).toMatchObject({ monto: 500, origen: 'saldo_inicial', fecha: '', formaPago: 'otro' });
    expect(original.pagos).toEqual([]);
    const next = applyPedidoPayment(updated, { ...pago, id: 'siguiente', monto: 100 });
    expect(next.montoPagado).toBe(800);
    expect(next.pagos?.filter((item) => item.origen === 'saldo_inicial')).toHaveLength(1);
  });

  it('mantiene intactos los pagos con saldo a favor al recibir efectivo adicional', () => {
    const original = {
      ...pedido,
      montoPagado: 500,
      pagos: [
        {
          id: 'credito',
          monto: 500,
          origen: 'saldo_cliente' as const,
          anticipoId: 'adelanto',
          fecha: '2026-10-01',
          formaPago: 'otro' as const,
          referencia: '',
          createdAt: '',
        },
      ],
    };
    const updated = applyPedidoPayment(
      original,
      buildPedidoPayment({ id: 'efectivo', monto: 200, formaPago: 'efectivo' }),
    );
    expect(updated.montoPagado).toBe(700);
    expect(updated.pagos?.[0]).toEqual(original.pagos[0]);
  });

  it('descuenta inventario consumido por pedido sin dejar stock negativo', () => {
    const updated = applyInventoryConsumption(
      [
        {
          id: 'hilo-1',
          nombre: 'Hilo rojo',
          categoria: 'hilo',
          unidad: 'conos',
          stock: 2,
          stockMinimo: 1,
          costo: 80,
          color: 'rojo',
          marca: '',
          ubicacion: '',
          notas: '',
          createdAt: '',
        },
      ],
      [{ itemId: 'hilo-1', cantidad: 3 }],
    );
    expect(updated[0].stock).toBe(0);
  });

  it('detecta ingresos existentes por pedido', () => {
    expect(hasIngresoForPedido([ingreso], 'pedido-1')).toBe(true);
    expect(hasIngresoForPedido([ingreso], 'pedido-2')).toBe(false);
  });

  it('solo admin o contador pueden crear ingreso desde pedido pagado', () => {
    expect(canCreateIngresoForPedido('admin', pedido, [])).toBe(true);
    expect(canCreateIngresoForPedido('contador', pedido, [])).toBe(true);
    expect(canCreateIngresoForPedido('operador', pedido, [])).toBe(false);
  });

  it('bloquea duplicados y pedidos cancelados', () => {
    expect(canCreateIngresoForPedido('admin', pedido, [ingreso])).toBe(false);
    expect(canCreateIngresoForPedido('admin', { ...pedido, estado: 'cancelado' }, [])).toBe(false);
  });

  it('separa el IVA del cobro sin aumentar el total ni perder centavos', () => {
    expect(splitIncludedIVA(1160)).toEqual({ monto: 1000, iva: 160 });
    expect(splitIncludedIVA(100)).toEqual({ monto: 86.21, iva: 13.79 });
    expect(unrecordedOrderPayments(pedido)).toEqual([expect.objectContaining({ monto: 1500, needsDetails: true })]);
    expect(canCreateIngresoForPedido('admin', { ...pedido, montoPagado: 0 }, [])).toBe(false);
  });
  it('does not generate a second income when a deposit fully paid the order', () => {
    const prepaid: Pedido = {
      ...pedido,
      pagos: [
        {
          id: 'credit',
          origen: 'saldo_cliente',
          anticipoId: 'deposit',
          monto: 1500,
          formaPago: 'otro',
          fecha: '2026-10-01',
          referencia: '',
          createdAt: '',
        },
      ],
    };
    expect(canCreateIngresoForPedido('admin', prepaid, [])).toBe(false);
    expect(unrecordedOrderPayments(prepaid)).toHaveLength(0);
  });
  it('generates only the additional collection for a partly prepaid order', () => {
    const partlyPrepaid: Pedido = {
      ...pedido,
      pagos: [
        {
          id: 'credit',
          origen: 'saldo_cliente',
          monto: 1000,
          formaPago: 'otro',
          fecha: '2026-10-01',
          referencia: '',
          createdAt: '',
        },
        { id: 'cash', fecha: '2026-10-02', monto: 500, formaPago: 'efectivo', referencia: '', createdAt: '' },
      ],
    };
    expect(unrecordedOrderPayments(partlyPrepaid)).toEqual([
      expect.objectContaining({ monto: 500, formaPago: 'efectivo', fecha: '2026-10-02', needsDetails: false }),
    ]);
    expect(
      unrecordedOrderPayments({
        ...partlyPrepaid,
        pagos: partlyPrepaid.pagos?.map((p) => (p.id === 'cash' ? { ...p, origen: 'ingreso_existente' } : p)),
      }),
    ).toHaveLength(0);
  });
});
