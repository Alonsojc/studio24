import { expect, it, vi } from 'vitest';
import { uploadFacturaFiles } from '@/lib/cfdi-storage';
const upload = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
vi.mock('@/lib/supabase', () => ({ supabase: { storage: { from: () => ({ upload }) } } }));
vi.mock('@/lib/teams', () => ({ getMyTeamId: async () => 'team' }));
it('uses immutable paths, never upserts a previous invoice object', async () => {
  const file = new File(['xml'], 'invoice.xml', { type: 'application/xml' });
  const first = await uploadFacturaFiles('same-uuid', file);
  const second = await uploadFacturaFiles('same-uuid', file);
  expect(first.xmlPath).not.toBe(second.xmlPath);
  expect(upload.mock.calls.every((call) => call[2].upsert === false)).toBe(true);
});
