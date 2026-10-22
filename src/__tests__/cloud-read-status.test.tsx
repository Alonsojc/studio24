import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCloudStore } from '@/lib/useCloudStore';
import CloudDataStatus from '@/components/CloudDataStatus';
import { ACTIVE_USER_KEY } from '@/lib/store';

let root: Root;
let container: HTMLDivElement;
let latest: ReturnType<typeof useCloudStore<{ id: string }>>;
const key = 'bordados_clientes';
const local = () => JSON.parse(localStorage.getItem(key) || '[]');
function View({ fetcher }: { fetcher: () => Promise<{ id: string }[]> }) {
  const state = useCloudStore<{ id: string }>(local, fetcher, key);
  useEffect(() => {
    latest = state;
  });
  return <p data-testid="balance">{state.data.length} registros</p>;
}
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(ACTIVE_USER_KEY, 'owner');
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});
it('hides an unconfirmed empty result after a cold-device connection failure and offers retry', async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error('network'));
  await act(async () =>
    root.render(
      <CloudDataStatus>
        <View fetcher={fetcher} />
      </CloudDataStatus>,
    ),
  );
  expect(container.textContent).toContain('Datos sin confirmar');
  expect(container.querySelector('[data-testid="balance"]')?.closest('[hidden]')).not.toBeNull();
  fetcher.mockResolvedValue([{ id: 'confirmed' }]);
  await act(async () => container.querySelector('button')!.click());
  expect(container.querySelector('[hidden]')).toBeNull();
  expect(container.textContent).toContain('Confirmado en nube');
});
it('keeps a cached record visible when offline and preserves pending edits', async () => {
  localStorage.setItem(key, JSON.stringify([{ id: 'cached' }]));
  await act(async () =>
    root.render(
      <CloudDataStatus>
        <View fetcher={() => Promise.reject(new Error('offline'))} />
      </CloudDataStatus>,
    ),
  );
  expect(latest.data).toEqual([{ id: 'cached' }]);
  expect(container.querySelector('[hidden]')).toBeNull();
  expect(container.textContent).toContain('Mostrando datos guardados');
});
it('ignores an old request after a newer reload has completed', async () => {
  let first!: (rows: { id: string }[]) => void;
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((accept) => {
          first = accept;
        }),
    )
    .mockResolvedValueOnce([{ id: 'new' }]);
  await act(async () => root.render(<View fetcher={fetcher} />));
  await act(async () => latest.reload());
  await act(async () => first([{ id: 'stale' }]));
  expect(latest.data).toEqual([{ id: 'new' }]);
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual([{ id: 'new' }]);
});
it('does not write another session cache when a delayed read completes', async () => {
  let finish!: (rows: { id: string }[]) => void;
  await act(async () =>
    root.render(
      <View
        fetcher={() =>
          new Promise((accept) => {
            finish = accept;
          })
        }
      />,
    ),
  );
  localStorage.setItem(ACTIVE_USER_KEY, 'other');
  await act(async () => finish([{ id: 'previous-owner' }]));
  expect(localStorage.getItem(key)).toBeNull();
});
it('bounds an unresponsive request and keeps retry available', async () => {
  vi.useFakeTimers();
  await act(async () =>
    root.render(
      <CloudDataStatus>
        <View fetcher={() => new Promise(() => {})} />
      </CloudDataStatus>,
    ),
  );
  await act(async () => vi.advanceTimersByTimeAsync(20001));
  expect(latest.loading).toBe(false);
  expect(container.textContent).toContain('tardo demasiado');
  expect(container.querySelector('button')).not.toBeNull();
});

it('does not call a merged local edit confirmed in the cloud', async () => {
  localStorage.setItem(key, JSON.stringify([{ id: 'local', nombre: 'Pendiente' }]));
  localStorage.setItem(
    'bordados_sync_queue',
    JSON.stringify([
      {
        id: 'pending-edit',
        table: 'clientes',
        localKey: key,
        action: 'upsert',
        recordId: 'local',
        payload: { id: 'local', nombre: 'Pendiente' },
        createdAt: '',
        updatedAt: '',
        attempts: 0,
      },
    ]),
  );
  await act(async () =>
    root.render(
      <CloudDataStatus>
        <View fetcher={() => Promise.resolve([])} />
      </CloudDataStatus>,
    ),
  );
  expect(container.textContent).toContain('pendientes de confirmar en nube');
  expect(container.textContent).not.toContain('Confirmado en nube');
});
