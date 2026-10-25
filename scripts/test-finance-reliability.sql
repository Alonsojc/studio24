-- Synthetic data only; every scenario is rolled back.
\o /dev/null
begin;
insert into auth.users(id,email) values
 ('50000000-0000-0000-0000-000000000001','finance-admin@example.invalid'),
 ('50000000-0000-0000-0000-000000000002','finance-operator@example.invalid'),
 ('50000000-0000-0000-0000-000000000003','finance-other@example.invalid'),
 ('50000000-0000-0000-0000-000000000004','finance-accountant@example.invalid');
update public.team_members set role='operador',team_id=(select team_id from public.team_members where user_id='50000000-0000-0000-0000-000000000001') where user_id='50000000-0000-0000-0000-000000000002';
update public.team_members set role='contador',team_id=(select team_id from public.team_members where user_id='50000000-0000-0000-0000-000000000001') where user_id='50000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
do $$ begin
 for n in 1..55 loop
   perform public.sync_write_record('clientes',jsonb_build_object('id','directory-'||n,'nombre','Clienta '||lpad(n::text,2,'0')),null,'directory-operation-'||n);
 end loop;
end $$;
select public.sync_write_record('pedidos','{"id":"collection-order","cliente_id":"directory-1","descripcion":"Pedido sintetico","monto_total":1000,"piezas":1,"precio_unitario":1000,"fecha_pedido":"2026-10-01"}',null,'collection-order-op');
do $$ declare payload jsonb; failed boolean; result jsonb; count_before int; begin
 payload:='{"clienteId":"directory-1","pedidoId":"collection-order","applicationId":"52000000-0000-0000-0000-000000000001","amount":200,"fecha":"2026-10-03","formaPago":"transferencia","referencia":"COBRO"}';
 perform public.collect_order_payment('51000000-0000-0000-0000-000000000001',payload);
 perform public.collect_order_payment('51000000-0000-0000-0000-000000000001',payload);
 assert (select count(*)=1 from public.ingresos), 'replay must not duplicate cash';
 assert (select monto_pagado=200 and jsonb_array_length(pagos)=1 from public.pedidos where id='collection-order');
 assert (select sum(case when kind='deposit' then amount else -amount end)=0 from public.customer_account_movements), 'direct collection is fully applied, not available credit';
 failed:=false;
 begin perform public.collect_order_payment('51000000-0000-0000-0000-000000000001',payload||'{"amount":201}'); exception when others then failed:=true; end;
 assert failed, 'changed replay is rejected';
 payload:=payload||'{"applicationId":"52000000-0000-0000-0000-000000000002","amount":801}';
 failed:=false;
 begin perform public.collect_order_payment('51000000-0000-0000-0000-000000000002',payload); exception when others then failed:=true; end;
 assert failed, 'overpayment rejected';
 assert (select count(*)=1 from public.ingresos), 'failed application rolls back the cash receipt';
 assert (select count(*)=1 from public.customer_advances), 'failed application rolls back the deposit';
 failed:=false;
 begin update public.pedidos set monto_pagado=201 where id='collection-order'; exception when others then failed:=sqlerrm like 'CONFLICT:%'; end;
 assert failed, 'direct client edits cannot bypass the atomic collection';
 failed:=false;
 begin perform public.sync_write_record('pedidos','{"id":"forged-paid","monto_pagado":100,"fecha_pedido":"2026-10-01"}',null,'forged-paid-operation'); exception when others then failed:=sqlerrm like 'CONFLICT:%'; end;
 assert failed, 'new orders cannot embed unaccounted payments';
 result:=public.get_customer_directory(0,'','name-asc','all');
 assert (result->>'total')::int=55 and jsonb_array_length(result->'rows')=50;
 assert (public.get_customer_directory(1,'','name-asc','all')->'rows'->0->>'nombre')='Clienta 51';
 assert (public.get_customer_directory(0,'','name-desc','all')->'rows'->0->>'nombre')='Clienta 55';
 result:=public.get_customer_directory();
 assert (result->>'total')::int=1 and (result->>'registered')::int=55;
 assert (result->'rows'->0->>'pending_cents')::int=80000;
 assert (result->'rows'->0->>'income_cents')::int=20000;
 assert (public.get_customer_directory(0,'Clienta 55','name-asc','all')->>'total')::int=1;
 update public.pedidos set estado='entregado' where id='collection-order';
 assert (public.get_customer_directory(0,'','pending','all',true)->>'total')::int=1, 'delivered debt remains visible';
 assert (public.get_customer_directory(0,'','name-asc','active')->>'total')::int=0;
end $$;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000004',true);
select public.collect_order_payment('51000000-0000-0000-0000-000000000003','{"clienteId":"directory-1","pedidoId":"collection-order","applicationId":"52000000-0000-0000-0000-000000000003","amount":100,"fecha":"2026-10-04","formaPago":"efectivo"}');
do $$ begin assert (select monto_pagado=300 from public.pedidos where id='collection-order'); end $$;
do $$ declare failed boolean:=false; begin
 perform public.sync_write_record('egresos','{"id":"uuid-first","fecha":"2026-10-01","categoria":"otro","descripcion":"UUID fixture","uuid_cfdi":" abc-123 "}',null,'uuid-first-operation');
 begin perform public.sync_write_record('egresos','{"id":"uuid-duplicate","fecha":"2026-10-01","categoria":"otro","descripcion":"UUID fixture","uuid_cfdi":"ABC-123"}',null,'uuid-duplicate-operation');
 exception when unique_violation then failed:=true; end;
 assert failed, 'database UUID identity ignores case and whitespace';
end $$;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',true);
do $$ declare failed boolean:=false; begin
 begin perform public.get_customer_directory(); exception when others then failed:=true; end;
 assert failed, 'operators cannot read the financial directory';
 failed:=false;
 begin perform public.collect_order_payment(gen_random_uuid(),'{"clienteId":"directory-1"}'); exception when others then failed:=true; end;
 assert failed, 'operators cannot collect';
end $$;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000003',true);
do $$ declare failed boolean:=false; begin
 assert (public.get_customer_directory(0,'','name-asc','all')->>'total')::int=0;
 begin perform public.collect_order_payment(gen_random_uuid(),jsonb_build_object('clienteId','directory-1','pedidoId','collection-order','applicationId',gen_random_uuid(),'amount',10,'formaPago','efectivo'));
 exception when others then failed:=true; end;
 assert failed, 'another team cannot collect this order';
end $$;
rollback;
\o
\echo 'Atomic collection, retry, directory pagination and isolation regressions passed.'
