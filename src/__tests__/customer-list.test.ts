import { describe, expect, it } from 'vitest';
import { buildCustomerStats, selectCustomers, type CustomerOrderFilter, type CustomerSort } from '@/lib/customer-list';
import { accountCliente, accountIncome, accountOrder } from './fixtures/customer-account';

const clients = ['Zoe', 'Ana', 'Álvaro', 'Bea'].map((nombre, index) => ({
  ...accountCliente,
  id: `client-${index}`,
  nombre,
}));
const incomes = [
  { ...accountIncome, id: 'big', clienteId: 'client-0', montoTotal: 1000 },
  { ...accountIncome, id: 'first', clienteId: 'client-1', montoTotal: 0.1 },
  { ...accountIncome, id: 'second', clienteId: 'client-1', montoTotal: 0.2 },
];
const orders = [
  { ...accountOrder('pending', 500, 50), clienteId: 'client-0' },
  { ...accountOrder('delivered', 100, 40), clienteId: 'client-1', estado: 'entregado' as const },
  { ...accountOrder('cancelled', 9999), clienteId: 'client-2', estado: 'cancelado' as const },
  {
    ...accountOrder('prepaid', 2000),
    clienteId: 'client-0',
    pagos: [
      {
        id: 'credit',
        monto: 2000,
        formaPago: 'otro' as const,
        fecha: '2026-10-01',
        referencia: '',
        createdAt: '',
        origen: 'saldo_cliente' as const,
      },
    ],
  },
];
const stats = buildCustomerStats(incomes, orders);
const list = (
  sort: CustomerSort = 'name-asc',
  orderFilter: CustomerOrderFilter = 'all',
  onlyDebtors = false,
  search = '',
) => selectCustomers(clients, stats, { sort, orders: orderFilter, onlyDebtors, search }).map((client) => client.nombre);

describe('customer list sorting and filters', () => {
  it('sorts Spanish names and zero-activity clients deterministically without mutating inputs', () => {
    expect(list()).toEqual(['Álvaro', 'Ana', 'Bea', 'Zoe']);
    expect(list('name-desc')).toEqual(['Zoe', 'Bea', 'Ana', 'Álvaro']);
    expect(clients.map((client) => client.nombre)).toEqual(['Zoe', 'Ana', 'Álvaro', 'Bea']);
  });
  it('separates collection amount and count and sums cents exactly', () => {
    expect(stats.get('client-1')?.incomeCents).toBe(30);
    expect(list('income-total')).toEqual(['Zoe', 'Ana', 'Álvaro', 'Bea']);
    expect(list('income-count')).toEqual(['Ana', 'Zoe', 'Álvaro', 'Bea']);
  });
  it('includes unpaid delivered orders, excludes cancellations and accounts for credit already applied', () => {
    expect(stats.get('client-0')).toMatchObject({ pendingCents: 45000, orderCount: 2, activeOrderCount: 2 });
    expect(stats.get('client-1')?.pendingCents).toBe(6000);
    expect(stats.get('client-2')?.pendingCents).toBe(0);
    expect(list('pending', 'all', true)).toEqual(['Zoe', 'Ana']);
    expect(list('active-orders')[0]).toBe('Zoe');
  });
  it('can hide zero-order customers or show only customers with active orders', () => {
    expect(list('name-asc', 'with-orders')).toEqual(['Álvaro', 'Ana', 'Zoe']);
    expect(list('name-asc', 'active')).toEqual(['Zoe']);
    expect(list('name-asc', 'all')).toContain('Bea');
  });
  it('combines searches with the order and debt filters', () => {
    expect(list('pending', 'all', true, 'ana')).toEqual(['Ana']);
    expect(list('pending', 'active', true, 'ana')).toEqual([]);
    expect(list('pending', 'all', true, 'alvaro')).toEqual([]);
  });
});
