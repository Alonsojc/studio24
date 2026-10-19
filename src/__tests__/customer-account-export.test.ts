import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { createCustomerAccountExcel, createCustomerAccountPdf } from '@/lib/customer-account-export';
import { buildCustomerStatement } from '@/lib/customer-accounts';
import { accountFixture, accountMovement } from './fixtures/customer-account';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
beforeAll(() => vi.stubGlobal('Blob', NodeBlob));
afterAll(() => vi.unstubAllGlobals());
const input = () => {
  const account = accountFixture();
  return {
    cliente: account.cliente!,
    business: { nombreNegocio: 'Studio 24' },
    account,
    statement: buildCustomerStatement(account),
  };
};
it('exports real XLSX with numeric money, typed dates, full references and no executable user formulas', async () => {
  const data = input();
  data.cliente.nombre = '=HYPERLINK("https://example.invalid")';
  data.account.movements[0].notas = '=1+1';
  data.statement = buildCustomerStatement(data.account);
  const blob = await createCustomerAccountExcel(data);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const files = unzipSync(bytes);
  const xml = Object.entries(files)
    .filter(([name]) => name.endsWith('.xml'))
    .map(([, data]) => strFromU8(data))
    .join('\n');
  expect(xml).toContain('Estado de cuenta');
  expect(xml).toContain('Adelantos al corte');
  expect(xml).toContain('HYPERLINK');
  expect(xml).toContain('=1+1');
  expect(xml).not.toMatch(/<f[\s>]/);
  expect(xml).toContain('<v>5000</v>');
  expect(xml).toContain('<v>3800</v>');
  expect(xml).toContain('dd/mm/yyyy');
  const evidence = process.env.ACCOUNT_EXPORT_DIR;
  if (evidence) {
    mkdirSync(evidence, { recursive: true });
    writeFileSync(join(evidence, 'estado-cuenta-prueba.xlsx'), bytes);
  }
});
it('paginates PDFs including long notes and keeps the closing balance and footer', async () => {
  const data = input();
  data.cliente.nombre = 'Maria Nunez - Uniformes y Bordados';
  data.account.movements = [
    accountMovement('opening', 1, 'deposit', 5000, '2026-10-01'),
    ...Array.from({ length: 44 }, (_, index) => ({
      ...accountMovement(`application-${index}`, index + 2, 'apply', 25, '2026-10-02'),
      pedidoDescripcion: `Pedido de uniformes numero ${index + 1}`,
      notas: index === 20 ? 'Referencia y observaciones de aplicacion. '.repeat(48) : 'Aplicacion parcial confirmada',
    })),
  ];
  data.statement = buildCustomerStatement(data.account);
  expect(data.statement.closing).toBe(3900);
  const document = await createCustomerAccountPdf(data);
  expect(document.getNumberOfPages()).toBeGreaterThan(2);
  const buffer = document.output('arraybuffer');
  const text = Buffer.from(buffer).toString('latin1');
  expect(text).toContain('%PDF-');
  expect(text).toContain('3,900.00');
  expect(text).toContain('No es comprobante fiscal');
  const evidence = process.env.ACCOUNT_EXPORT_DIR;
  if (evidence) {
    mkdirSync(evidence, { recursive: true });
    writeFileSync(join(evidence, 'estado-cuenta-prueba.pdf'), new Uint8Array(buffer));
  }
});
