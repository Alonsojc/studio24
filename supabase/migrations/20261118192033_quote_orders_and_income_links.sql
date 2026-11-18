-- Additive: do not rewrite or infer historical customer/payment associations.
alter table public.cotizaciones
  add column cliente_id text,
  add column pedido_id text references public.pedidos(id);
create unique index cotizaciones_pedido_unique on public.cotizaciones(pedido_id) where pedido_id is not null;

alter table public.pedidos add column partidas_cotizacion jsonb;
alter table public.ingresos add column pedido_vinculo text check (pedido_vinculo in ('existente', 'desde_pedido'));

-- A single order can be associated with several existing receipts. Each receipt
-- still belongs to at most one order; the commands serialize on the order.
create index ingresos_team_pedido_idx on public.ingresos(team_id, pedido_id) where coalesce(pedido_id, '') <> '';
drop index if exists public.ingresos_team_pedido_unique;

create function app_private.order_has_income(p_order text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.ingresos where team_id=app_private.current_user_team_id() and pedido_id=p_order);
$$;
revoke all on function app_private.order_has_income(text) from public,anon;
grant execute on function app_private.order_has_income(text) to authenticated;

create function app_private.guard_sales_links() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_user not in ('authenticated', 'anon') then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_table_name='cotizaciones' then
    if tg_op='DELETE' then
      if old.pedido_id is not null then raise exception 'CONFLICT: esta cotizacion ya tiene un pedido'; end if;
      return old;
    end if;
    if (tg_op='INSERT' and new.pedido_id is not null)
      or (tg_op='UPDATE' and new.pedido_id is distinct from old.pedido_id) then
      raise exception 'CONFLICT: convierte la cotizacion desde el Cotizador';
    end if;
    if tg_op='UPDATE' and old.pedido_id is not null and
      (new.cliente_id,new.cliente_nombre,new.cliente_empresa,new.folio,new.items,new.con_iva,new.subtotal,new.iva,new.total)
      is distinct from
      (old.cliente_id,old.cliente_nombre,old.cliente_empresa,old.folio,old.items,old.con_iva,old.subtotal,old.iva,old.total) then
      raise exception 'CONFLICT: guarda una nueva cotizacion para cambiar una que ya se convirtio';
    end if;
  elsif tg_table_name='ingresos' then
    if tg_op='DELETE' then
      if coalesce(old.pedido_id,'')<>'' then raise exception 'CONFLICT: el ingreso esta vinculado a un pedido'; end if;
      return old;
    end if;
    if (tg_op='INSERT' and (coalesce(new.pedido_id,'')<>'' or new.pedido_vinculo is not null))
      or (tg_op='UPDATE' and (coalesce(new.pedido_id,''),new.pedido_vinculo) is distinct from
        (coalesce(old.pedido_id,''),old.pedido_vinculo)) then
      raise exception 'CONFLICT: vincula el ingreso desde Ingresos o Pedidos';
    end if;
    if tg_op='UPDATE' and coalesce(old.pedido_id,'')<>''
      and (new.cliente_id,new.monto_total,new.fecha,new.forma_pago) is distinct from
          (old.cliente_id,old.monto_total,old.fecha,old.forma_pago) then
      raise exception 'CONFLICT: el importe, cliente, fecha y forma de pago del ingreso vinculado deben conservarse';
    end if;
  else
    if tg_op='INSERT' then
      if new.partidas_cotizacion is not null then raise exception 'CONFLICT: convierte la cotizacion desde el Cotizador'; end if;
      return new;
    end if;
    if tg_op='UPDATE' then
      if new.partidas_cotizacion is distinct from old.partidas_cotizacion
        or (old.partidas_cotizacion is not null and (new.cliente_id,new.piezas,new.monto_total) is distinct from
          (old.cliente_id,old.piezas,old.monto_total)) then
        raise exception 'CONFLICT: conserva la clienta, cantidades y total de la cotizacion original';
      end if;
      if old.partidas_cotizacion is not null then new.precio_unitario:=old.precio_unitario; end if;
    end if;
    if app_private.order_has_income(old.id)
      and (tg_op='DELETE' or new.cliente_id is distinct from old.cliente_id
        or (new.estado='cancelado' and old.estado<>'cancelado')) then
      raise exception 'CONFLICT: revisa los ingresos vinculados antes de cambiar o cancelar el pedido';
    end if;
    if tg_op='DELETE' then return old; end if;
  end if;
  return new;
