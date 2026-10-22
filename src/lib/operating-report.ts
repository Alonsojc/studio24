import type { Egreso, Ingreso } from './types';

export interface AdvanceReportMonth {
  month: string;
  received: number;
  receivedNet: number;
  appliedNet: number;
  available: number;
  assigned: number;
}

export function operatingReport(
  ingresos: Ingreso[],
  egresos: Egreso[],
  advances: AdvanceReportMonth[],
  from: string,
  to: string,
) {
  const cents = (value: number) => Math.round(value * 100);
  const inRange = (date: string) => date >= from && date < to;
  const income = ingresos.filter((row) => inRange(row.fecha));
  const expense = egresos.filter((row) => inRange(row.fecha) && !row.soloFiscal);
  const months = advances.filter((row) => inRange(`${row.month}-01`)).sort((a, b) => a.month.localeCompare(b.month));
  const sum = <T>(rows: T[], value: (row: T) => number) =>
    rows.reduce((total, row) => total + cents(value(row)), 0) / 100;
  const cashIn = sum(income, (row) => row.montoTotal);
  const cashOut = sum(expense, (row) => row.montoTotal);
  const advanceNet = sum(months, (row) => row.receivedNet);
  const recognizedNet = sum(months, (row) => row.appliedNet);
  return {
    cashIn,
    cashOut,
    cashFlow: (cents(cashIn) - cents(cashOut)) / 100,
    receivedAdvances: sum(months, (row) => row.received),
    availableAdvances: months.at(-1)?.available || 0,
    assignedAdvances: months.at(-1)?.assigned || 0,
    operatingResult:
      (cents(sum(income, (row) => row.monto)) -
        cents(sum(expense, (row) => row.monto)) -
        cents(advanceNet) +
        cents(recognizedNet)) /
      100,
  };
}
