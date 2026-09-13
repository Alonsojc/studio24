import { beforeEach, it, expect, vi } from 'vitest';
import { cloudGetClientes, cloudGetEgresosByYear } from '@/lib/store-cloud';
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
