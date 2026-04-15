import { describe, it, expect } from 'vitest';
import { calcISR, calcMonthData } from '@/lib/fiscal';
import type { Ingreso, Egreso } from '@/lib/types';

// Helper to create a minimal ingreso
function ing(overrides: Partial<Ingreso> & { fecha: string; monto: number }): Ingreso {
  return {
    id: Math.random().toString(),
    fecha: overrides.fecha,
    clienteId: '',
    descripcion: 'test',
    concepto: 'otro',
    monto: overrides.monto,
    iva: overrides.iva ?? 0,
    montoTotal: overrides.montoTotal ?? overrides.monto,
    formaPago: 'transferencia',
    factura: overrides.factura ?? false,
    numeroFactura: '',
    notas: '',
    createdAt: '',
    ...overrides,
  };
}

function eg(overrides: Partial<Egreso> & { fecha: string; monto: number }): Egreso {
  return {
    id: Math.random().toString(),
    fecha: overrides.fecha,
    descripcion: 'test',
    categoria: 'otro',
    subcategoria: '',
    proveedorId: '',
    monto: overrides.monto,
    iva: overrides.iva ?? 0,
    montoTotal: overrides.montoTotal ?? overrides.monto,
    formaPago: 'transferencia',
    factura: overrides.factura ?? false,
    numeroFactura: '',
    notas: '',
    createdAt: '',
    ...overrides,
  };
}

describe('calcISR', () => {
  it('returns 0 for zero or negative base', () => {
    expect(calcISR(0)).toBe(0);
    expect(calcISR(-1000)).toBe(0);
  });

  it('calculates first bracket correctly', () => {
    // 500 pesos: cuota 0 + (500 - 0) * 0.0192 = 9.60
    expect(calcISR(500)).toBeCloseTo(9.6, 2);
  });

  it('calculates second bracket correctly', () => {
    // 5000 pesos: cuota 14.32 + (5000 - 746.05) * 0.064
    const expected = 14.32 + (5000 - 746.05) * 0.064;
    expect(calcISR(5000)).toBeCloseTo(expected, 2);
  });

  it('calculates mid-range bracket correctly', () => {
    // 20000 pesos: bracket limInf=15487.72, cuota=1640.18, tasa=0.2136
    const expected = 1640.18 + (20000 - 15487.72) * 0.2136;
    expect(calcISR(20000)).toBeCloseTo(expected, 2);
  });

  it('calculates highest bracket correctly', () => {
    // 500000 pesos: bracket limInf=375975.62, cuota=117912.32, tasa=0.35
    const expected = 117912.32 + (500000 - 375975.62) * 0.35;
    expect(calcISR(500000)).toBeCloseTo(expected, 2);
  });
});

describe('calcMonthData — IVA', () => {
  it('accumulates IVA favor across months', () => {
    // January: more IVA paid than collected → saldo a favor
    const ingresos = [ing({ fecha: '2024-01-15', monto: 1000, iva: 160, factura: true })];
    const egresos = [eg({ fecha: '2024-01-10', monto: 2000, iva: 320, factura: true })];

    const { months } = calcMonthData(ingresos, egresos);

    // January: trasladado=160, acreditable=320, ivaDelMes=-160, favor=160
    expect(months[0].ivaTrasladado).toBe(160);
    expect(months[0].ivaAcreditable).toBe(320);
    expect(months[0].ivaPorPagar).toBe(0);
    expect(months[0].ivaAFavor).toBe(160);
  });

  it('applies previous month favor against current month IVA', () => {
    const ingresos = [
      ing({ fecha: '2024-01-15', monto: 1000, iva: 160, factura: true }),
      ing({ fecha: '2024-02-15', monto: 3000, iva: 480, factura: true }),
    ];
    const egresos = [
      eg({ fecha: '2024-01-10', monto: 2000, iva: 320, factura: true }),
      // No egresos in February
    ];

    const { months } = calcMonthData(ingresos, egresos);

    // Jan: favor = 160
    expect(months[0].ivaAFavor).toBe(160);
    // Feb: trasladado=480, acreditable=0, ivaDel=480, net=480-160=320
    expect(months[1].ivaFavorAnterior).toBe(160);
    expect(months[1].ivaPorPagar).toBe(320);
    expect(months[1].ivaAFavor).toBe(0);
  });

  it('ignores non-factura records for IVA', () => {
    const ingresos = [ing({ fecha: '2024-01-15', monto: 5000, iva: 0, factura: false })];
    const egresos = [eg({ fecha: '2024-01-10', monto: 3000, iva: 0, factura: false })];

    const { months } = calcMonthData(ingresos, egresos);

    expect(months[0].ivaTrasladado).toBe(0);
    expect(months[0].ivaAcreditable).toBe(0);
    expect(months[0].ivaPorPagar).toBe(0);
  });
});