end $$;
revoke all on function app_private.guard_sales_links() from public,anon,authenticated;
create trigger guard_sales_links before insert or update or delete on public.cotizaciones
  for each row execute function app_private.guard_sales_links();
create trigger guard_sales_links before insert or update or delete on public.ingresos
  for each row execute function app_private.guard_sales_links();
create trigger guard_sales_links before insert or update or delete on public.pedidos
  for each row execute function app_private.guard_sales_links();

create function app_private.convert_quote_to_order(p_quote text,p_client text,p_expected timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_team uuid:=app_private.current_user_team_id(); v_actor uuid:=auth.uid();
  v_quote public.cotizaciones; v_order public.pedidos; v_client text;
  v_item jsonb; v_qty numeric; v_pieces int:=0; v_unit numeric; v_subtotal numeric:=0;
  v_descriptions text; v_legacy_count int; v_order_id text;
begin
  if v_actor is null or v_team is null or not app_private.current_user_has_role('admin','operador') then
    raise exception 'Sin permiso para convertir cotizaciones' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_team::text||':cotizaciones:'||p_quote,0));
  select * into v_quote from public.cotizaciones where team_id=v_team and id=p_quote for update;
  if not found then raise exception 'Cotizacion no disponible'; end if;
  if v_quote.pedido_id is not null then
    select * into strict v_order from public.pedidos where team_id=v_team and id=v_quote.pedido_id;
    return jsonb_build_object('quote',to_jsonb(v_quote),'order',to_jsonb(v_order),'created',false);
  end if;
  if v_quote.updated_at is distinct from p_expected then
    raise exception 'La cotizacion cambio. Actualiza y revisala antes de crear el pedido';
  end if;
  v_client:=coalesce(nullif(v_quote.cliente_id,''),nullif(p_client,''));
  if (nullif(v_quote.cliente_id,'') is not null and v_quote.cliente_id is distinct from p_client)
    or not exists(select 1 from public.clientes where team_id=v_team and id=v_client) then
    raise exception 'Confirma una clienta registrada para esta cotizacion';
  end if;

  -- Old versions put the quote folio in the first line of the order notes.
  select count(*), min(id) into v_legacy_count,v_order_id from public.pedidos
    where team_id=v_team and split_part(notas,E'\n',1)='Creado desde '||v_quote.folio;
  if v_legacy_count>0 then
    select * into v_order from public.pedidos where team_id=v_team and id=v_order_id for update;
    if not found or v_legacy_count<>1 or v_order.cliente_id is distinct from v_client
      or v_order.monto_total is distinct from v_quote.total
      or (select count(*) from public.cotizaciones where team_id=v_team and folio=v_quote.folio)<>1
      or exists(select 1 from public.cotizaciones where pedido_id=v_order_id) then
      raise exception 'Ya hay un pedido previo con este folio. Revisalo en Pedidos antes de convertir';
    end if;
  else
    if jsonb_typeof(v_quote.items) is distinct from 'array' or jsonb_array_length(v_quote.items) not between 1 and 500 then
      raise exception 'La cotizacion no tiene partidas validas';
    end if;
    for v_item in select value from jsonb_array_elements(v_quote.items) loop
      v_qty:=(v_item->>'cantidad')::numeric;
      v_unit:=(v_item->>'precioUnitario')::numeric;
      if not coalesce(v_qty between 1 and 1000000 and v_qty=trunc(v_qty)
        and v_unit between 0.01 and 999999999999.99 and trim(v_item->>'descripcion')<>'',false) then
        raise exception 'Revisa las cantidades y los precios de las partidas';
      end if;
      v_pieces:=v_pieces+v_qty::int;
      v_subtotal:=v_subtotal+v_qty*v_unit;
      v_descriptions:=concat_ws(', ',v_descriptions,trim(v_item->>'descripcion'));
    end loop;
    if not coalesce(v_quote.total between 0.01 and 999999999999.99
      and v_quote.subtotal=round(v_subtotal,2)
      and v_quote.iva=case when v_quote.con_iva then round(v_quote.subtotal*0.16,2) else 0 end
      and v_quote.total=v_quote.subtotal+v_quote.iva,false) then
      raise exception 'Las partidas no cuadran con el total. Revisa y guarda la cotizacion antes de convertirla';
    end if;
    insert into public.pedidos(id,team_id,user_id,cliente_id,descripcion,concepto,piezas,precio_unitario,
      monto_total,fecha_pedido,notas,tracking_token,partidas_cotizacion)
    values(gen_random_uuid()::text,v_team,v_actor,v_client,
      case when jsonb_array_length(v_quote.items)=1 then v_descriptions else 'Cotizacion '||v_quote.folio||': '||v_descriptions end,
      'bordado_y_prenda',v_pieces,round(v_quote.total::numeric(32,16)/v_pieces,16),v_quote.total,
      (clock_timestamp() at time zone 'America/Mexico_City')::date::text,
      concat_ws(E'\n\n','Creado desde '||v_quote.folio,nullif(v_quote.notas,'')),
      replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),v_quote.items)
    returning * into v_order;
  end if;
  update public.cotizaciones set pedido_id=v_order.id,cliente_id=v_client,sync_operation=null,updated_at=clock_timestamp()
    where id=v_quote.id returning * into v_quote;
  return jsonb_build_object('quote',to_jsonb(v_quote),'order',to_jsonb(v_order),'created',v_legacy_count=0);
