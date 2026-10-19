-- Fictitious data, isolated studio24_test database only. Always rolled back.
\o /dev/null
begin;
insert into auth.users(id,email) values
 ('20000000-0000-0000-0000-000000000001','credit-admin@example.invalid'),
 ('20000000-0000-0000-0000-000000000002','credit-operator@example.invalid'),
 ('20000000-0000-0000-0000-000000000003','credit-other@example.invalid'),
 ('20000000-0000-0000-0000-000000000004','credit-accountant@example.invalid');
update public.team_members set role='operador',team_id=(select team_id from public.team_members where user_id='20000000-0000-0000-0000-000000000001') where user_id='20000000-0000-0000-0000-000000000002';
update public.team_members set role='contador',team_id=(select team_id from public.team_members where user_id='20000000-0000-0000-0000-000000000001') where user_id='20000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
select public.sync_write_record('clientes','{"id":"credit-client","nombre":"Clienta prueba"}',null,'credit-client-operation');
select public.sync_write_record('clientes','{"id":"credit-client-two","nombre":"Otra clienta"}',null,'credit-client-operation-2');
select public.sync_write_record('pedidos','{"id":"credit-order-1","cliente_id":"credit-client","descripcion":"Pedido A","piezas":1,"precio_unitario":1000,"monto_total":1000,"fecha_pedido":"2026-10-01"}',null,'credit-order-operation1');
select public.sync_write_record('pedidos','{"id":"credit-order-2","cliente_id":"credit-client","descripcion":"Pedido B","piezas":1,"precio_unitario":2000,"monto_total":2000,"fecha_pedido":"2026-10-01"}',null,'credit-order-operation2');
select public.sync_write_record('pedidos','{"id":"credit-order-old","cliente_id":"credit-client","descripcion":"Pago previo","piezas":1,"precio_unitario":1000,"monto_total":1000,"monto_pagado":150,"fecha_pedido":"2026-10-01"}',null,'credit-order-operation3');
select public.sync_write_record('pedidos','{"id":"credit-order-other","cliente_id":"credit-client-two","descripcion":"Otro pedido","piezas":1,"precio_unitario":1000,"monto_total":1000,"fecha_pedido":"2026-10-01"}',null,'credit-order-operation4');
select public.sync_write_record('ingresos','{"id":"credit-existing-income","cliente_id":"credit-client","descripcion":"Ingreso existente","concepto":"otro","monto":500,"monto_total":500,"fecha":"2026-10-01","forma_pago":"transferencia"}',null,'credit-income-operation1');
do $$ declare result jsonb; failed boolean; count_before int; begin
 select count(*) into count_before from public.ingresos;
 result:=public.customer_account_command('receive','21000000-0000-0000-0000-000000000001','{"clienteId":"credit-client","source":"new","amount":1000,"fecha":"2026-10-02","formaPago":"transferencia","referencia":"DEP-1"}');
 assert jsonb_array_length(result->'advances')=1;
 assert (select count(*)=count_before+1 from public.ingresos), 'new deposit creates exactly one receipt';
 perform public.customer_account_command('receive','21000000-0000-0000-0000-000000000001','{"clienteId":"credit-client","source":"new","amount":1000,"fecha":"2026-10-02","formaPago":"transferencia","referencia":"DEP-1"}');
 assert (select count(*)=count_before+1 from public.ingresos), 'lost response retry must not duplicate cash';
 failed:=false;
 begin perform public.customer_account_command('receive','21000000-0000-0000-0000-000000000001','{"clienteId":"credit-client","amount":999}'); exception when others then failed:=true; end;
 assert failed, 'operation ids cannot be reused with different data';
 perform public.customer_account_command('receive','21000000-0000-0000-0000-000000000002','{"clienteId":"credit-client","source":"existing","ingresoId":"credit-existing-income","fecha":"2026-10-02"}');
 assert (select count(*)=count_before+1 from public.ingresos), 'linking an existing receipt never creates cash';
 failed:=false;
 begin perform public.customer_account_command('receive','21000000-0000-0000-0000-000000000003','{"clienteId":"credit-client","source":"existing","ingresoId":"credit-existing-income"}'); exception when others then failed:=true; end;
 assert failed, 'one receipt cannot fund multiple active deposits';
 failed:=false;
 begin perform public.customer_account_command('receive','21000000-0000-0000-0000-000000000004','{"clienteId":"credit-client","source":"new","amount":0.001,"formaPago":"efectivo"}'); exception when others then failed:=true; end;
 assert failed, 'fractional cents must not be silently rounded';
 perform public.customer_account_command('apply','22000000-0000-0000-0000-000000000001','{"clienteId":"credit-client","advanceId":"21000000-0000-0000-0000-000000000001","pedidoId":"credit-order-1","amount":200,"fecha":"2026-10-03"}');
 perform public.customer_account_command('apply','22000000-0000-0000-0000-000000000002','{"clienteId":"credit-client","advanceId":"21000000-0000-0000-0000-000000000001","pedidoId":"credit-order-2","amount":300,"fecha":"2026-10-03"}');
 assert (select monto_pagado=200 and estado_pago='parcial' from public.pedidos where id='credit-order-1');
 assert (select count(*)=count_before+1 from public.ingresos), 'applying credit never creates another receipt';
 failed:=false;
 begin perform public.customer_account_command('apply','22000000-0000-0000-0000-000000000003','{"clienteId":"credit-client","advanceId":"21000000-0000-0000-0000-000000000001","pedidoId":"credit-order-2","amount":501,"fecha":"2026-10-03"}'); exception when others then failed:=true; end;
 assert failed, 'available balance cannot be exceeded';
 failed:=false;
 begin perform public.customer_account_command('apply','22000000-0000-0000-0000-000000000004','{"clienteId":"credit-client","advanceId":"21000000-0000-0000-0000-000000000001","pedidoId":"credit-order-other","amount":1,"fecha":"2026-10-03"}'); exception when others then failed:=true; end;
 assert failed, 'credit cannot pay another customers order';
 failed:=false;
 begin update public.pedidos set pagos='[]',monto_pagado=0 where id='credit-order-1'; exception when others then failed:=true; end;
 assert failed, 'generic editing cannot erase ledger-owned payments';
 failed:=false;
 begin delete from public.clientes where id='credit-client'; exception when others then failed:=sqlerrm like 'CONFLICT:%'; end;
 assert failed, 'deleting a customer with ledger history creates an explicit sync conflict';
 failed:=false;
 begin delete from public.pedidos where id='credit-order-1'; exception when others then failed:=sqlerrm like 'CONFLICT:%'; end;
 assert failed, 'deleting an order with ledger history creates an explicit sync conflict';
 failed:=false;
 begin update public.ingresos set monto_total=900 where id='credit-existing-income'; exception when others then failed:=true; end;
 assert failed, 'linked receipts must not change their amount';
 failed:=false;
 begin insert into public.customer_account_movements(id,team_id,user_id,cliente_id,advance_id,kind,fecha,amount,operation_id,request)
 values('forged',app_private.current_user_team_id(),auth.uid(),'credit-client','21000000-0000-0000-0000-000000000001','deposit','2026-10-03',99999,gen_random_uuid(),'{}'); exception when insufficient_privilege then failed:=true; end;
 assert failed, 'ledger writes require the guarded transaction';
 failed:=false;
 begin perform public.customer_account_command('cancel','23000000-0000-0000-0000-000000000001','{"clienteId":"credit-client","advanceId":"21000000-0000-0000-0000-000000000001","fecha":"2026-10-03","notas":"error"}'); exception when others then failed:=true; end;
 assert failed, 'an applied advance cannot be cancelled';
 perform public.customer_account_command('reverse_application','24000000-0000-0000-0000-000000000001','{"clienteId":"credit-client","movementId":"22000000-0000-0000-0000-000000000001","fecha":"2026-10-04","notas":"Correccion de pedido"}');
 assert (select monto_pagado=0 from public.pedidos where id='credit-order-1');
 failed:=false;
 begin perform public.customer_account_command('reverse_application','24000000-0000-0000-0000-000000000002','{"clienteId":"credit-client","movementId":"22000000-0000-0000-0000-000000000001","fecha":"2026-10-04"}'); exception when others then failed:=true; end;
 assert failed, 'a payment cannot be reversed twice';
 perform public.customer_account_command('apply','22000000-0000-0000-0000-000000000005','{"clienteId":"credit-client","advanceId":"21000000-0000-0000-0000-000000000001","pedidoId":"credit-order-old","amount":200,"fecha":"2026-10-04"}');
 assert (select monto_pagado=350 and jsonb_array_length(pagos)=2 from public.pedidos where id='credit-order-old'), 'legacy paid amounts must be preserved';
 failed:=false;
 begin perform public.sync_write_record('ingresos','{"id":"credit-duplicate-order","cliente_id":"credit-client","pedido_id":"credit-order-old","monto_total":1000,"monto":1000,"fecha":"2026-10-04","descripcion":"Duplicado","concepto":"otro"}',null,'credit-wrong-income-operation'); exception when others then failed:=sqlerrm like '%registra solo el cobro adicional%'; end;
 assert failed, 'generating a whole-sale income would duplicate credit cash';
 perform public.customer_account_command('cancel','23000000-0000-0000-0000-000000000002','{"clienteId":"credit-client","advanceId":"21000000-0000-0000-0000-000000000002","fecha":"2026-10-04","notas":"Desvincular captura"}');
 assert (select monto_total=500 from public.ingresos where id='credit-existing-income'), 'cancelling a linked existing advance must preserve the original receipt';
 perform public.customer_account_command('receive','21000000-0000-0000-0000-000000000007','{"clienteId":"credit-client","source":"existing","ingresoId":"credit-existing-income","fecha":"2026-10-03"}');
 assert (select fecha>='2026-10-04'::date from public.customer_advances where id='21000000-0000-0000-0000-000000000007'), 'relinking must not precede the cancellation of its previous advance';
 assert (select sum(case when m.kind in ('deposit','reverse_application') then m.amount else -m.amount end)=500
   from public.customer_account_movements m join public.customer_advances a on a.id=m.advance_id
   where a.ingreso_id='credit-existing-income' and m.fecha<'2026-10-04'), 'relinking must not double the historical balance of the same receipt';
 perform public.customer_account_command('receive','21000000-0000-0000-0000-000000000005','{"clienteId":"credit-client","source":"new","amount":100,"fecha":"2026-10-04","formaPago":"efectivo"}');
 perform public.customer_account_command('cancel','23000000-0000-0000-0000-000000000003','{"clienteId":"credit-client","advanceId":"21000000-0000-0000-0000-000000000005","fecha":"2026-10-04","notas":"Error de captura, no fue un cobro real"}');
 assert (select monto_total=0 from public.ingresos where id=(select ingreso_id from public.customer_advances where id='21000000-0000-0000-0000-000000000005'));
