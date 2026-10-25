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
