import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SeedData from '@/components/SeedData';

const mocks = vi.hoisted(() => ({
  restore: vi.fn(),
  mirror: vi.fn(),
  recurrentes: vi.fn(),
  backup: vi.fn(),
  useRole: vi.fn(),
  reportError: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ restoreFromIDB: mocks.restore, syncAllToIDB: mocks.mirror }));
vi.mock('@/lib/recurrentes', () => ({ generarEgresosRecurrentes: mocks.recurrentes }));
vi.mock('@/lib/auto-backup', () => ({ autoBackupIfDue: mocks.backup }));
vi.mock('@/lib/store', () => ({ getPedidos: () => [] }));
vi.mock('@/components/RoleProvider', () => ({ useRole: mocks.useRole }));
vi.mock('@/lib/sentry', () => ({ reportError: mocks.reportError }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.useRole.mockReturnValue({ role: 'admin', loading: false, error: null });
  mocks.restore.mockResolvedValue(true);
  mocks.mirror.mockResolvedValue(undefined);
  mocks.recurrentes.mockResolvedValue(0);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => vi.restoreAllMocks());

it('continues startup after recovery without reloading the document', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<SeedData />));
    expect(mocks.restore).toHaveBeenCalledOnce();
    expect(mocks.mirror).toHaveBeenCalledOnce();
    expect(mocks.recurrentes).toHaveBeenCalledOnce();
    expect(mocks.restore.mock.invocationCallOrder[0]).toBeLessThan(mocks.recurrentes.mock.invocationCallOrder[0]);
  } finally {
    await act(async () => root.unmount());
  }
});

it('does not run startup writes when permissions cannot be verified', async () => {
  mocks.useRole.mockReturnValue({ role: 'operador', loading: false, error: 'Sin conexion' });
  const root = createRoot(document.createElement('div'));
  try {
    await act(async () => root.render(<SeedData />));
    expect(mocks.restore).not.toHaveBeenCalled();
    expect(mocks.backup).not.toHaveBeenCalled();
    expect(mocks.recurrentes).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
  }
});

it('does not retry recurring writes after a failed RPC', async () => {
  mocks.recurrentes.mockRejectedValue(new Error('Sin conexion'));
  const root = createRoot(document.createElement('div'));
  try {
    await act(async () => root.render(<SeedData />));
    expect(mocks.recurrentes).toHaveBeenCalledOnce();
    expect(mocks.reportError).toHaveBeenCalledWith(expect.any(Error), { kind: 'startupRecurrentes' });
  } finally {
    await act(async () => root.unmount());
  }
});