end $$;

-- Lock by client, then income, then order: the same order as the credit ledger.
create function app_private.link_order_income(p_income text,p_order text,p_counted boolean,p_expected timestamptz,
  p_order_version timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_team uuid:=app_private.current_user_team_id(); v_actor uuid:=auth.uid();
  v_income public.ingresos; v_order public.pedidos; v_client text;
  v_pays jsonb; v_paid numeric; v_amount numeric; v_credit numeric; v_linked numeric;
  v_payment_id text:='ingreso:'||p_income;
begin
  if v_actor is null or v_team is null or not app_private.current_user_has_role('admin','contador') then
    raise exception 'Sin permiso para vincular ingresos' using errcode='42501';
  end if;
  select cliente_id into v_client from public.ingresos where team_id=v_team and id=p_income;
  if coalesce(v_client,'')='' then raise exception 'El ingreso debe tener una clienta registrada'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_team::text||':customer-account:'||v_client,0));
  perform pg_advisory_xact_lock(hashtextextended(v_team::text||':ingresos:'||p_income,0));
  select * into v_income from public.ingresos where team_id=v_team and id=p_income for update;
  if not found or v_income.cliente_id is distinct from v_client then raise exception 'El ingreso cambio. Actualiza antes de continuar'; end if;
  if p_order is null and coalesce(v_income.pedido_id,'')='' then
    return jsonb_build_object('income',to_jsonb(v_income),'order',null);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_team::text||':pedidos:'||coalesce(p_order,v_income.pedido_id),0));
  select * into v_order from public.pedidos where team_id=v_team and id=coalesce(p_order,v_income.pedido_id)
    and cliente_id=v_client for update;
  if not found then raise exception 'Selecciona un pedido de la misma clienta'; end if;
  if p_order is not null and v_income.pedido_id=p_order then
    return jsonb_build_object('income',to_jsonb(v_income),'order',to_jsonb(v_order));
  end if;
  if v_income.updated_at is distinct from p_expected or
    (p_order is not null and v_order.updated_at is distinct from p_order_version) then
    raise exception 'El ingreso o pedido cambio. Actualiza antes de continuar';
  end if;
  v_pays:=coalesce(v_order.pagos,'[]'::jsonb);
  select coalesce(sum((x->>'monto')::numeric),0),
    coalesce(sum((x->>'monto')::numeric) filter(where x->>'origen'='saldo_cliente'),0)
    into v_paid,v_credit from jsonb_array_elements(v_pays) x;
  if jsonb_array_length(v_pays)=0 then v_paid:=v_order.monto_pagado; end if;
  if v_paid is null or v_order.monto_total is null or v_paid is distinct from v_order.monto_pagado then
    raise exception 'Hay pagos del pedido por conciliar';
  end if;

  if p_order is null then
    if v_income.pedido_vinculo is distinct from 'existente' then raise exception 'El ingreso se registro desde el pedido y no se puede desvincular aqui'; end if;
    if exists(select 1 from jsonb_array_elements(v_pays) x where x->>'id'=v_payment_id and x->>'origen'='ingreso_existente') then
      select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into v_pays
        from jsonb_array_elements(v_pays) with ordinality
        where value->>'id' is distinct from v_payment_id;
      v_paid:=v_paid-v_income.monto_total;
    end if;
  else
    if p_counted is null or coalesce(v_income.pedido_id,'')<>'' or v_order.estado='cancelado'
      or not exists(select 1 from public.clientes where team_id=v_team and id=v_client)
      or exists(select 1 from public.customer_advances where team_id=v_team and ingreso_id=p_income and voided_at is null) then
      raise exception 'El ingreso o pedido no esta disponible para vincular. Revisa su cuenta';
    end if;
    v_amount:=v_income.monto_total;
    if not coalesce(v_amount between 0.01 and 999999999999.99 and v_amount=round(v_amount,2),false) then
      raise exception 'El ingreso debe tener un importe positivo con centavos';
    end if;
    select coalesce(sum(monto_total),0) into v_linked from public.ingresos
      where team_id=v_team and pedido_id=v_order.id;
    if v_linked+v_credit>v_paid then raise exception 'El pedido tiene ingresos anteriores por conciliar'; end if;
    if p_counted then
      if v_amount>v_paid-v_credit-v_linked then raise exception 'El importe supera los pagos previos aun sin vincular'; end if;
    else
      if v_amount>v_order.monto_total-v_paid then raise exception 'El importe supera el saldo pendiente del pedido'; end if;
      if jsonb_array_length(v_pays)=0 and v_paid>0 then
        v_pays:=jsonb_build_array(jsonb_build_object('id','saldo-inicial:'||p_income,'fecha','',
          'formaPago','otro','monto',v_paid,'referencia','Saldo anterior sin detalle','origen','saldo_inicial','createdAt',clock_timestamp()));
      end if;
      v_pays:=v_pays||jsonb_build_array(jsonb_build_object('id',v_payment_id,'fecha',v_income.fecha,
        'formaPago',v_income.forma_pago,'monto',v_amount,'referencia',v_income.descripcion,
        'origen','ingreso_existente','createdAt',clock_timestamp()));
      v_paid:=v_paid+v_amount;
    end if;
  end if;
  if v_pays is distinct from v_order.pagos then
    update public.pedidos set pagos=v_pays,monto_pagado=v_paid,
      estado_pago=case when v_paid>=monto_total and monto_total>0 then 'pagado' when v_paid>0 then 'parcial' else 'pendiente' end,
      sync_operation=null,updated_at=clock_timestamp()
      where team_id=v_team and id=v_order.id returning * into v_order;
  end if;
  update public.ingresos set pedido_id=coalesce(p_order,''),
    pedido_vinculo=case when p_order is not null then 'existente' end,
    sync_operation=null,updated_at=clock_timestamp()
    where team_id=v_team and id=p_income returning * into v_income;
  return jsonb_build_object('income',to_jsonb(v_income),'order',to_jsonb(v_order));
