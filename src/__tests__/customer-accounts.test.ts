import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  accountBalance,
  advanceBalance,
  availableIncomes,
  buildCustomerStatement,
  customerAccountToday,
  loadCustomerAccount,
  newCustomerCommand,
  pendingCustomerCommands,
  runCustomerCommand,
} from '@/lib/customer-accounts';
import {
  ACTIVE_USER_KEY,
  CUSTOMER_COMMAND_PREFIX,
  KEYS,
  getItems,
  importAllData,
  preservePendingUserData,
  clearSensitiveLocalData,
  bindLocalDataToUser,
} from '@/lib/store';
import { hasPendingSync } from '@/lib/sync-queue';
import { accountFixture, accountAdvance, accountCliente, accountMovement } from './fixtures/customer-account';

const api = vi.hoisted(() => ({ rpc: vi.fn(), response: vi.fn(), flush: vi.fn(), report: vi.fn(), upload: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: api.rpc } }));
vi.mock('@/lib/customer-receipts', () => ({ uploadCustomerReceipt: api.upload }));
vi.mock('@/lib/sync-flush', () => ({ flushPendingSync: api.flush }));
vi.mock('@/lib/sentry', () => ({ reportError: api.report }));
vi.mock('@/lib/db', () => ({
  mirrorToIDB: vi.fn(),
  removeFromIDB: vi.fn(),
  clearStudioDB: vi.fn(),
  readUserRecovery: async () => undefined,
  deleteUserRecovery: async () => undefined,
}));
const raw = () => ({
  cliente: accountCliente,
  advances: [
    {
      id: accountAdvance.id,
      cliente_id: 'client-1',
      ingreso_id: 'income-1',
      amount: 5000,
      source: 'new',
      fecha: '2026-10-01',
      forma_pago: 'transferencia',
      referencia: '',
      voided_at: null,
    },
  ],
  movements: [
    {
      id: 'deposit',
      sequence: 1,
      cliente_id: 'client-1',
      advance_id: accountAdvance.id,
      kind: 'deposit',
      amount: 5000,
      fecha: '2026-10-01',
    },
  ],
  pedidos: [],
  ingresos: [],
});
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  localStorage.setItem(ACTIVE_USER_KEY, 'owner');
  api.flush.mockResolvedValue(0);
  api.response.mockResolvedValue({ data: raw(), error: null });
  api.rpc.mockImplementation(() => ({ abortSignal: () => api.response() }));
});
describe('customer account math and statements', () => {
  it('uses the same Mexico City business date as SQL after midnight UTC', () => {
    expect(customerAccountToday(new Date('2026-10-19T23:59:59Z'))).toBe('2026-10-19');
    expect(customerAccountToday(new Date('2026-10-20T00:05:00Z'))).toBe('2026-10-19');
    expect(customerAccountToday(new Date('2026-10-20T06:00:00Z'))).toBe('2026-10-20');
  });
  it('traces applications and reversals without adding cash twice', () => {
    const account = accountFixture();
    expect(accountBalance(account.movements)).toBe(3800);
    expect(advanceBalance(accountAdvance.id, account.movements)).toBe(3800);
    expect(buildCustomerStatement(account).rows.map((row) => row.balance)).toEqual([5000, 3800, 3000, 3800]);
    expect(account.ingresos).toHaveLength(1);
  });
  it('uses opening balance before the selected period and an inclusive closing date', () => {
    const statement = buildCustomerStatement(accountFixture(), '2026-10-03', '2026-10-03');
    expect(statement.opening).toBe(3800);
    expect(statement.closing).toBe(3000);
    expect(statement.rows).toHaveLength(1);
    expect(statement.outstanding).toBe(2000);
  });
  it('handles empty periods, unordered inputs and invalid ranges', () => {
    const fixture = accountFixture();
    fixture.movements.reverse();
    expect(buildCustomerStatement(fixture).closing).toBe(3800);
    expect(buildCustomerStatement(fixture, '2026-10-05', '2026-10-06')).toMatchObject({
      opening: 3800,
      closing: 3800,
      rows: [],
    });
    expect(() => buildCustomerStatement(fixture, '2026-10-10', '2026-10-01')).toThrow();
  });
  it('sums money in cents and keeps different advances separate', () => {
    const movements = [
      accountMovement('small', 1, 'deposit', 0.3, '2026-10-01'),
      accountMovement('spend', 2, 'apply', 0.1, '2026-10-02'),
    ];
    expect(accountBalance(movements)).toBe(0.2);
    expect(advanceBalance('another', movements)).toBe(0);
  });
  it('does not offer an existing income twice, or an income attached to an order', () => {
    const account = accountFixture();
    account.ingresos.push(
      { ...account.ingresos[0], id: 'unused' },
      { ...account.ingresos[0], id: 'order', pedidoId: 'order-1' },
    );
    expect(availableIncomes(account).map((row) => row.id)).toEqual(['unused']);
  });
});
describe('cloud-confirmed money operations', () => {
  it('does not post any money if uploading the proof fails', async () => {
    api.upload.mockRejectedValueOnce(new Error('No se pudo subir el comprobante'));
    const command = newCustomerCommand('receive', {
      clienteId: 'client-1',
      fecha: '2026-10-01',
      source: 'new',
      amount: 100,
      formaPago: 'transferencia',
    });
    await expect(
      runCustomerCommand(command, new File(['test'], 'receipt.pdf', { type: 'application/pdf' })),
    ).rejects.toThrow('comprobante');
    expect(api.rpc).not.toHaveBeenCalled();
    expect(pendingCustomerCommands('client-1')).toEqual([]);
    expect(getItems(KEYS.ingresos)).toEqual([]);
  });
  it('keeps the uploaded proof in the same operation when a confirmation is lost', async () => {
    api.upload.mockResolvedValueOnce('team/operation/receipt.pdf');
    api.response.mockResolvedValueOnce({ data: null, error: { code: '', message: 'Network unavailable' } });
    const command = newCustomerCommand('receive', {
      clienteId: 'client-1',
      fecha: '2026-10-01',
      source: 'new',
      amount: 100,
      formaPago: 'transferencia',
    });
    await expect(
      runCustomerCommand(command, new File(['test'], 'receipt.pdf', { type: 'application/pdf' })),
    ).rejects.toThrow('Network');
    const pending = pendingCustomerCommands('client-1')[0];
    expect(pending.data.receiptPath).toBe('team/operation/receipt.pdf');
    await runCustomerCommand(pending);
    expect(api.upload).toHaveBeenCalledOnce();
    expect(api.rpc.mock.calls.map((args) => args[1].p_operation)).toEqual([command.id, command.id]);
    expect(pendingCustomerCommands('client-1')).toEqual([]);
  });
  it('does not manufacture local receipts or payments when SQL rejects a request', async () => {
    api.response.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'Saldo insuficiente' } });
    const command = newCustomerCommand('apply', { clienteId: 'client-1', fecha: '2026-10-02', amount: 9000 });
    await expect(runCustomerCommand(command)).rejects.toThrow('Saldo insuficiente');
    expect(pendingCustomerCommands('client-1')).toHaveLength(0);
    expect(getItems(KEYS.customerMovements)).toEqual([]);
    expect(getItems(KEYS.ingresos)).toEqual([]);
  });
  it('retains the exact operation after an uncertain response and reuses its id on retry', async () => {
    api.response.mockResolvedValueOnce({ data: null, error: { code: '', message: 'Network unavailable' } });
    const command = newCustomerCommand('receive', {
      clienteId: 'client-1',
      fecha: '2026-10-01',
      source: 'new',
      amount: 5000,
      formaPago: 'transferencia',
    });
    await expect(runCustomerCommand(command)).rejects.toThrow('Network');
    expect(pendingCustomerCommands('client-1')).toEqual([command]);
    expect(hasPendingSync()).toBe(true);
    const another = newCustomerCommand('receive', command.data);
    await expect(runCustomerCommand(another)).rejects.toThrow('Primero reintenta');
    expect(api.rpc).toHaveBeenCalledOnce();
    const account = await runCustomerCommand(pendingCustomerCommands('client-1')[0]);
    expect(accountBalance(account.movements)).toBe(5000);
    expect(api.rpc.mock.calls.map((args) => args[1].p_operation)).toEqual([command.id, command.id]);
    expect(pendingCustomerCommands('client-1')).toEqual([]);
    expect(hasPendingSync()).toBe(false);
  });
  it('checks the cache owner again before writing an RPC response', async () => {
    let finish!: (value: unknown) => void;
    api.response.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const request = loadCustomerAccount('client-1');
    await vi.waitFor(() => expect(api.rpc).toHaveBeenCalledOnce());
    localStorage.setItem(ACTIVE_USER_KEY, 'other');
    finish({ data: raw(), error: null });
    await expect(request).rejects.toThrow('sesion');
    expect(getItems(KEYS.customerAdvances)).toEqual([]);
  });
  it('recovers an unconfirmed command only for the original authenticated user', async () => {
    const command = newCustomerCommand('receive', { clienteId: 'client-1', fecha: '2026-10-01', amount: 5000 });
    localStorage.setItem(CUSTOMER_COMMAND_PREFIX + command.id, JSON.stringify(command));
    await preservePendingUserData();
    clearSensitiveLocalData();
    await bindLocalDataToUser('different');
    expect(pendingCustomerCommands('client-1')).toEqual([]);
    await bindLocalDataToUser('owner');
    expect(pendingCustomerCommands('client-1')).toEqual([command]);
  });
  it('does not replay financial ledgers or executable commands from a backup file', () => {
    importAllData(
      JSON.stringify({
        customerAdvances: [{ id: 'forged' }],
        customerMovements: [{ id: 'forged' }],
        customerCommands: [{ id: 'replay' }],
      }),
    );
    expect(getItems(KEYS.customerAdvances)).toEqual([]);
    expect(getItems(KEYS.customerMovements)).toEqual([]);
    expect(pendingCustomerCommands('client-1')).toEqual([]);
  });
});
