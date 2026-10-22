import { beforeEach, it, expect, vi } from 'vitest';
import { cloudGetClientes, cloudGetEgresosByYear, dashboardBounds, cloudGetActivePedidos } from '@/lib/store-cloud';
import { invalidateCloudCache } from '@/lib/cloud-cache';

const api = vi.hoisted(() => ({ from: vi.fn(), filters: [] as unknown[][] }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: api.from } }));
beforeEach(() => {
  localStorage.clear();
  invalidateCloudCache();
  vi.clearAllMocks();
  api.filters.length = 0;
});
function source(rows: { id: string }[]) {
  api.from.mockImplementation((table: string) => {
    let cursor = '';
    const query = {
      select: () => query,
      order: () => query,
      limit: () => query,
      gt: (_key: string, value: string) => {
        cursor = value;
        return query;
      },
      gte: (...args: unknown[]) => {
        api.filters.push(['gte', ...args]);
        return query;
      },
      lt: (...args: unknown[]) => {
        api.filters.push(['lt', ...args]);
        return query;
      },
      then: (resolve: (result: unknown) => unknown) =>
        Promise.resolve({
          data: table === 'deleted_records' ? [] : rows.filter((row) => row.id > cursor).slice(0, 200),
          error: null,
        }).then(resolve),
    };
    return query;
  });
}
it('reads beyond the API cap, even when each page is smaller than the requested limit', async () => {
  const rows = Array.from({ length: 1201 }, (_, index) => ({ id: String(index).padStart(5, '0') }));
  source(rows);
  expect(await cloudGetClientes()).toHaveLength(1201);
  expect(api.from.mock.calls.filter(([table]) => table === 'clientes')).toHaveLength(8);
  await cloudGetClientes();
  expect(api.from.mock.calls.filter(([table]) => table === 'clientes')).toHaveLength(8);
});
it('uses complete dates and a non-inclusive next-year bound', async () => {
  source([]);
  await cloudGetEgresosByYear(2026);
  expect(api.filters).toEqual([
    ['gte', 'fecha', '2026-01-01'],
    ['lt', 'fecha', '2027-01-01'],
  ]);
});
it('uses a server timestamp watermark on subsequent unfiltered downloads', async () => {
  source([{ id: 'a', updated_at: '2026-10-03T12:00:00.000Z' } as { id: string }]);
  await cloudGetClientes();
  invalidateCloudCache();
  await cloudGetClientes();
  invalidateCloudCache();
  api.filters.length = 0;
  await cloudGetClientes();
  expect(api.filters).toContainEqual(['gte', 'updated_at', '2026-10-03T12:00:00.000Z']);
});

it('reconciles a cached active order delivered on another device', async () => {
  const old = { id: 'order', estado: 'en_maquina', serverUpdatedAt: '2026-10-01T12:00:00Z' };
  localStorage.setItem('bordados_pedidos', JSON.stringify([old]));
  api.from.mockImplementation((table: string) => {
    let ids = false;
    let after = '';
    const query = {
      select: () => query,
      order: () => query,
      limit: () => query,
      not: () => query,
      in: () => {
        ids = true;
        return query;
      },
      gt: (_column: string, value: string) => {
        after = value;
        return query;
      },
      then: (accept: (result: unknown) => unknown) =>
        Promise.resolve({
          data:
            table === 'pedidos' && ids && !after
              ? [{ id: 'order', estado: 'entregado', updated_at: '2026-10-22T12:00:00Z' }]
              : [],
          error: null,
        }).then(accept),
    };
    return query;
  });
  expect(await cloudGetActivePedidos()).toMatchObject([{ id: 'order', estado: 'entregado' }]);
});

it('limits the default dashboard to this month and its comparison period, including January', () => {
  expect(dashboardBounds('mes', new Date(2026, 0, 20))).toMatchObject({ dateFrom: '2025-12-01', dateTo: '2026-02-01' });
  expect(dashboardBounds('año', new Date(2026, 4, 1))).toMatchObject({ dateFrom: '2025-01-01', dateTo: '2027-01-01' });
  expect(dashboardBounds('todo')).toBeUndefined();
});