end $$;

create function app_private.register_order_income(p_order text,p_expected timestamptz,p_iva boolean,
  p_legacy_date date,p_legacy_method text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_team uuid:=app_private.current_user_team_id(); v_actor uuid:=auth.uid();
  v_order public.pedidos; v_income public.ingresos; v_client text;
  v_pays jsonb; v_pay jsonb; v_paid numeric; v_date date; v_method text; v_amount numeric; v_base numeric;
  v_rows jsonb:='[]'::jsonb;
begin
  if v_actor is null or v_team is null or not app_private.current_user_has_role('admin','contador') then
    raise exception 'Sin permiso para registrar ingresos' using errcode='42501';
  end if;
  select cliente_id into v_client from public.pedidos where team_id=v_team and id=p_order;
  if not found then raise exception 'Pedido no disponible'; end if;
  if coalesce(v_client,'')<>'' then
    perform pg_advisory_xact_lock(hashtextextended(v_team::text||':customer-account:'||v_client,0));
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_team::text||':pedidos:'||p_order,0));
  select * into v_order from public.pedidos where team_id=v_team and id=p_order for update;
  if not found or v_order.cliente_id is distinct from v_client then raise exception 'El pedido cambio'; end if;
  select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) into v_rows
    from public.ingresos i where i.team_id=v_team and i.pedido_id=p_order;
  if jsonb_array_length(v_rows)>0 then return jsonb_build_object('rows',v_rows,'created',false); end if;
  if v_order.updated_at is distinct from p_expected or p_iva is null then raise exception 'El pedido cambio. Actualiza antes de registrar'; end if;
  if v_order.estado='cancelado' or v_order.monto_total<=0 or v_order.monto_pagado is distinct from v_order.monto_total then
    raise exception 'El pedido debe estar pagado y vigente';
  end if;
  v_pays:=coalesce(v_order.pagos,'[]'::jsonb);
  if jsonb_array_length(v_pays)=0 then
    v_pays:=jsonb_build_array(jsonb_build_object('origen','saldo_inicial','monto',v_order.monto_pagado));
  end if;
  select sum((value->>'monto')::numeric) into v_paid from jsonb_array_elements(v_pays);
  if v_paid is distinct from v_order.monto_pagado or exists(
    select 1 from jsonb_array_elements(v_pays) x where not coalesce((x->>'monto')::numeric>0,false)
  ) then raise exception 'Los pagos no cuadran con el pedido'; end if;
  for v_pay in select value from jsonb_array_elements(v_pays)
    where coalesce(value->>'origen','') not in ('saldo_cliente','ingreso_existente')
  loop
    v_amount:=(v_pay->>'monto')::numeric;
    if not coalesce(v_amount between 0.01 and 999999999999.99 and v_amount=round(v_amount,2),false) then
      raise exception 'Hay un importe de pago por conciliar';
    end if;
    if v_pay->>'origen'='saldo_inicial' or v_pay->>'referencia'='Pago previo registrado' or coalesce(v_pay->>'fecha','')='' then
      v_date:=p_legacy_date;
      v_method:=p_legacy_method;
    else
      v_date:=(v_pay->>'fecha')::date;
      v_method:=v_pay->>'formaPago';
    end if;
    if v_date is null or v_date>(clock_timestamp() at time zone 'America/Mexico_City')::date
      or coalesce(v_method,'') not in ('efectivo','tarjeta','transferencia','otro') then
      raise exception 'Confirma la fecha y forma reales del cobro';
    end if;
    -- The gross amount is the cash already received, not a tax-exclusive price.
    v_base:=case when p_iva then round(v_amount/1.16,2) else v_amount end;
    insert into public.ingresos(id,team_id,user_id,fecha,cliente_id,pedido_id,descripcion,concepto,monto,iva,
      monto_total,forma_pago,factura,numero_factura,notas,pedido_vinculo)
    values(gen_random_uuid()::text,v_team,v_actor,v_date::text,v_client,p_order,v_order.descripcion,v_order.concepto,
      v_base,v_amount-v_base,v_amount,v_method,p_iva,case when p_iva then public.next_folio('ING') else '' end,
      concat_ws(': ','Generado desde pedido',nullif(v_pay->>'referencia','')),'desde_pedido')
    returning * into v_income;
    v_rows:=v_rows||jsonb_build_array(to_jsonb(v_income));
  end loop;
  if jsonb_array_length(v_rows)=0 then raise exception 'El pedido ya esta cubierto con cobros registrados o saldo a favor'; end if;
  return jsonb_build_object('rows',v_rows,'created',true);
