-- UUID identity is case-insensitive, including imports from older devices.
-- Do not normalize or rewrite historical invoice records.
create unique index ingresos_team_uuid_normalized_unique on public.ingresos(team_id,upper(trim(uuid_cfdi)))
where coalesce(trim(uuid_cfdi),'')<>'';
create unique index egresos_team_uuid_normalized_unique on public.egresos(team_id,upper(trim(uuid_cfdi)))
where coalesce(trim(uuid_cfdi),'')<>'';
drop index if exists public.ingresos_team_uuid_cfdi_unique;
drop index if exists public.egresos_team_uuid_cfdi_unique;

-- A direct collection uses the existing, audited credit ledger. Both commands
-- commit together; the caller retains both operation IDs across network retries.
create function public.collect_order_payment(p_operation uuid, p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_apply uuid := (p_data->>'applicationId')::uuid;
begin
  if auth.uid() is null or not app_private.current_user_has_role('admin','contador') then
    raise exception 'Solo administracion y contabilidad pueden registrar cobros';
  end if;
  if v_apply is null or v_apply=p_operation or coalesce(p_data->>'pedidoId','')='' then
    raise exception 'Faltan los identificadores del cobro y pedido';
  end if;
  perform app_private.customer_account_command('receive',p_operation,p_data || '{"source":"new"}'::jsonb);
  return app_private.customer_account_command('apply',v_apply,jsonb_build_object(
    'clienteId',p_data->>'clienteId','advanceId',p_operation::text,'pedidoId',p_data->>'pedidoId',
    'amount',p_data->'amount','fecha',p_data->>'fecha','referencia',p_data->>'referencia','notas',p_data->>'notas'));
end $$;
revoke all on function public.collect_order_payment(uuid,jsonb) from public,anon;
grant execute on function public.collect_order_payment(uuid,jsonb) to authenticated;

-- Invoice attachment uses sync_write_record's version check and audit transaction.
-- Only the first CFDI may supply a tax breakdown; cash and ledger identity stay fixed.
create or replace function app_private.guard_customer_credit() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_old jsonb; v_new jsonb; v_credit numeric; v_paid numeric; v_other_income numeric;
begin
  if current_user not in ('authenticated','anon') then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_table_name='clientes' then
    if exists(select 1 from public.customer_advances where cliente_id=old.id and team_id=old.team_id) then
      raise exception 'CONFLICT: la clienta tiene historial de adelantos y no puede eliminarse';
    end if;
    return old;
  elsif tg_table_name='ingresos' then
    if tg_op in ('UPDATE','DELETE') and exists(select 1 from public.customer_advances where ingreso_id=old.id and team_id=old.team_id) then
      if tg_op='DELETE' then raise exception 'CONFLICT: el ingreso pertenece a una cuenta de cliente y conserva historial'; end if;
      if (new.cliente_id,new.pedido_id,new.monto_total,new.fecha,new.forma_pago) is distinct from
        (old.cliente_id,old.pedido_id,old.monto_total,old.fecha,old.forma_pago) then
        raise exception 'CONFLICT: el importe del adelanto se corrige desde la cuenta de la clienta';
      end if;
      if (new.monto,new.iva) is distinct from (old.monto,old.iva) and not coalesce(
        coalesce(trim(old.uuid_cfdi),'')='' and new.factura and coalesce(trim(new.uuid_cfdi),'')<>''
        and new.xml_url like old.team_id::text||'/%'
        and new.monto between 0 and 999999999999.99 and new.iva between 0 and 999999999999.99,
        false
      ) then
        raise exception 'CONFLICT: el desglose fiscal del cobro solo se asigna al vincular su primer CFDI';
      end if;
    end if;
    if tg_op<>'DELETE' and coalesce(new.pedido_id,'')<>'' then
      perform pg_advisory_xact_lock(hashtextextended(new.team_id::text||':pedidos:'||new.pedido_id,0));
      select coalesce(sum(case when kind='apply' then amount else -amount end),0) into v_credit
        from public.customer_account_movements where team_id=new.team_id and pedido_id=new.pedido_id and kind in ('apply','reverse_application');
      select coalesce(sum(i.monto_total),0) into v_other_income from public.ingresos i
        where i.team_id=new.team_id and i.pedido_id=new.pedido_id
        and i.id is distinct from case when tg_op='UPDATE' then old.id else new.id end;
      if v_credit>0 and v_other_income+new.monto_total>(select monto_total from public.pedidos where id=new.pedido_id and team_id=new.team_id)-v_credit then
        raise exception 'CONFLICT: este pedido usa saldo a favor; registra solo el cobro adicional';
      end if;
    end if;
  else
    if tg_op='DELETE' then
      if app_private.order_has_customer_credit(old.id) then raise exception 'CONFLICT: el pedido tiene historial de saldo y no puede eliminarse'; end if;
      return old;
    end if;
    select coalesce(jsonb_agg(x order by x->>'id'),'[]'::jsonb) into v_new from jsonb_array_elements(coalesce(new.pagos,'[]'::jsonb)) x where x->>'origen'='saldo_cliente';
    if tg_op='UPDATE' then
      select coalesce(jsonb_agg(x order by x->>'id'),'[]'::jsonb) into v_old from jsonb_array_elements(coalesce(old.pagos,'[]'::jsonb)) x where x->>'origen'='saldo_cliente';
    else v_old:='[]'::jsonb; end if;
    if v_new is distinct from v_old then raise exception 'CONFLICT: los pagos con saldo a favor solo cambian desde la cuenta de cliente'; end if;
    if app_private.order_has_customer_credit(new.id) then
      if new.cliente_id is distinct from old.cliente_id then raise exception 'CONFLICT: no puedes cambiar la clienta de un pedido con movimientos de saldo'; end if;
      select coalesce(sum(greatest((x->>'monto')::numeric,0)),0) into v_paid from jsonb_array_elements(coalesce(new.pagos,'[]'::jsonb)) x;
      if new.monto_pagado is distinct from v_paid or new.monto_total<v_paid then raise exception 'CONFLICT: el total y los pagos deben coincidir con el historial del pedido'; end if;
      if jsonb_array_length(v_new)>0 and new.estado='cancelado' then raise exception 'CONFLICT: revierte las aplicaciones de saldo antes de cancelar el pedido'; end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function app_private.guard_customer_credit() from public,anon,authenticated;

-- Existing history remains unchanged. New cash entries must use an atomic command,
-- never a direct edit of the order JSON from an old browser or generic sync client.
create function app_private.guard_direct_order_payments() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_user not in ('authenticated','anon') then return new; end if;
  if tg_op='INSERT' then
    if coalesce(new.monto_pagado,0)<>0 or jsonb_array_length(coalesce(new.pagos,'[]'))<>0 then
      raise exception 'CONFLICT: guarda el pedido sin pagos y registra el cobro desde su cuenta';
    end if;
  elsif new.monto_pagado is distinct from old.monto_pagado or new.pagos is distinct from old.pagos then
    raise exception 'CONFLICT: registra los cobros desde la cuenta del cliente';
  end if;
  return new;
end $$;
revoke all on function app_private.guard_direct_order_payments() from public,anon,authenticated;
create trigger guard_direct_order_payments before insert or update on public.pedidos
for each row execute function app_private.guard_direct_order_payments();

create function public.get_customer_directory(
  p_page int default 0,p_search text default '',p_sort text default 'name-asc',
  p_orders text default 'with-orders',p_debtors boolean default false
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not app_private.current_user_has_role('admin','contador') then
    raise exception 'Sin permiso para consultar clientes';
  end if;
  if p_page is null or p_search is null or p_sort is null or p_orders is null or p_debtors is null
    or p_page<0 or p_page>100000 or length(p_search)>200
    or p_sort not in ('name-asc','name-desc','income-total','income-count','pending','active-orders')
    or p_orders not in ('all','with-orders','active') then raise exception 'Filtros invalidos'; end if;
  with customers as (
    select * from public.clientes where team_id=app_private.current_user_team_id()
  ), income as (
    select cliente_id,count(*) as cnt,round(sum(monto_total)*100) as cents
    from public.ingresos where team_id=app_private.current_user_team_id() group by cliente_id
  ), orders as (
    select cliente_id,count(*) as cnt,
      count(*) filter(where estado not in ('entregado','cancelado')) as active,
      coalesce(sum(greatest(monto_total-monto_pagado,0)) filter(where estado<>'cancelado'),0)*100 as pending
    from public.pedidos where team_id=app_private.current_user_team_id() group by cliente_id
  ), stats as (
    select c.*,coalesce(i.cnt,0) as income_count,coalesce(i.cents,0) as income_cents,
      coalesce(o.cnt,0) as order_count,coalesce(o.active,0) as active_order_count,coalesce(o.pending,0) as pending_cents
    from customers c left join income i on i.cliente_id=c.id left join orders o on o.cliente_id=c.id
  ), filtered as (
    select * from stats where
      (p_search='' or strpos(lower(nombre||' '||coalesce(telefono,'')||' '||coalesce(email,'')),lower(trim(p_search)))>0)
      and (p_orders='all' or (p_orders='with-orders' and order_count>0) or (p_orders='active' and active_order_count>0))
      and (not p_debtors or pending_cents>0)
  ), paged as (
    select * from filtered order by
      case p_sort when 'income-total' then income_cents when 'income-count' then income_count
        when 'pending' then pending_cents when 'active-orders' then active_order_count end desc nulls last,
      case when p_sort='name-desc' then lower(nombre) end desc,
      lower(nombre),id
    limit 50 offset p_page*50
  ) select jsonb_build_object('total',(select count(*) from filtered),
    'registered',(select count(*) from customers),'rows',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb)) into result;
  return result;
end $$;
revoke all on function public.get_customer_directory(int,text,text,text,boolean) from public,anon;
grant execute on function public.get_customer_directory(int,text,text,text,boolean) to authenticated;
