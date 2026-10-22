import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClientesPage from '@/app/clientes/page';
import CustomerAccountPage from '@/app/clientes/cuenta/page';
import CustomerAccountView from '@/components/customer-accounts/CustomerAccountView';
import type { useCustomerAccount } from '@/lib/useCustomerAccount';
import { accountFixture, historicalIncomeAccount } from './fixtures/customer-account';

const mocks = vi.hoisted(() => ({
  role: 'admin',
  search: new URLSearchParams(),
  state: vi.fn(),
  cloudStore: vi.fn(),
  submit: vi.fn(),
  retry: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => mocks.search }));
vi.mock('@/components/RoleProvider', () => ({ useRole: () => ({ role: mocks.role }) }));
vi.mock('@/lib/useCustomerAccount', () => ({ useCustomerAccount: mocks.state }));
vi.mock('@/lib/useCloudStore', () => ({ useCloudStore: mocks.cloudStore }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('@/lib/customer-receipts', () => ({ openCustomerReceipt: vi.fn(), uploadCustomerReceipt: vi.fn() }));

describe('client shortcuts', () => {
  let root: Root;
  let container: HTMLDivElement;
  let state: ReturnType<typeof useCustomerAccount>;
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    mocks.role = 'admin';
    mocks.search = new URLSearchParams('cliente=client-1');
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const account = accountFixture();
    state = {
      account,
      confirmed: true,
      refreshing: false,
      busy: false,
      error: '',
      pending: [],
      refresh: vi.fn(),
      submit: mocks.submit,
      retry: mocks.retry,
    };
    mocks.state.mockImplementation(() => state);
    mocks.cloudStore.mockImplementation((_reader, _fetcher, key) => ({
      data:
        key === 'bordados_clientes'
          ? [{ ...account.cliente, id: 'client&one' }]
          : key === 'bordados_ingresos'
            ? account.ingresos.map((income) => ({ ...income, clienteId: 'client&one' }))
            : account.pedidos.map((order) => ({ ...order, clienteId: 'client&one' })),
      reload: vi.fn(),
    }));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('shows both shortcuts on the card with the correct encoded client', async () => {
    await act(async () => root.render(<ClientesPage />));
    const card = container.querySelector('article')!;
    const links = [...card.querySelectorAll('a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/clientes/cuenta?cliente=client%26one',
      '/clientes/cuenta?cliente=client%26one',
      '/clientes/cuenta?cliente=client%26one&accion=adelanto',
    ]);
    expect(links[0].textContent).toContain('Total ingresado');
    expect(links[1].textContent).toBe('Cuenta y movimientos');
    expect(links[2].textContent).toBe('Registrar adelanto');
    links[1].addEventListener('click', (event) => event.preventDefault());
    await act(async () => links[1].click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => card.querySelector<HTMLButtonElement>('button')!.click());
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Maria Nunez');
  });

  it('opens on the historical income instead of an empty advance ledger', async () => {
    state.account = historicalIncomeAccount();
    await act(async () => root.render(<CustomerAccountView clienteId="client-1" />));
    const panel = container.querySelector('[role="tabpanel"][aria-label="Ingresos"]');
    expect(panel?.textContent).toContain('Bordado de toallas');
    expect(panel?.textContent).toContain('$3,950.00');
    expect(panel?.textContent).toContain('Transferencia');
    expect(panel?.textContent).toContain('Sin pedido asociado');
    const balance = [...container.querySelectorAll('dt')].find(
      (node) => node.textContent === 'Saldo a favor disponible',
    );
    expect(balance?.nextElementSibling?.textContent).toBe('$0.00');
    const movements = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (node) => node.textContent === 'Movimientos de saldo',
    )!;
    await act(async () => movements.click());
    expect(container.querySelector('[role="tabpanel"]')?.textContent).toContain(
      'Sin movimientos de saldo en el periodo.',
    );
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.retry).not.toHaveBeenCalled();
  });

  it('does not offer advance capture to an operator', async () => {
    mocks.role = 'operador';
    await act(async () => root.render(<ClientesPage />));
    expect(container.querySelector('article')?.textContent).not.toContain('Registrar adelanto');
  });

  it('hides customers without orders by default and combines order and debt filters with sorting', async () => {
    const account = accountFixture();
    const clients = ['Ana', 'Bea', 'Caro'].map((nombre, index) => ({
      ...account.cliente!,
      id: `client-${index}`,
      nombre,
    }));
    const orders = [
      {
        ...account.pedidos[0],
        id: 'delivered',
        clienteId: 'client-0',
        estado: 'entregado',
        montoTotal: 100,
        montoPagado: 100,
      },
      { ...account.pedidos[1], id: 'open', clienteId: 'client-1', montoTotal: 500, montoPagado: 50 },
    ];
    mocks.cloudStore.mockImplementation((_reader, _fetcher, key) => ({
      data: key === 'bordados_clientes' ? clients : key === 'bordados_pedidos' ? orders : [],
      reload: vi.fn(),
    }));
    await act(async () => root.render(<ClientesPage />));
    const visible = () => [...container.querySelectorAll('article')].map((card) => card.getAttribute('aria-label'));
    const changeSelect = async (id: string, value: string) =>
      act(async () => {
        const select = container.querySelector<HTMLSelectElement>(id)!;
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
    expect(visible()).toEqual(['Ana', 'Bea']);
    expect(container.querySelector<HTMLSelectElement>('#customer-orders')?.value).toBe('with-orders');
    await changeSelect('#customer-sort', 'pending');
    expect(visible()).toEqual(['Bea', 'Ana']);
    expect(container.querySelector('article')?.textContent).toContain('Pendiente $450.00');
    await changeSelect('#customer-orders', 'active');
    expect(visible()).toEqual(['Bea']);
    await changeSelect('#customer-orders', 'all');
    expect(visible()).toEqual(['Bea', 'Ana', 'Caro']);
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(visible()).toEqual(['Bea']);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('can reveal an income-only customer hidden by the default order filter without creating a record', async () => {
    const account = historicalIncomeAccount();
    mocks.cloudStore.mockImplementation((_reader, _fetcher, key) => ({
      data: key === 'bordados_clientes' ? [account.cliente] : key === 'bordados_ingresos' ? account.ingresos : [],
      reload: vi.fn(),
    }));
    await act(async () => root.render(<ClientesPage />));
    expect(container.querySelector('article')).toBeNull();
    expect(container.textContent).toContain('0 de 1 clientes');
    const show = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Mostrar todos los clientes',
    )!;
    await act(async () => show.click());
    expect(container.querySelector('article')?.textContent).toContain('$3,950.00');
    expect(container.querySelector<HTMLSelectElement>('#customer-orders')?.value).toBe('all');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it.each(['admin', 'contador'])('opens only the receive form for %s without writing a movement', async (role) => {
    mocks.role = role;
    mocks.search.set('accion', 'adelanto');
    await act(async () => root.render(<CustomerAccountPage />));
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-label')).toBe('Registrar adelanto');
    expect(dialog.textContent).toContain('Maria Nunez');
    expect(container.querySelector<HTMLInputElement>('#account-amount')?.value).toBe('');
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.retry).not.toHaveBeenCalled();
  });

  it('does not open an editor for a regular account visit or an unknown action', async () => {
    await act(async () => root.render(<CustomerAccountPage />));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    mocks.search.set('accion', 'cancel');
    await act(async () => root.render(<CustomerAccountPage />));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('waits for a confirmed account before permitting capture and can still be closed', async () => {
    state.confirmed = false;
    await act(async () => root.render(<CustomerAccountView clienteId="client-1" initialAction="receive" />));
    expect(container.querySelector<HTMLFieldSetElement>('fieldset')?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(mocks.submit).not.toHaveBeenCalled();
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Cerrar"]')!.click());
    state.confirmed = true;
    await act(async () => root.render(<CustomerAccountView clienteId="client-1" initialAction="receive" />));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('enables the same form once the account is confirmed', async () => {
    state.confirmed = false;
    await act(async () => root.render(<CustomerAccountView clienteId="client-1" initialAction="receive" />));
    const dialog = container.querySelector('[role="dialog"]');
    state.confirmed = true;
    await act(async () => root.render(<CustomerAccountView clienteId="client-1" initialAction="receive" />));
    expect(container.querySelector('[role="dialog"]')).toBe(dialog);
    expect(container.querySelector<HTMLFieldSetElement>('fieldset')?.disabled).toBe(false);
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('does not start another capture when a command is already pending', async () => {
    state.pending = [
      { id: 'pending', owner: 'user', action: 'receive', data: { clienteId: 'client-1', fecha: '2026-10-22' } },
    ];
    await act(async () => root.render(<CustomerAccountView clienteId="client-1" initialAction="receive" />));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toContain('sin confirmacion');
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('ignores the shortcut for roles without account write permission', async () => {
    mocks.role = 'operador';
    await act(async () => root.render(<CustomerAccountView clienteId="client-1" initialAction="receive" />));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps retrying the original command available after a failed capture', async () => {
    await act(async () => root.render(<CustomerAccountView clienteId="client-1" initialAction="receive" />));
    const command = {
      id: 'pending-receipt',
      owner: 'user',
      action: 'receive' as const,
      data: { clienteId: 'client-1', fecha: '2026-10-22' },
    };
    state.confirmed = false;
    state.pending = [command];
    mocks.retry.mockResolvedValue(false);
    await act(async () => root.render(<CustomerAccountView clienteId="client-1" initialAction="receive" />));
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(mocks.retry).toHaveBeenCalledExactlyOnceWith(command);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
