-- Fictitious records in the isolated studio24_test database. Always rolled back.
\o /dev/null
begin;
insert into auth.users(id,email) values
 ('40000000-0000-0000-0000-000000000001','operations-admin@example.invalid'),
 ('40000000-0000-0000-0000-000000000002','operations-accountant@example.invalid'),
 ('40000000-0000-0000-0000-000000000003','operations-operator@example.invalid'),
 ('40000000-0000-0000-0000-000000000004','operations-other@example.invalid');
update public.team_members set role='contador',team_id=(select team_id from public.team_members where user_id='40000000-0000-0000-0000-000000000001') where user_id='40000000-0000-0000-0000-000000000002';
update public.team_members set role='operador',team_id=(select team_id from public.team_members where user_id='40000000-0000-0000-0000-000000000001') where user_id='40000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
select public.sync_write_record('clientes','{"id":"ops-client","nombre":"Clienta aislada"}',null,'ops-client-operation-1');
select public.sync_write_record('pedidos','{"id":"ops-order","cliente_id":"ops-client","descripcion":"Pedido aislado","monto_total":1000,"piezas":1,"precio_unitario":1000,"fecha_pedido":"2026-09-01"}',null,'ops-order-operation-1');
select public.sync_write_record('pedidos','{"id":"ops-legacy","cliente_id":"ops-client","descripcion":"Pedido anterior","monto_total":1000,"monto_pagado":500,"piezas":1,"precio_unitario":1000,"fecha_pedido":"2026-09-01"}',null,'ops-legacy-operation-1');
select public.customer_account_command('receive','41000000-0000-0000-0000-000000000001','{"clienteId":"ops-client","source":"new","amount":1000,"fecha":"2026-09-01","formaPago":"transferencia"}');
select public.customer_account_command('apply','42000000-0000-0000-0000-000000000001','{"clienteId":"ops-client","advanceId":"41000000-0000-0000-0000-000000000001","pedidoId":"ops-order","amount":400,"fecha":"2026-09-02"}');
do $$ declare months jsonb; failed boolean:=false; begin
  months:=public.get_advance_report(2026);
  assert jsonb_array_length(months)=12;
  assert (months->8->>'received')::numeric=1000;
  assert (months->8->>'receivedNet')::numeric=1000;
  assert (months->8->>'appliedNet')::numeric=0, 'an advance on an undelivered order is not distributable';
  assert (months->8->>'available')::numeric=600;
  assert (months->8->>'assigned')::numeric=400;
  update public.pedidos set estado='entregado',fecha_entrega_real='2026-10-02' where id='ops-order';
  months:=public.get_advance_report(2026);
  assert (months->8->>'appliedNet')::numeric=0;
  assert (months->9->>'appliedNet')::numeric=400, 'recognize credit in the actual delivery month';
  assert (months->9->>'assigned')::numeric=0;
  assert (select count(*)=1 from public.ingresos), 'reporting must never create cash movements';
  begin update public.pedidos set pagos='[{"id":"cash","monto":200}]',monto_pagado=200 where id='ops-legacy';
    exception when others then failed:=sqlerrm like '%importe pagado anterior%'; end;
  assert failed, 'old clients may not drop a legacy accumulated payment';
  update public.pedidos set pagos='[{"id":"legacy","monto":500,"origen":"saldo_inicial","fecha":""},{"id":"cash","monto":200,"fecha":"2026-10-01"}]',monto_pagado=700 where id='ops-legacy';
  failed:=false;
  begin update public.pedidos set pagos='[]',monto_pagado=700 where id='ops-legacy';
    exception when others then failed:=sqlerrm like '%historial de abonos%'; end;
  assert failed, 'detailed receipts cannot disappear';
  assert (select monto_pagado=700 from public.pedidos where id='ops-legacy');
  assert not has_function_privilege('authenticated','public.export_business_snapshot()','execute');
  assert not has_function_privilege('anon','public.export_business_snapshot()','execute');
  assert has_function_privilege('service_role','public.export_business_snapshot()','execute');
  assert (select provolatile='s' from pg_proc where oid='public.export_business_snapshot()'::regprocedure), 'all exported tables share one statement snapshot';
end $$;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000002',true);
do $$ declare item public.pedidos%rowtype; result jsonb; failed boolean:=false; begin
  select * into item from public.pedidos where id='ops-order';
  result:=public.save_collection_followup(item.id,item.updated_at,'2026-10-10','2026-10-20','Llamar para confirmar fecha');
  assert result->>'collection_notes'='Llamar para confirmar fecha';
  assert (result->>'monto_pagado')::numeric=400;
  assert result->'pagos'=item.pagos, 'followup metadata must not change money';
  begin perform public.save_collection_followup(item.id,null,null,null,'old form'); exception when others then failed:=sqlerrm like '%CONFLICT%'; end;
  assert failed, 'a version is mandatory';
  failed:=false;
  -- Force a distinct older timestamp; now() is stable within this test transaction.
  begin perform public.save_collection_followup(item.id,item.updated_at-interval '1 second',null,null,'old form'); exception when others then failed:=sqlerrm like '%CONFLICT%'; end;
  assert failed, 'concurrent edits cannot be overwritten';
  result:=public.get_collections(0,'','all');
  assert (result->>'total')::int=2, 'delivered, unpaid orders remain collectible';
  assert (result->>'totalPending')::numeric=900;
  assert (public.get_collections(0,'Pedido anterior','all')->>'total')::int=1;
  assert jsonb_array_length(public.get_advance_report(2026))=12;
end $$;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000003',true);
do $$ declare failed boolean:=false; begin
  begin perform public.get_collections(); exception when insufficient_privilege then failed:=true; end;
  assert failed, 'operators cannot read collections';
  failed:=false;
  begin perform public.get_advance_report(2026); exception when insufficient_privilege then failed:=true; end;
  assert failed, 'operators cannot read advance reports';
  failed:=false;
  begin perform public.save_collection_followup('ops-order',now(),null,null,'unauthorized'); exception when insufficient_privilege then failed:=true; end;
  assert failed, 'operators cannot edit collection notes';
  failed:=false;
  begin update public.pedidos set collection_notes='direct bypass' where id='ops-order'; exception when insufficient_privilege then failed:=true; end;
  assert failed, 'direct table updates cannot bypass collection write permissions';
  failed:=false;
  begin perform public.sync_write_record('pedidos','{"id":"ops-forged","descripcion":"Forged metadata","fecha_pedido":"2026-10-01","collection_notes":"Unauthorized"}',null,'operations-forged-metadata'); exception when insufficient_privilege then failed:=true; end;
  assert failed, 'new orders cannot bypass collection write permissions';
  perform public.sync_write_record('pedidos','{"id":"ops-valid","descripcion":"Production order","fecha_pedido":"2026-10-01"}',null,'operations-valid-production-order');
end $$;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000004',true);
do $$ declare failed boolean:=false; begin
  assert (public.get_collections()->>'total')::int=0, 'other teams cannot read collection data';
  begin perform public.save_collection_followup('ops-order',now(),null,null,'wrong team'); exception when insufficient_privilege then failed:=true; end;
  assert failed;
end $$;
rollback;
\o
\echo 'Operations: payment history, delivery recognition, collections and backup permissions passed.'