end $$;
do $$ declare path text; failed boolean:=false; begin
 path:=app_private.current_user_team_id()::text||'/21000000-0000-0000-0000-000000000006/receipt.pdf';
 insert into storage.objects(bucket_id,name) values('customer-receipts',path);
 perform public.customer_account_command('receive','21000000-0000-0000-0000-000000000006',jsonb_build_object('clienteId','credit-client','source','new','amount',50,'fecha','2026-10-04','formaPago','efectivo','receiptPath',path));
 assert (select receipt_path=path from public.customer_advances where id='21000000-0000-0000-0000-000000000006');
 delete from storage.objects where bucket_id='customer-receipts' and name=path;
 assert exists(select 1 from storage.objects where bucket_id='customer-receipts' and name=path), 'linked evidence cannot be deleted through Storage';
 begin perform public.customer_account_command('receive',gen_random_uuid(),jsonb_build_object('clienteId','credit-client','source','new','amount',50,'formaPago','efectivo','receiptPath',path)); exception when others then failed:=sqlerrm like '%comprobante no esta disponible%'; end;
 assert failed, 'receipts cannot be linked outside their operation folder';
 assert not (select public from storage.buckets where id='customer-receipts');
end $$;

select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
do $$ declare failed boolean; begin
 assert (select count(*)=0 from public.customer_advances), 'operators cannot read finance balances';
 failed:=false;
 begin perform public.get_customer_account('credit-client'); exception when others then failed:=true; end;
 assert failed;
 failed:=false;
 begin perform public.customer_account_command('receive',gen_random_uuid(),'{"clienteId":"credit-client","amount":99,"formaPago":"efectivo"}'); exception when others then failed:=true; end;
 assert failed;
 failed:=false;
 begin update public.pedidos set cliente_id='credit-client-two' where id='credit-order-old'; exception when others then failed:=true; end;
 assert failed, 'operators cannot change ledger-linked customer even though finance RLS hides the ledger';
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
do $$ declare failed boolean:=false; begin
 assert (select count(*)=0 from public.customer_advances), 'other team cannot read balances';
 begin perform public.get_customer_account('credit-client'); exception when others then failed:=true; end;
 assert failed, 'other team cannot query customer statement';
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000004',true);
do $$ begin
 assert jsonb_array_length(public.get_customer_account('credit-client')->'advances')=5;
 perform public.customer_account_command('apply','22000000-0000-0000-0000-000000000006','{"clienteId":"credit-client","advanceId":"21000000-0000-0000-0000-000000000001","pedidoId":"credit-order-1","amount":100,"fecha":"2026-10-04"}');
 assert (select monto_pagado=100 from public.pedidos where id='credit-order-1'), 'accountant can apply credit atomically despite ordinary order write restrictions';
end $$;
reset role;
do $$ begin
 assert not has_function_privilege('anon','public.customer_account_command(text,uuid,jsonb)','EXECUTE');
 assert not has_function_privilege('anon','public.get_customer_account(text)','EXECUTE');
 assert (select relrowsecurity from pg_class where oid='public.customer_advances'::regclass);
 assert (select relrowsecurity from pg_class where oid='public.customer_account_movements'::regclass);
end $$;
rollback;
\o
\echo Customer account transaction and permission regressions passed.
