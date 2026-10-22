import type { Cliente, Ingreso, Pedido } from './types';
import { calculatePedidoPaidAmount } from './business-rules';

export const customerSortOptions = [
  { value: 'name-asc', label: 'Nombre (A-Z)' },
  { value: 'name-desc', label: 'Nombre (Z-A)' },
  { value: 'income-total', label: 'Mayor total ingresado' },
  { value: 'income-count', label: 'Mas ingresos registrados' },
  { value: 'pending', label: 'Mayor saldo pendiente' },
  { value: 'active-orders', label: 'Mas pedidos activos' },
] as const;
export type CustomerSort = (typeof customerSortOptions)[number]['value'];
export type CustomerOrderFilter = 'with-orders' | 'active' | 'all';
export interface CustomerStats {
  incomeCents: number;
  incomeCount: number;
  pendingCents: number;
  orderCount: number;
  activeOrderCount: number;
}
export const emptyCustomerStats: Readonly<CustomerStats> = {
  incomeCents: 0,
  incomeCount: 0,
  pendingCents: 0,
  orderCount: 0,
  activeOrderCount: 0,
};
const names = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

export function buildCustomerStats(ingresos: Ingreso[], pedidos: Pedido[]): Map<string, CustomerStats> {
  const result = new Map<string, CustomerStats>();
  const statsFor = (id: string) => {
    if (!result.has(id)) result.set(id, { ...emptyCustomerStats });
    return result.get(id)!;
  };
  for (const income of ingresos) {
    const stats = statsFor(income.clienteId);
    stats.incomeCents += Math.round(income.montoTotal * 100);
    stats.incomeCount++;
  }
  for (const order of pedidos) {
    const stats = statsFor(order.clienteId);
    stats.orderCount++;
    if (order.estado !== 'entregado' && order.estado !== 'cancelado') stats.activeOrderCount++;
    if (order.estado !== 'cancelado')
      stats.pendingCents += Math.max(
        0,
        Math.round(order.montoTotal * 100) - Math.round(calculatePedidoPaidAmount(order) * 100),
      );
  }
  return result;
}

export function selectCustomers(
  clientes: Cliente[],
  stats: Map<string, CustomerStats>,
  options: { search: string; sort: CustomerSort; orders: CustomerOrderFilter; onlyDebtors: boolean },
): Cliente[] {
  const search = options.search.trim().toLocaleLowerCase('es');
  return clientes
    .filter((cliente) => {
      const totals = stats.get(cliente.id) || emptyCustomerStats;
      return (
        (!search ||
          [cliente.nombre, cliente.telefono, cliente.email].some((value) =>
            (value || '').toLocaleLowerCase('es').includes(search),
          )) &&
        (options.orders !== 'with-orders' || totals.orderCount > 0) &&
        (options.orders !== 'active' || totals.activeOrderCount > 0) &&
        (!options.onlyDebtors || totals.pendingCents > 0)
      );
    })
    .sort((a, b) => {
      const left = stats.get(a.id) || emptyCustomerStats;
      const right = stats.get(b.id) || emptyCustomerStats;
      const alphabetical = names.compare(a.nombre, b.nombre) || a.id.localeCompare(b.id);
      switch (options.sort) {
        case 'name-desc':
          return -alphabetical;
        case 'income-total':
          return right.incomeCents - left.incomeCents || alphabetical;
        case 'income-count':
          return right.incomeCount - left.incomeCount || alphabetical;
        case 'pending':
          return right.pendingCents - left.pendingCents || alphabetical;
        case 'active-orders':
          return right.activeOrderCount - left.activeOrderCount || alphabetical;
        default:
          return alphabetical;
      }
    });
}
