import { beforeEach, expect, it, vi } from 'vitest';
import { fetchCustomerDirectory } from '@/lib/useCustomerDirectory';
import { ACTIVE_TEAM_KEY, ACTIVE_USER_KEY, KEYS, getClientes } from '@/lib/store';
import { enqueueUpsert } from '@/lib/sync-queue';
const api = vi.hoisted(() => ({ rpc: vi.fn(), response: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: api.rpc } }));
vi.mock('@/lib/db', () => ({ mirrorToIDB: vi.fn(), removeFromIDB: vi.fn() }));
const options = { page: 2, search: 'Ana', sort: 'pending' as const, orders: 'all' as const, onlyDebtors: true };
const raw = {
  id: 'client',
  nombre: 'Cloud name',
  telefono: '',
  email: '',
  direccion: '',
  logo: '',
  notas: '',
  created_at: '2026-10-25',
  income_count: 2,
  income_cents: 9000,
  order_count: 3,
  active_order_count: 1,
  pending_cents: 1000,
};
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem(ACTIVE_USER_KEY, 'owner');
  localStorage.setItem(ACTIVE_TEAM_KEY, 'team');
  api.rpc.mockImplementation(() => ({ abortSignal: () => api.response() }));
  api.response.mockResolvedValue({ data: { rows: [raw], total: 101, registered: 1000 }, error: null });
});
it('requests one paginated aggregate instead of the full financial history', async () => {
  const result = await fetchCustomerDirectory(options);
  expect(api.rpc).toHaveBeenCalledExactlyOnceWith('get_customer_directory', {
    p_page: 2,
    p_search: 'Ana',
    p_sort: 'pending',
    p_orders: 'all',
    p_debtors: true,
  });
  expect(result.rows[0].stats).toMatchObject({ pendingCents: 1000, incomeCount: 2 });
  expect(getClientes()[0]).not.toHaveProperty('incomeCents');
});
it('keeps a pending local customer edit when aggregations return older fields', async () => {
  const cliente = { ...raw, nombre: 'Pending name', updatedAt: '2026-10-26' };
  localStorage.setItem(KEYS.clientes, JSON.stringify([cliente]));
  enqueueUpsert('clientes', cliente);
  const result = await fetchCustomerDirectory(options);
  expect(result.rows[0].cliente.nombre).toBe('Pending name');
  expect(getClientes()[0].nombre).toBe('Pending name');
});
it('does not commit a response after switching teams', async () => {
  api.response.mockImplementation(async () => {
    localStorage.setItem(ACTIVE_TEAM_KEY, 'another');
    return { data: { rows: [raw], total: 1, registered: 1 }, error: null };
  });
  await expect(fetchCustomerDirectory(options)).rejects.toThrow('sesion');
  expect(getClientes()).toEqual([]);
});