end $$;

create function public.convert_quote_to_order(p_quote text,p_client text,p_expected timestamptz) returns jsonb
language sql security invoker set search_path='' as $$
  select app_private.convert_quote_to_order(p_quote,p_client,p_expected);
$$;
create function public.link_order_income(p_income text,p_order text,p_counted boolean,p_expected timestamptz,
  p_order_version timestamptz) returns jsonb
language sql security invoker set search_path='' as $$
  select app_private.link_order_income(p_income,p_order,p_counted,p_expected,p_order_version);
$$;
create function public.register_order_income(p_order text,p_expected timestamptz,p_iva boolean,
  p_legacy_date date,p_legacy_method text) returns jsonb
language sql security invoker set search_path='' as $$
  select app_private.register_order_income(p_order,p_expected,p_iva,p_legacy_date,p_legacy_method);
$$;
revoke all on function app_private.convert_quote_to_order(text,text,timestamptz),
  app_private.link_order_income(text,text,boolean,timestamptz,timestamptz),
  app_private.register_order_income(text,timestamptz,boolean,date,text),
  public.convert_quote_to_order(text,text,timestamptz),
  public.link_order_income(text,text,boolean,timestamptz,timestamptz),
  public.register_order_income(text,timestamptz,boolean,date,text) from public,anon;
