import { expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
import { collectionAccountPath, collectionWhatsApp, daysOverdue, type CollectionRow } from '@/lib/collections';
import { normalizeWhatsAppPhone } from '@/lib/whatsapp';
it('does not link an order to a missing customer account', () => {
  expect(collectionAccountPath({ clienteId: 'deleted-client', clienteNombre: null })).toBeNull();
  expect(collectionAccountPath({ clienteId: 'deleted-client', clienteNombre: ' ' })).toBeNull();
  expect(collectionAccountPath({ clienteId: 'client&2', clienteNombre: 'Ana' })).toBe(
    '/clientes/cuenta?cliente=client%262',
  );
});
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
  expect(new URL(collectionWhatsApp({ ...row, clienteTelefono: '+52 444 123 4567' })!).pathname).toBe(url.pathname);
});
it('does not add a Mexican prefix to numbers that already have a country code', () => {
  expect(normalizeWhatsAppPhone('+52 55 1234 5678')).toBe('525512345678');
  expect(normalizeWhatsAppPhone('+1 (415) 555-0135')).toBe('14155550135');
  expect(normalizeWhatsAppPhone('5512345678')).toBe('525512345678');
  expect(normalizeWhatsAppPhone('55 12345')).toBe('');
});
