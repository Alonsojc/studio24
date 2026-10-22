import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import SentryBoot from '@/components/SentryBoot';

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  identify: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock('@/lib/sentry', () => ({ initSentry: mocks.init, identifySentryUser: mocks.identify }));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: mocks.getUser, onAuthStateChange: mocks.subscribe } },
}));

it('uses the initial auth event for telemetry without an extra user request', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let callback!: (event: string, session: { user: { id: string; email: string } } | null) => void;
  mocks.subscribe.mockImplementation((fn) => {
    callback = fn;
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<SentryBoot />));
    expect(mocks.init).toHaveBeenCalledOnce();
    callback('INITIAL_SESSION', { user: { id: 'user-1', email: 'private@example.invalid' } });
    expect(mocks.identify).toHaveBeenLastCalledWith({ id: 'user-1' });
    callback('SIGNED_OUT', null);
    expect(mocks.identify).toHaveBeenLastCalledWith(null);
    expect(mocks.getUser).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
  }
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});
