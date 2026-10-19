import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';

const url = process.env.TEST_DATABASE_URL || '';
if (!/^postgres(?:ql)?:\/\/[^/]+@(?:127\.0\.0\.1|localhost):\d+\/studio24_test$/.test(url))
  throw new Error('Only the isolated studio24_test database is allowed');
const exec = promisify(execFile);
const sql = (query) => exec('psql', [url, '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', query], { maxBuffer: 2_000_000 });
const actor = '30000000-0000-0000-0000-000000000001';
const authenticated = (query) =>
  `begin; set local role authenticated; select set_config('request.jwt.claim.sub','${actor}',true); ${query}; commit;`;
const command = (action, id, data) =>
  `do $command$ begin perform public.customer_account_command('${action}','${id}','${JSON.stringify(data).replaceAll("'", "''")}'::jsonb); end $command$`;
const client = 'concurrent-credit-client';
await sql(`insert into auth.users(id,email) values('${actor}','concurrency@example.invalid');`);
await sql(
  authenticated(`
  do $fixture$ begin
    perform public.sync_write_record('clientes','{"id":"${client}","nombre":"Concurrent test"}',null,'concurrent-client-operation');
    for i in 1..5 loop
      perform public.sync_write_record('pedidos',jsonb_build_object('id','concurrent-order-'||i,'cliente_id','${client}','descripcion','Concurrent order '||i,'fecha_pedido','2026-10-01','piezas',1,'precio_unitario',1000,'monto_total',1000),null,'concurrent-order-operation-'||i);
    end loop;
  end $fixture$
`),
);
// Make competing commands overlap after reading the balance. Without the account
// lock, both would read the old balance before either ledger insert completes.
await sql(`create function app_private.test_customer_credit_delay() returns trigger language plpgsql as $$ begin if new.cliente_id='${client}' then perform pg_sleep(0.3); end if; return new; end $$;
create trigger test_customer_credit_delay before insert on public.customer_account_movements for each row execute function app_private.test_customer_credit_delay();`);
try {
  const deposit = { clienteId: client, source: 'new', amount: 1000, fecha: '2026-10-01', formaPago: 'transferencia' };
  const id = '31000000-0000-0000-0000-000000000001';
  const receipts = await Promise.allSettled([
    sql(authenticated(command('receive', id, deposit))),
    sql(authenticated(command('receive', id, deposit))),
  ]);
  assert.equal(
    receipts.filter((result) => result.status === 'fulfilled').length,
    2,
    'concurrent retries both recover the same committed receipt',
  );
  const spends = await Promise.allSettled(
    [1, 2].map((order) =>
      sql(
        authenticated(
          command('apply', `32000000-0000-0000-0000-00000000000${order}`, {
            clienteId: client,
            advanceId: id,
            pedidoId: `concurrent-order-${order}`,
            amount: 700,
            fecha: '2026-10-02',
          }),
        ),
      ),
    ),
  );
  assert.equal(
    spends.filter((result) => result.status === 'fulfilled').length,
    1,
    'only one competing spend may succeed',
  );
  const state = JSON.parse(
    (
      await sql(
        `select jsonb_build_object('receipts',(select count(*) from public.ingresos where cliente_id='${client}'),'balance',(select sum(case when kind in ('deposit','reverse_application') then amount else -amount end) from public.customer_account_movements where cliente_id='${client}'),'paid',(select sum(monto_pagado) from public.pedidos where cliente_id='${client}'));`,
      )
    ).stdout,
  );
  assert.deepEqual(state, { receipts: 1, balance: 300, paid: 700 });
  // Two separate deposits may not overpay the same order either.
  const advance2 = '31000000-0000-0000-0000-000000000002';
  const advance3 = '31000000-0000-0000-0000-000000000003';
  await sql(authenticated(command('receive', advance2, deposit)));
  await sql(authenticated(command('receive', advance3, deposit)));
  const payments = await Promise.allSettled(
    [advance2, advance3].map((advanceId, index) =>
      sql(
        authenticated(
          command('apply', `33000000-0000-0000-0000-00000000000${index + 1}`, {
            clienteId: client,
            advanceId,
            pedidoId: 'concurrent-order-3',
            amount: 700,
            fecha: '2026-10-02',
          }),
        ),
      ),
    ),
  );
  assert.equal(
    payments.filter((result) => result.status === 'fulfilled').length,
    1,
    'separate deposits cannot concurrently overpay one order',
  );
  assert.equal(
    (await sql("select monto_pagado from public.pedidos where id='concurrent-order-3'")).stdout.trim(),
    '700',
  );
  console.log(
    'Customer credit concurrency: duplicate receipt retry, double spend and order overpayment checks passed.',
  );
} finally {
  await sql(
    'drop trigger test_customer_credit_delay on public.customer_account_movements; drop function app_private.test_customer_credit_delay();',
  );
}
