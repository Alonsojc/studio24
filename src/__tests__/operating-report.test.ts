import { describe, it, expect } from 'vitest';
import { operatingReport, type AdvanceReportMonth } from '@/lib/operating-report';
import { calcApartadoUtilidad } from '@/lib/utilidad';
import type { Ingreso, Egreso } from '@/lib/types';

const income = (monto: number, iva = 0): Ingreso =>
  ({ id: 'i', fecha: '2026-10-02', monto, iva, montoTotal: monto + iva }) as Ingreso;
const expense = (monto: number, soloFiscal = false): Egreso =>
  ({ id: 'e', fecha: '2026-10-02', monto, montoTotal: monto * 1.16, soloFiscal }) as Egreso;
const month = (overrides: Partial<AdvanceReportMonth> = {}): AdvanceReportMonth => ({
  month: '2026-10',
  received: 0,
  receivedNet: 0,
  appliedNet: 0,
  available: 0,
  assigned: 0,
  ...overrides,
});
describe('cash and the operating result for reserves', () => {
  it('keeps an unearned advance in cash without creating a reserve', () => {
    const result = operatingReport(
      [income(1000)],
      [],
      [month({ received: 1000, receivedNet: 1000, available: 1000 })],
      '2026-10-01',
      '2026-11-01',
    );
    expect(result.cashIn).toBe(1000);
    expect(result.operatingResult).toBe(0);
    expect(calcApartadoUtilidad(result.operatingResult).reinversion).toBe(0);
  });
  it('recognizes applied advances once in the delivery period without adding cash again', () => {
    const result = operatingReport(
      [],
      [expense(100)],
      [month({ appliedNet: 500, available: 500 })],
      '2026-10-01',
      '2026-11-01',
    );
    expect(result.cashIn).toBe(0);
    expect(result.operatingResult).toBe(400);
    expect(calcApartadoUtilidad(result.operatingResult)).toMatchObject({ reinversion: 40, donacion: 8 });
  });
  it('excludes VAT and fiscal-only expenses, and includes negative application corrections', () => {
    const result = operatingReport(
      [income(1000, 160)],
      [expense(100), expense(500, true)],
      [month({ appliedNet: -50 })],
      '2026-10-01',
      '2026-11-01',
    );
    expect(result.cashFlow).toBe(1044);
    expect(result.operatingResult).toBe(850);
  });
  it('does not mix years or double count an annual range', () => {
    const rows = [month({ month: '2026-09', receivedNet: 100 }), month({ appliedNet: 100 })];
    expect(operatingReport([], [], rows, '2026-10-01', '2026-11-01').operatingResult).toBe(100);
    expect(operatingReport([], [], rows, '2026-01-01', '2027-01-01').operatingResult).toBe(0);
  });
});