grant execute on function app_private.convert_quote_to_order(text,text,timestamptz),
  app_private.link_order_income(text,text,boolean,timestamptz,timestamptz),
  app_private.register_order_income(text,timestamptz,boolean,date,text),
  public.convert_quote_to_order(text,text,timestamptz),
  public.link_order_income(text,text,boolean,timestamptz,timestamptz),
  public.register_order_income(text,timestamptz,boolean,date,text) to authenticated;

-- JSON imports can restore ordinary records; confirmed links are kept from the
-- live database. Recreating historical links belongs to full backup recovery.
create function public.get_sales_links_snapshot() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare v_team uuid:=app_private.current_user_team_id();
begin
  if auth.uid() is null or v_team is null or not app_private.current_user_has_role('admin') then
    raise exception 'Solo administracion puede revisar vinculos para restaurar' using errcode='42501';
  end if;
  return jsonb_build_object(
    'cotizaciones',coalesce((select jsonb_agg(to_jsonb(q)) from public.cotizaciones q
      where q.team_id=v_team and q.pedido_id is not null),'[]'::jsonb),
    'ingresos',coalesce((select jsonb_agg(to_jsonb(i)) from public.ingresos i
      where i.team_id=v_team and coalesce(i.pedido_id,'')<>''),'[]'::jsonb),
    'pedidos',coalesce((select jsonb_agg(to_jsonb(p)) from public.pedidos p where p.team_id=v_team and (
      p.partidas_cotizacion is not null or exists(select 1 from public.cotizaciones q where q.team_id=v_team and q.pedido_id=p.id)
      or exists(select 1 from public.ingresos i where i.team_id=v_team and i.pedido_id=p.id)
    )),'[]'::jsonb)
  );
end $$;
revoke all on function public.get_sales_links_snapshot() from public,anon;
grant execute on function public.get_sales_links_snapshot() to authenticated;
