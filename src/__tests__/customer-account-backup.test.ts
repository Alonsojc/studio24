import { beforeEach, expect, it, vi } from 'vitest';
import { protectCustomerLedgerRestore, protectSalesLinksRestore } from '@/lib/backup-restore';
import { accountFixture, accountAdvance } from './fixtures/customer-account';
const api = vi.hoisted(() => ({ ledger: vi.fn(), links: vi.fn() }));
vi.mock('@/lib/store-cloud', () => ({
  cloudGetCustomerCreditLedger: api.ledger,
  cloudGetSalesLinksSnapshot: api.links,
}));
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
it('keeps confirmed quote and receipt links even if an older backup omits them', async () => {
  const quote = { id: 'quote', pedidoId: 'order-1' };
  const income = { id: 'income-1', pedidoId: 'order-1' };
  api.links.mockResolvedValue({ cotizaciones: [quote], pedidos: [], ingresos: [income] });
  const restored = { cotizaciones: [{ id: 'quote', pedidoId: null }], ingresos: [] };
  await protectSalesLinksRestore(restored);
  expect(restored).toEqual({ cotizaciones: [quote], ingresos: [income] });
});
it('requires full database recovery for links outside the cloud snapshot', async () => {
  api.links.mockResolvedValue({ cotizaciones: [], pedidos: [], ingresos: [] });
  await expect(protectSalesLinksRestore({ ingresos: [{ id: 'old', pedidoId: 'missing' }] })).rejects.toThrow(
    'no se recrearan cobros',
  );
});
