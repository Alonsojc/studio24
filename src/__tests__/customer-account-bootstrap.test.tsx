import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadCustomerAccount } from '@/lib/customer-accounts';
import { useCustomerAccount } from '@/lib/useCustomerAccount';

vi.mock('@/lib/customer-accounts', () => ({
  cachedCustomerAccount: () => ({ advances: [], movements: [], pedidos: [], ingresos: [] }),
  pendingCustomerCommands: () => [],
  loadCustomerAccount: vi.fn(),
  newCustomerCommand: vi.fn(),
  runCustomerCommand: vi.fn(),
}));

let root: Root;
let container: HTMLDivElement;
let latest: ReturnType<typeof useCustomerAccount>;
let unmounted: boolean;
function Account() {
  const state = useCustomerAccount('client');
  useEffect(() => {
    latest = state;
  });
  return <p>{state.confirmed ? 'confirmed' : 'unconfirmed'}</p>;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(loadCustomerAccount)
    .mockReset()
    .mockResolvedValue({ advances: [], movements: [], pedidos: [], ingresos: [] });
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  unmounted = false;
});
afterEach(async () => {
  if (!unmounted) await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});
it('starts confirmation asynchronously and preserves manual refresh', async () => {
  await act(async () => root.render(<Account />));
  expect(loadCustomerAccount).not.toHaveBeenCalled();
  expect(container.textContent).toBe('unconfirmed');
  await act(async () => {
    await vi.runOnlyPendingTimersAsync();
  });
  expect(loadCustomerAccount).toHaveBeenCalledOnce();
  expect(container.textContent).toBe('confirmed');
  await act(async () => {
    await latest.refresh();
  });
  expect(loadCustomerAccount).toHaveBeenCalledTimes(2);
});
it('cancels the initial request if the account unmounts before it starts', async () => {
  await act(async () => root.render(<Account />));
  await act(async () => root.unmount());
  unmounted = true;
  await act(async () => {
    await vi.runOnlyPendingTimersAsync();
  });
  expect(loadCustomerAccount).not.toHaveBeenCalled();
});
