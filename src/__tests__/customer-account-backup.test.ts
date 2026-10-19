import { beforeEach, expect, it, vi } from 'vitest';
import { protectCustomerLedgerRestore } from '@/lib/backup-restore';
import { accountFixture, accountAdvance } from './fixtures/customer-account';
const api = vi.hoisted(() => ({ ledger: vi.fn() }));
vi.mock('@/lib/store-cloud', () => ({ cloudGetCustomerCreditLedger: api.ledger }));
beforeEach(() => {
  const fixture = accountFixture();
  api.ledger.mockResolvedValue({ ...fixture, clientes: [fixture.cliente] });
});
it('preserves authoritative ledger-linked orders, receipts and customer records during restore', async () => {
  const restored = {
    pedidos: [{ id: 'order-1', montoPagado: 0 }],
    ingresos: [{ id: 'income-1', montoTotal: 50 }],
    customerAdvances: [{ id: accountAdvance.id, amount: 999999 }],
  };
  await protectCustomerLedgerRestore(restored);
  expect(restored.pedidos[0].montoPagado).toBe(1200);
  expect(restored.ingresos[0].montoTotal).toBe(5000);
  expect(restored.customerAdvances[0].amount).toBe(5000);
});
it('rejects ledger rows missing in cloud rather than recreating cash from backup', async () => {
  await expect(protectCustomerLedgerRestore({ customerMovements: [{ id: 'missing-in-cloud' }] })).rejects.toThrow(
    'no se recrearan cobros',
  );
});
