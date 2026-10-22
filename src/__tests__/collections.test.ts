import { expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
import { collectionWhatsApp, daysOverdue, type CollectionRow } from '@/lib/collections';
it('counts business date boundaries without timezone or daylight-saving shifts', () => {
  expect(daysOverdue('2026-10-20', '2026-10-22')).toBe(2);
  expect(daysOverdue('2026-10-22', '2026-10-22')).toBe(0);
  expect(daysOverdue(null, '2026-10-22')).toBe(0);
  expect(daysOverdue('2026-11-01', '2026-10-22')).toBe(0);
});
it('prepares the actual balance and safely encodes a WhatsApp draft without sending it', () => {
  const row = {
    clienteNombre: 'Ana & Sofia',
    clienteTelefono: '444 123 4567',
    descripcion: 'Pedido #2',
    pending: 125.5,
  } as CollectionRow;
  const url = new URL(collectionWhatsApp(row)!);
  expect(url.pathname).toBe('/524441234567');
  expect(url.searchParams.get('text')).toContain('Ana & Sofia');
  expect(url.searchParams.get('text')).toContain('$125.50');
  expect(collectionWhatsApp({ ...row, clienteTelefono: '' })).toBeNull();
});
