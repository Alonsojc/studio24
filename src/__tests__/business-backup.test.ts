// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBusinessBackup, verifyBundle } from '../../scripts/business-backup.mjs';

const roots: string[] = [];
const secret = 'isolated-recovery-key-not-a-production-secret';
afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
function client() {
  const fixture = Buffer.from('private invoice fixture');
  return {
    rpc: vi.fn().mockResolvedValue({
      data: {
        schemaVersion: 2,
        createdAt: '2026-10-22',
        tables: { clientes: [{ id: 'customer-private' }], customer_account_movements: [] },
      },
      error: null,
    }),
    storage: {
      listBuckets: vi.fn().mockResolvedValue({ data: [{ id: 'facturas' }, { id: 'backups' }], error: null }),
      from: vi.fn(() => ({
        list: vi.fn(async (prefix: string) => ({
          data: prefix
            ? [{ id: 'file', name: 'factura.xml', metadata: { size: fixture.length } }]
            : [{ id: null, name: 'team' }],
          error: null,
        })),
        download: vi.fn().mockResolvedValue({ data: new Blob([fixture]), error: null }),
      })),
    },
  };
}
it('backs up actual file bytes and verifies recovery, with no plaintext in the exported artifact', async () => {
  const root = await mkdtemp(join(tmpdir(), 'backup-test-'));
  roots.push(root);
  const target = join(root, 'business.enc');
  const result = await createBusinessBackup(client(), target, secret);
  expect(result).toMatchObject({ verified: true, tables: 2, files: 3 });
  const ciphertext = await readFile(target);
  expect(ciphertext.includes(Buffer.from('customer-private'))).toBe(false);
  expect(ciphertext.includes(Buffer.from('private invoice fixture'))).toBe(false);
  await expect(verifyBundle(target, 'wrong-key-with-at-least-thirty-two-characters')).rejects.toThrow();
  ciphertext[ciphertext.length - 20] ^= 1;
  await writeFile(target, ciphertext);
  await expect(verifyBundle(target, secret)).rejects.toThrow();
});
it('fails the entire backup if any invoice cannot be downloaded', async () => {
  const root = await mkdtemp(join(tmpdir(), 'backup-test-'));
  roots.push(root);
  const api = client();
  api.storage.from.mockReturnValue({
    list: vi.fn().mockResolvedValue({ data: [{ id: 'file', name: 'invoice.xml' }], error: null }),
    download: vi.fn().mockResolvedValue({ data: null, error: { message: 'network' } }),
  });
  const target = join(root, 'incomplete.enc');
  await expect(createBusinessBackup(api, target, secret)).rejects.toThrow('download');
  await expect(readFile(target)).rejects.toThrow();
});

it('rejects evidence replaced by another device while the backup was running', async () => {
  const root = await mkdtemp(join(tmpdir(), 'backup-test-'));
  roots.push(root);
  const api = client();
  let reads = 0;
  api.storage.from.mockReturnValue({
    list: vi.fn().mockImplementation(async () => ({
      data: [{ id: 'file', name: 'invoice.xml', updated_at: ++reads === 1 ? 'old' : 'new' }],
      error: null,
    })),
    download: vi.fn().mockResolvedValue({ data: new Blob(['xml']), error: null }),
  });
  await expect(createBusinessBackup(api, join(root, 'changed.enc'), secret)).rejects.toThrow('changed');
});

it('never publishes a backup whose invoice references cannot be recovered', async () => {
  const root = await mkdtemp(join(tmpdir(), 'backup-test-'));
  roots.push(root);
  const api = client();
  api.rpc.mockResolvedValue({
    data: {
      schemaVersion: 2,
      tables: { customer_account_movements: [], ingresos: [{ id: 'income', pdf_url: 'team/missing.pdf' }] },
    },
    error: null,
  });
  await expect(createBusinessBackup(api, join(root, 'missing.enc'), secret)).rejects.toThrow('missing from Storage');
});
