import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import PasswordRecovery from '@/components/PasswordRecovery';
const update = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ updatePassword: update }));
it('validates confirmation, preserves errors and only completes after the password update succeeds', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const node = document.createElement('div');
  document.body.appendChild(node);
  const root = createRoot(node);
  const complete = vi.fn();
  try {
    await act(async () => root.render(<PasswordRecovery onComplete={complete} />));
    const fill = async (index: number, value: string) =>
      act(async () => {
        const input = node.querySelectorAll('input')[index];
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    const submit = () =>
      act(async () => {
        node.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
    await fill(0, 'test-password');
    await fill(1, 'other-password');
    await submit();
    expect(node.textContent).toContain('no coinciden');
    expect(update).not.toHaveBeenCalled();
    await fill(1, 'test-password');
    update.mockRejectedValueOnce(new Error('Expired recovery session'));
    await submit();
    expect(node.querySelector('[role="alert"]')?.textContent).toBe('Expired recovery session');
    expect(complete).not.toHaveBeenCalled();
    update.mockResolvedValueOnce(undefined);
    await submit();
    expect(update).toHaveBeenLastCalledWith('test-password');
    expect(complete).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    node.remove();
  }
});
