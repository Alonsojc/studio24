import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBusinessBackup } from './business-backup.mjs';
import { localSql, restoreDrill } from './restore-drill.mjs';

const url = process.env.TEST_DATABASE_URL;
const root = await mkdtemp(join(tmpdir(), 'studio24-restore-test-'));
let restoredTables = [];
try {
  const records = JSON.parse(
    await localSql(
      url,
      `
begin;
insert into auth.users(id,email) values('60000000-0000-0000-0000-000000000001','restore@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000001',true) where false;
do $$ begin
 perform set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000001',true);
 perform public.sync_write_record('clientes','{"id":"restore-client","nombre":"Synthetic restore"}',null,'restore-client-operation');
 perform public.sync_write_record('proveedores','{"id":"restore-supplier","nombre":"Synthetic supplier","rfc":"SYNTHETIC"}',null,'restore-supplier-operation');
 perform public.sync_write_record('pedidos','{"id":"restore-order","cliente_id":"restore-client","descripcion":"Restore fixture","fecha_pedido":"2026-10-01","monto_total":100,"piezas":1,"precio_unitario":100}',null,'restore-order-operation');
 perform public.collect_order_payment('61000000-0000-0000-0000-000000000001','{"clienteId":"restore-client","pedidoId":"restore-order","applicationId":"62000000-0000-0000-0000-000000000001","amount":50,"fecha":"2026-10-02","formaPago":"efectivo"}');
end $$;
reset role;
update public.ingresos set xml_url='fixture-team/fixture.xml';
select public.export_business_snapshot();
rollback;
`,
    ),
  );
  const fixture = Buffer.from('<synthetic-invoice/>');
  const api = {
    rpc: async () => ({ data: records, error: null }),
    storage: {
      listBuckets: async () => ({ data: [{ id: 'facturas' }], error: null }),
      from: () => ({
        list: async (prefix) => ({
          data: prefix
            ? [{ id: 'fixture', name: 'fixture.xml', metadata: { size: fixture.length } }]
            : [{ id: null, name: 'fixture-team' }],
          error: null,
        }),
        download: async () => ({ data: new Blob([fixture]), error: null }),
      }),
    },
  };
  const file = join(root, 'synthetic.enc');
  const key = 'isolated-restore-drill-fixture-key-only';
  await createBusinessBackup(api, file, key);
  const drifted = structuredClone(records);
  const driftFile = join(root, 'schema-drift.enc');
  const driftApi = { ...api, rpc: async () => ({ data: drifted, error: null }) };
  delete drifted.tables.proveedores[0].rfc;
  await createBusinessBackup(driftApi, driftFile, key);
  await assert.rejects(
    restoreDrill(driftFile, key, url),
    /Backup schema mismatch for proveedores: 1 missing, 0 unknown columns/,
  );
  drifted.tables.proveedores[0].rfc = 'SYNTHETIC';
  drifted.tables.proveedores[0].unknown_field = 'private-fixture-must-not-be-logged';
  await createBusinessBackup(driftApi, driftFile, key);
  await assert.rejects(
    restoreDrill(driftFile, key, url),
    /Backup schema mismatch for proveedores: 0 missing, 1 unknown columns/,
  );
  const result = await restoreDrill(file, key, url);
  restoredTables = Object.keys(records.tables).filter((table) => table !== 'inpc');
  assert.equal(result.restored, true);
  assert.equal(result.restoredObjects, 1);
  assert.equal(
    await localSql(
      url,
      "select monto_pagado=50 and jsonb_array_length(pagos)=1 from public.pedidos where id='restore-order';",
    ),
    't',
  );
  assert.equal(await localSql(url, 'select sum(monto_total)=50 from public.ingresos;'), 't');
  assert.equal(
    await localSql(
      url,
      `begin;
set local role authenticated;
do $$ begin
 perform set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000001',true);
 perform public.collect_order_payment('61000000-0000-0000-0000-000000000002','{"clienteId":"restore-client","pedidoId":"restore-order","applicationId":"62000000-0000-0000-0000-000000000002","amount":10,"fecha":"2026-10-03","formaPago":"efectivo"}');
end $$;
select monto_pagado=60 from public.pedidos where id='restore-order';
rollback;`,
    ),
    't',
  );
  await assert.rejects(restoreDrill(file, key, url), /not empty/);
  console.log(
    'Encrypted backup restored into PostgreSQL: exact rows, foreign keys, ledger totals and file bytes verified.',
  );
} finally {
  if (restoredTables.length) {
    // The target was proven empty before loading this synthetic fixture.
    await localSql(
      url,
      `truncate ${restoredTables.map((table) => `public."${table}"`).join(',')},auth.users restart identity cascade;`,
    );
  }
  await rm(root, { recursive: true, force: true });
}
