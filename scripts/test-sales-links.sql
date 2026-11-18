-- Fictional orders and receipts in the isolated migration database.
\o /dev/null
begin;
insert into auth.users(id,email) values
  ('60000000-0000-0000-0000-000000000001','sales-admin@example.invalid'),
  ('60000000-0000-0000-0000-000000000002','sales-accountant@example.invalid'),
  ('60000000-0000-0000-0000-000000000003','sales-operator@example.invalid');
update public.team_members set
  team_id=(select team_id from public.team_members where user_id='60000000-0000-0000-0000-000000000001'),
  role=case when user_id='60000000-0000-0000-0000-000000000002' then 'contador' else 'operador' end
  where user_id in ('60000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000003');

set local role authenticated;
select set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000001',true);
insert into public.clientes(id,nombre) values ('sales-a','Clienta A'),('sales-b','Clienta B');
insert into public.cotizaciones(id,folio,cliente_id,cliente_nombre,items,con_iva,subtotal,iva,total) values
  ('quote-a','COT-A','sales-a','Clienta A',
    '[{"descripcion":"Playeras","cantidad":3,"precioUnitario":120},{"descripcion":"Mandiles","cantidad":4,"precioUnitario":97.61}]',
    true,750.44,120.07,870.51),
  ('quote-b','COT-B',null,'Clienta B','[{"descripcion":"Gorras","cantidad":10,"precioUnitario":25}]',false,250,0,250),
  ('quote-bad','COT-BAD','sales-a','Clienta A','[{"descripcion":"Gorras","cantidad":10,"precioUnitario":25}]',false,300,0,300);
insert into public.pedidos(id,cliente_id,descripcion,fecha_pedido,piezas,precio_unitario,monto_total,notas) values
  ('sales-old-quote','sales-b','Pedido previo','2026-10-18',1,250,250,'Creado desde COT-B'),
  ('sales-order','sales-a','Pedido por cobrar','2026-10-18',10,116,1160,''),
  ('sales-cash','sales-a','Pedido pagado en efectivo','2026-10-18',10,116,1160,''),
  ('sales-mixed','sales-a','Pedido con dos formas de pago','2026-10-18',10,100,1000,''),
  ('sales-counted','sales-a','Pedido con cobro histórico','2026-10-18',10,50,500,''),
  ('sales-other-client','sales-b','Pedido de B','2026-10-18',10,116,1160,'');
insert into public.ingresos(id,cliente_id,descripcion,concepto,fecha,forma_pago,monto,iva,monto_total) values
  ('sales-receipt-1','sales-a','Pago previo 1','otro','2026-10-19','tarjeta',1000,160,1160),
  ('sales-receipt-2','sales-a','Pago previo 2','otro','2026-10-19','transferencia',350,0,350),
  ('sales-receipt-3','sales-a','Pago previo 3','otro','2026-10-20','efectivo',100,0,100);
reset role;
update public.pedidos set monto_pagado=1160,estado_pago='pagado',
  pagos='[{"id":"cash","fecha":"2026-10-19","formaPago":"efectivo","monto":1160}]' where id='sales-cash';
update public.pedidos set monto_pagado=1000,estado_pago='pagado',
  pagos='[{"id":"cash","fecha":"2026-10-19","formaPago":"efectivo","monto":400},{"id":"card","fecha":"2026-10-20","formaPago":"tarjeta","monto":600}]'
  where id='sales-mixed';
update public.pedidos set monto_pagado=450,estado_pago='parcial' where id='sales-counted';
set local role authenticated;
do $$ declare q_ver timestamptz; actual jsonb; order_id text; rejected boolean:=false;
begin
  assert not has_function_privilege('anon','public.link_order_income(text,text,boolean,timestamptz,timestamptz)','execute');
  select updated_at into q_ver from public.cotizaciones where id='quote-a';
  begin perform public.convert_quote_to_order('quote-a','sales-b',q_ver);
    exception when raise_exception then rejected:=true; end;
  assert rejected, 'conversion must use the customer stored with the quote';
  actual:=public.convert_quote_to_order('quote-a','sales-a',q_ver);
  order_id:=actual->'order'->>'id';
  assert (actual->>'created')::boolean and (actual->'order'->>'piezas')::int=7;
  assert actual->'order'->>'cliente_id'='sales-a' and (actual->'order'->>'monto_total')::numeric=870.51;
  assert jsonb_array_length(actual->'order'->'partidas_cotizacion')=2;
  actual:=public.convert_quote_to_order('quote-a','sales-a',q_ver);
  assert not (actual->>'created')::boolean and actual->'order'->>'id'=order_id;
  assert (select count(*)=1 from public.pedidos where split_part(notas,E'\n',1)='Creado desde COT-A');
  -- A precise average from a multi-line order must survive edits made by the browser.
  update public.pedidos set notas=notas||E'\nNota adicional',precio_unitario=124.3585714285714 where id=order_id;
  assert (select monto_total=870.51 and piezas=7 from public.pedidos where id=order_id);
  select updated_at into q_ver from public.cotizaciones where id='quote-b';
  actual:=public.convert_quote_to_order('quote-b','sales-b',q_ver);
  assert not (actual->>'created')::boolean and actual->'order'->>'id'='sales-old-quote';
  rejected:=false;
  begin perform public.convert_quote_to_order('quote-bad','sales-a',(select updated_at from public.cotizaciones where id='quote-bad'));
    exception when raise_exception then rejected:=true; end;
  assert rejected, 'stored totals that disagree with displayed lines must be reviewed';
