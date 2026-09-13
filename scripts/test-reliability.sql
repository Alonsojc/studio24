-- Run only against an isolated database populated from migrations.
begin;
do $$ declare signature text; begin
 foreach signature in array array[
  'public.sync_write_record(text,jsonb,timestamptz,text)',
  'public.sync_delete_record(text,text,timestamptz)',
  'public.create_recurrente_egreso(text,text,text,jsonb)'
 ] loop
  assert not has_function_privilege('anon',signature,'EXECUTE'), 'anonymous sync execution must be revoked';
  assert has_function_privilege('authenticated',signature,'EXECUTE'), 'signed-in sync execution must remain available';
 end loop;
end $$;
insert into auth.users(id,email) values
 ('10000000-0000-0000-0000-000000000001','admin@example.invalid'),
 ('10000000-0000-0000-0000-000000000002','operator@example.invalid'),
 ('10000000-0000-0000-0000-000000000003','other@example.invalid'),
 ('10000000-0000-0000-0000-000000000004','accountant@example.invalid');
update public.team_members set role='operador',team_id=(select team_id from public.team_members where user_id='10000000-0000-0000-0000-000000000001') where user_id='10000000-0000-0000-0000-000000000002';
update public.team_members set role='contador',team_id=(select team_id from public.team_members where user_id='10000000-0000-0000-0000-000000000001') where user_id='10000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
do $$ declare a jsonb; b jsonb; failed boolean; begin
 a:=public.sync_write_record('egresos','{"id":"expense-test","fecha":"2026-09-13","descripcion":"test","categoria":"otro","monto_total":150}',null,'operation-00000001');
 b:=public.sync_write_record('egresos','{"id":"expense-test","descripcion":"ignored"}',null,'operation-00000001');
 assert a=b, 'retry must return same row';
 failed:=false;
 begin perform public.sync_write_record('egresos','{"id":"expense-test","descripcion":"lost"}',null,'operation-00000002'); exception when others then failed:=sqlerrm like 'CONFLICT:%'; end;
 assert failed, 'stale writer must conflict';
 b:=public.sync_write_record('egresos','{"id":"expense-test","descripcion":"new"}',(a->>'updated_at')::timestamptz,'operation-00000003');
 assert b->>'descripcion'='new';
 perform public.sync_delete_record('egresos','expense-test',(b->>'updated_at')::timestamptz);
 assert exists(select 1 from public.deleted_records where record_id='expense-test');
 failed:=false;
 begin perform public.sync_write_record('egresos','{"id":"expense-test"}',null,'operation-00000004'); exception when others then failed:=sqlerrm like 'CONFLICT:%'; end;
 assert failed, 'deleted rows must not resurrect';
 a:=public.create_recurrente_egreso('rec::2026-09','rec','2026-09','{"id":"canonical","fecha":"2026-09-13","descripcion":"test","categoria":"otro"}');
 b:=public.create_recurrente_egreso('rec::2026-09','rec','2026-09','{"id":"duplicate","fecha":"2026-09-13","descripcion":"test","categoria":"otro"}');
 assert (a->>'created')::boolean and not (b->>'created')::boolean;
 assert b->'egreso'->>'id'='canonical';
 perform public.sync_write_record('finance_entries','{"id":"finance-test","kind":"donacion","period":"2026-09","amount":20,"separated":true}',null,'operation-00000005');
 perform public.sync_write_record('pedidos','{"id":"public-order","descripcion":"Public","fecha_pedido":"2026-09-13","tracking_token":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","notas":"PRIVATE"}',null,'operation-00000006');
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
do $$ declare failed boolean:=false; begin
 assert (select count(*)=0 from public.egresos), 'operator cannot read finances';
 assert (select count(*)=0 from public.finance_entries);
 begin perform public.sync_write_record('finance_entries','{"id":"forbidden","kind":"donacion","period":"2026-08"}',null,'operation-00000007'); exception when insufficient_privilege then failed:=true; end;
 assert failed, 'operator cannot write finance';
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
do $$ begin
 assert (select count(*)=0 from public.finance_entries), 'other team cannot read finance';
 assert (select count(*)=0 from public.deleted_records), 'other team cannot read tombstones';
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
do $$ begin
 assert (select count(*)=1 from public.finance_entries), 'accountant reads team finance';
 assert not (public.create_recurrente_egreso('rec::2026-09','rec','2026-09','{}')->>'created')::boolean;
end $$;
set local role anon;
do $$ declare result jsonb; begin
 result:=public.get_public_pedido_tracking('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
 assert result->'pedido'->>'descripcion'='Public';
 assert not (result->'pedido' ? 'notas');
 assert not (result->'pedido' ? 'costoMateriales');
 assert not (result->'pedido' ? 'pagos');
 assert public.get_public_pedido_tracking('public-order') is null;
end $$;
rollback;
