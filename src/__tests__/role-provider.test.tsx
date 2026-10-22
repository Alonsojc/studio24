import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RoleProvider from '@/components/RoleProvider';
import RouteGuard from '@/components/RouteGuard';

const mocks = vi.hoisted(() => ({ getMyProfile: vi.fn() }));
vi.mock('@/lib/roles', async (original) => ({
  ...(await original<typeof import('@/lib/roles')>()),
  getMyProfile: mocks.getMyProfile,
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/ingresos' }));
const profile = { id: 'user', role: 'admin', nombre: 'Prueba', email: 'test@example.invalid' };

describe('permission bootstrap', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.useRealTimers();
  });
  const render = () =>
    act(async () =>
      root.render(
        <RoleProvider>
          <RouteGuard>Contenido privado</RouteGuard>
        </RoleProvider>,
      ),
    );

  it('bounds a stalled permission check and retries without reloading', async () => {
    mocks.getMyProfile.mockImplementationOnce(() => new Promise(() => {})).mockResolvedValueOnce(profile);
    await render();
    expect(container.querySelector('.animate-spin')).not.toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(8000));
    expect(container.querySelector('.animate-spin')).toBeNull();
    expect(container.textContent).toContain('No se pudieron verificar tus permisos');
    expect(container.textContent).not.toContain('Contenido privado');
    await act(async () => container.querySelector('button')!.click());
    expect(mocks.getMyProfile).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe('Contenido privado');
  });

  it('ignores a late result from a timed-out attempt after retry', async () => {
    let resolveFirst!: (value: typeof profile) => void;
    mocks.getMyProfile
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ ...profile, role: 'operador' });
    await render();
    await act(async () => vi.advanceTimersByTimeAsync(8000));
    await act(async () => container.querySelector('button')!.click());
    expect(container.textContent).toContain('No tienes permiso');
    await act(async () => resolveFirst(profile));
    expect(container.textContent).not.toContain('Contenido privado');
  });

  it.each([null, new Error('Sin conexion')])('fails closed when profile verification returns %s', async (result) => {
    if (result instanceof Error) mocks.getMyProfile.mockRejectedValue(result);
    else mocks.getMyProfile.mockResolvedValue(result);
    await render();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Contenido privado');
  });
});