describe('calcMonthData — ISR losses within year', () => {
  it('carries loss from one month to the next', () => {
    // January: loss of 5000 (egreso > ingreso)
    // February: profit of 8000
    const ingresos = [
      ing({ fecha: '2024-01-15', monto: 3000, factura: true }),
      ing({ fecha: '2024-02-15', monto: 10000, factura: true }),
    ];
    const egresos = [
      eg({ fecha: '2024-01-10', monto: 8000, factura: true }),
      eg({ fecha: '2024-02-10', monto: 2000, factura: true }),
    ];

    const { months } = calcMonthData(ingresos, egresos);

    // Jan: utilidad = 3000-8000 = -5000, ISR = 0, pérdida = 5000
    expect(months[0].utilidadMes).toBe(-5000);
    expect(months[0].isrEstimado).toBe(0);

    // Feb: utilidad = 10000-2000 = 8000, base = 8000 - 5000 = 3000
    expect(months[1].perdidaAnterior).toBe(5000);
    expect(months[1].baseISR).toBe(3000);
    expect(months[1].isrEstimado).toBeGreaterThan(0);
  });

  it('returns final year-end loss', () => {
    // Whole year loss
    const ingresos = [ing({ fecha: '2024-03-15', monto: 1000, factura: true })];
    const egresos = [eg({ fecha: '2024-03-10', monto: 5000, factura: true })];

    const { perdidaFinal } = calcMonthData(ingresos, egresos);
    expect(perdidaFinal).toBe(4000);
  });
});

describe('calcMonthData — multi-year loss carryforward', () => {
  it('applies previous year loss in January', () => {
    const ingresos = [ing({ fecha: '2024-01-15', monto: 20000, factura: true })];
    const egresos = [eg({ fecha: '2024-01-10', monto: 5000, factura: true })];

    // Without carryforward: base = 20000 - 5000 = 15000
    const { months: withoutCarry } = calcMonthData(ingresos, egresos, 0);
    expect(withoutCarry[0].baseISR).toBe(15000);

    // With 10000 carryforward: base = 15000 - 10000 = 5000
    const { months: withCarry } = calcMonthData(ingresos, egresos, 10000);
    expect(withCarry[0].baseISR).toBe(5000);
    expect(withCarry[0].perdidaEjerciciosAnteriores).toBe(10000);
  });

  it('only applies carryforward in January, not other months', () => {
    const ingresos = [
      ing({ fecha: '2024-01-15', monto: 1000, factura: true }),
      ing({ fecha: '2024-02-15', monto: 20000, factura: true }),
    ];
    const egresos: Egreso[] = [];

    const { months } = calcMonthData(ingresos, egresos, 5000);

    // January applies the 5000 carryforward
    expect(months[0].perdidaEjerciciosAnteriores).toBe(5000);
    // February should NOT have a separate carryforward application
    expect(months[1].perdidaEjerciciosAnteriores).toBe(0);
  });

  it('excess carryforward becomes intra-year loss', () => {
    // January income is less than carryforward
    const ingresos = [ing({ fecha: '2024-01-15', monto: 3000, factura: true })];
    const egresos: Egreso[] = [];

    const { months } = calcMonthData(ingresos, egresos, 10000);

    // Base = 3000 - 0 (no egresos) - 10000 (carryforward) = -7000 → ISR = 0
    expect(months[0].baseISR).toBe(0);
    expect(months[0].isrEstimado).toBe(0);
  });
});

describe('calcMonthData — only factura records count for ISR', () => {
  it('excludes non-factura ingresos from ISR base', () => {
    const ingresos = [
      ing({ fecha: '2024-01-15', monto: 10000, factura: true }),
      ing({ fecha: '2024-01-20', monto: 5000, factura: false }), // should not count
    ];
    const egresos: Egreso[] = [];

    const { months } = calcMonthData(ingresos, egresos);

    expect(months[0].ingresosFacturados).toBe(10000);
    expect(months[0].ingresosBrutos).toBe(15000);
    // ISR base should only use facturados
    expect(months[0].baseISR).toBe(10000);
  });

  it('excludes non-factura egresos from deductions', () => {
    const ingresos = [ing({ fecha: '2024-01-15', monto: 20000, factura: true })];
    const egresos = [
      eg({ fecha: '2024-01-10', monto: 8000, factura: true }),
      eg({ fecha: '2024-01-12', monto: 3000, factura: false }), // not deductible
    ];

    const { months } = calcMonthData(ingresos, egresos);

    expect(months[0].egresosDeducibles).toBe(8000);
    expect(months[0].egresosBrutos).toBe(11000);
    // ISR base: 20000 - 8000 = 12000
    expect(months[0].baseISR).toBe(12000);
  });
});