end $$;

select set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000002',true);
do $$ declare actual jsonb; v_income timestamptz; v_order timestamptz; rejected boolean:=false; original jsonb;
begin
  actual:=public.register_order_income('sales-cash',(select updated_at from public.pedidos where id='sales-cash'),true,null,null);
  assert (actual->>'created')::boolean and jsonb_array_length(actual->'rows')=1;
  assert (select (monto,iva,monto_total,forma_pago,fecha)=(1000::numeric,160::numeric,1160::numeric,'efectivo'::text,'2026-10-19'::text)
    from public.ingresos where pedido_id='sales-cash'), 'tax is computed inside the received gross and preserves payment metadata';
  actual:=public.register_order_income('sales-cash',(select updated_at from public.pedidos where id='sales-cash'),true,null,null);
  assert not (actual->>'created')::boolean and jsonb_array_length(actual->'rows')=1;
  actual:=public.register_order_income('sales-mixed',(select updated_at from public.pedidos where id='sales-mixed'),true,null,null);
  assert jsonb_array_length(actual->'rows')=2;
  assert (select count(*)=2 and sum(monto_total)=1000 and count(distinct forma_pago)=2 and count(distinct fecha)=2
    from public.ingresos where pedido_id='sales-mixed');

  select updated_at,to_jsonb(i)-array['updated_at','sync_operation','pedido_id','pedido_vinculo']
    into v_income,original from public.ingresos i where id='sales-receipt-1';
  begin
    perform public.link_order_income('sales-receipt-1','sales-other-client',false,v_income,
      (select updated_at from public.pedidos where id='sales-other-client'));
  exception when raise_exception then rejected:=true; end;
  assert rejected;
  select updated_at into v_order from public.pedidos where id='sales-order';
  actual:=public.link_order_income('sales-receipt-1','sales-order',false,v_income,v_order);
  perform public.link_order_income('sales-receipt-1','sales-order',false,v_income,v_order);
  assert (select monto_pagado=1160 and estado_pago='pagado' and jsonb_array_length(pagos)=1 from public.pedidos where id='sales-order');
  assert (select count(*)=1 from public.ingresos where pedido_id='sales-order');
  assert (actual->'income')-array['updated_at','sync_operation','pedido_id','pedido_vinculo']=original, 'linking does not alter the receipt';
  perform public.link_order_income('sales-receipt-1',null,false,(select updated_at from public.ingresos where id='sales-receipt-1'),null);
  assert (select monto_pagado=0 and estado_pago='pendiente' from public.pedidos where id='sales-order');
  assert (select monto_total=1160 and coalesce(pedido_id,'')='' from public.ingresos where id='sales-receipt-1');

  perform public.link_order_income('sales-receipt-2','sales-counted',true,
    (select updated_at from public.ingresos where id='sales-receipt-2'),
    (select updated_at from public.pedidos where id='sales-counted'));
  perform public.link_order_income('sales-receipt-3','sales-counted',true,
    (select updated_at from public.ingresos where id='sales-receipt-3'),
    (select updated_at from public.pedidos where id='sales-counted'));
  assert (select monto_pagado=450 and jsonb_array_length(pagos)=0 from public.pedidos where id='sales-counted');
  assert (select count(*)=2 and sum(monto_total)=450 from public.ingresos where pedido_id='sales-counted');
  assert (select count(*)=6 and sum(monto_total)=3770 from public.ingresos);
end $$;

select set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000003',true);
do $$ declare rejected boolean:=false;
begin
  begin perform public.link_order_income('sales-receipt-2',null,false,null,null);
    exception when insufficient_privilege then rejected:=true; end;
  assert rejected, 'operators cannot change financial links';
  rejected:=false;
  begin update public.pedidos set cliente_id='sales-b' where id='sales-counted';
    exception when raise_exception then rejected:=sqlerrm like 'CONFLICT:%'; end;
  assert rejected, 'editing a production order cannot change the receiving customer once cash is linked';
end $$;
rollback;
\o
\echo 'Sales: quote conversion, included tax, payment details and idempotent receipt links passed.'
