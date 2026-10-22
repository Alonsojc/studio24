import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClientesPage from '@/app/clientes/page';
import CustomerAccountPage from '@/app/clientes/cuenta/page';
import CustomerAccountView from '@/components/customer-accounts/CustomerAccountView';
import type { useCustomerAccount } from '@/lib/useCustomerAccount';
import { accountFixture } from './fixtures/customer-account';

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
            ? account.ingresos
            : account.pedidos,
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
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Cuenta y movimientos', '/clientes/cuenta?cliente=client%26one'],
      ['Registrar adelanto', '/clientes/cuenta?cliente=client%26one&accion=adelanto'],
    ]);
    links[0].addEventListener('click', (event) => event.preventDefault());
    await act(async () => links[0].click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => card.querySelector<HTMLButtonElement>('button')!.click());
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Maria Nunez');
  });

  it('does not offer advance capture to an operator', async () => {
    mocks.role = 'operador';
    await act(async () => root.render(<ClientesPage />));
    expect(container.querySelector('article')?.textContent).not.toContain('Registrar adelanto');
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
