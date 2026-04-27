import { describe, expect, it } from 'vitest';
import { calculateMachineLoads, isPedidoOverdue } from '@/lib/production-capacity';
import type { Pedido } from '@/lib/types';

const basePedido: Pedido = {
  id: 'p1',
  clienteId: 'c1',
  descripcion: 'Playeras',
  concepto: 'bordado_y_prenda',
  piezas: 10,
  precioUnitario: 100,
  montoTotal: 1000,
  costoMateriales: 200,
  estado: 'aprobado',
  estadoPago: 'pendiente',
  montoPagado: 0,
  pagos: [],
  maquina: 'Tajima SAI #1',
  archivoDiseno: '',
  fotos: [],
  inventarioUsado: [],
  checklist: {
    archivoListo: false,
    hilosCargados: false,
    aroColocado: false,
    estabilizador: false,
    pruebaHecha: false,
  },
  fechaPedido: '2026-04-01',
  fechaEntrega: '2026-04-20',
  fechaEntregaReal: '',
  urgente: false,
  notas: '',
  createdAt: '2026-04-01T00:00:00.000Z',
};

describe('capacidad de producción', () => {
  it('detecta pedidos atrasados con fecha prometida', () => {
    expect(isPedidoOverdue(basePedido, new Date('2026-04-21T09:00:00.000Z'))).toBe(true);
    expect(isPedidoOverdue({ ...basePedido, estado: 'entregado' }, new Date('2026-04-21T09:00:00.000Z'))).toBe(false);
  });

  it('agrupa carga por máquina priorizando atrasos y urgentes', () => {
    const loads = calculateMachineLoads(
      [
        basePedido,
        { ...basePedido, id: 'p2', maquina: 'Tajima SAI #1', piezas: 5, urgente: true },
        { ...basePedido, id: 'p3', maquina: '', piezas: 2, estado: 'cancelado' },
      ],
      new Date('2026-04-21T09:00:00.000Z'),
    );

    expect(loads).toEqual([
      {
        maquina: 'Tajima SAI #1',
        pedidos: 2,
        piezas: 15,
        urgentes: 1,
        atrasados: 2,
      },
    ]);
  });
});
