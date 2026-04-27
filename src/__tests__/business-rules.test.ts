import { describe, expect, it } from 'vitest';
import {
  applyInventoryConsumption,
  applyPedidoPayment,
  buildIngresoFromPedido,
  buildPedidoPayment,
  calculateEstadoPago,
  calculatePedidoPaidAmount,
  calculatePedidoTotal,
  canCreateIngresoForPedido,
  hasIngresoForPedido,
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

  it('construye ingreso desde pedido con IVA opcional', () => {
    const built = buildIngresoFromPedido(pedido, {
      id: 'ingreso-2',
      conFactura: true,
      numeroFactura: 'ING-123',
      now: new Date('2026-04-10T12:00:00.000Z'),
    });

    expect(built).toMatchObject({
      id: 'ingreso-2',
      fecha: '2026-04-10',
      pedidoId: 'pedido-1',
      monto: 1500,
      iva: 240,
      montoTotal: 1740,
      numeroFactura: 'ING-123',
      factura: true,
    });
  });
});
