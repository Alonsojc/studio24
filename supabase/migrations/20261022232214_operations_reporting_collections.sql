-- Additive operational metadata; no historical money or balances are rewritten.
alter table public.pedidos add column if not exists payment_due_date date;
alter table public.pedidos add column if not exists next_followup_date date;
alter table public.pedidos add column if not exists collection_notes text not null default '';
create index if not exists pedidos_team_collection_idx on public.pedidos(team_id,next_followup_date)
  where estado <> 'cancelado' and monto_pagado < monto_total;

create function public.get_order_summary(p_scope text default 'active') returns jsonb
language sql stable security invoker set search_path='' as $$
  with scoped as (select * from public.pedidos where team_id=app_private.current_user_team_id()
    and (p_scope='all' or estado not in ('entregado','cancelado'))),
  statuses as (select estado,count(*) as count from scoped group by estado),
  payments as (select estado_pago,count(*) as count,sum(monto_total) as total,sum(monto_pagado) as paid
    from scoped where estado<>'cancelado' group by estado_pago)
  select jsonb_build_object(
    'activeCount',(select count(*) from scoped where estado not in ('entregado','cancelado')),
    'activeTotal',coalesce((select sum(monto_total) from scoped where estado not in ('entregado','cancelado')),0),
    'statuses',coalesce((select jsonb_object_agg(estado,count) from statuses),'{}'::jsonb),
    'payments',coalesce((select jsonb_object_agg(estado_pago,to_jsonb(payments)-'estado_pago') from payments),'{}'::jsonb)
  );
$$;
revoke all on function public.get_order_summary(text) from public,anon;
grant execute on function public.get_order_summary(text) to authenticated;

create function app_private.guard_order_payment_history() returns trigger
language plpgsql security invoker set search_path='' as $$
declare item jsonb; total numeric;
begin
  if current_user not in ('authenticated','anon') then return new; end if;
  for item in select value from jsonb_array_elements(coalesce(old.pagos,'[]'::jsonb)) loop
    if not coalesce(new.pagos,'[]'::jsonb) @> jsonb_build_array(item) then
      raise exception 'CONFLICT: conserva el historial de abonos del pedido';
    end if;
  end loop;
  if coalesce(jsonb_array_length(new.pagos),0)>0 then
    select sum((value->>'monto')::numeric) into total from jsonb_array_elements(new.pagos);
    if total is distinct from new.monto_pagado or new.monto_pagado>new.monto_total then
      raise exception 'CONFLICT: el total pagado debe coincidir con sus abonos';
    end if;
    if coalesce(jsonb_array_length(old.pagos),0)=0 and new.monto_pagado<old.monto_pagado then
      raise exception 'CONFLICT: conserva el importe pagado anterior';
    end if;
  end if;
  return new;
end $$;
revoke all on function app_private.guard_order_payment_history() from public,anon,authenticated;
create trigger guard_order_payment_history before update on public.pedidos
  for each row execute function app_private.guard_order_payment_history();

create function app_private.save_collection_followup(
  p_id text,p_expected timestamptz,p_due date,p_next date,p_notes text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.pedidos%rowtype; team uuid:=app_private.current_user_team_id();
begin
  if auth.uid() is null or not app_private.current_user_has_role('admin','contador') then
    raise exception 'Sin permiso para gestionar cobranza' using errcode='42501';
  end if;
  if length(coalesce(p_notes,''))>2000 then raise exception 'Las notas exceden 2000 caracteres'; end if;
  select * into item from public.pedidos where id=p_id and team_id=team for update;
  if not found then raise exception 'Pedido no disponible' using errcode='42501'; end if;
  if p_expected is null or item.updated_at is distinct from p_expected then
    raise exception 'CONFLICT: el pedido cambio. Actualiza antes de guardar el seguimiento';
  end if;
  update public.pedidos set payment_due_date=p_due,next_followup_date=p_next,collection_notes=coalesce(p_notes,'')
    where id=p_id and team_id=team returning * into item;
  return to_jsonb(item);
end $$;
revoke all on function app_private.save_collection_followup(text,timestamptz,date,date,text) from public,anon;
grant execute on function app_private.save_collection_followup(text,timestamptz,date,date,text) to authenticated;
create function public.save_collection_followup(p_id text,p_expected timestamptz,p_due date,p_next date,p_notes text)
returns jsonb language sql security invoker set search_path='' as $$
  select app_private.save_collection_followup(p_id,p_expected,p_due,p_next,p_notes);
$$;
revoke all on function public.save_collection_followup(text,timestamptz,date,date,text) from public,anon;
grant execute on function public.save_collection_followup(text,timestamptz,date,date,text) to authenticated;

create function public.get_collections(p_page int default 0,p_search text default '',p_filter text default 'all') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; today date:=(statement_timestamp() at time zone 'America/Mexico_City')::date;
begin
  if auth.uid() is null or not app_private.current_user_has_role('admin','contador') then
    raise exception 'Sin permiso para consultar cobranza' using errcode='42501';
  end if;
  if p_page<0 or p_page>100000 or length(p_search)>200 or p_filter not in ('all','overdue','followup') then
    raise exception 'Filtro de cobranza invalido';
  end if;
  with cartera as (
    select p.*,c.nombre as cliente_nombre,c.telefono as cliente_telefono,
      greatest(0,p.monto_total-p.monto_pagado) as pending,
      (select max(nullif(value->>'fecha','')) from jsonb_array_elements(coalesce(p.pagos,'[]'::jsonb))) as last_payment_date
    from public.pedidos p left join public.clientes c on c.id=p.cliente_id and c.team_id=p.team_id
    where p.team_id=app_private.current_user_team_id() and p.estado<>'cancelado' and p.monto_total>p.monto_pagado
  ), filtered as (
    select * from cartera where (p_search='' or concat_ws(' ',cliente_nombre,descripcion) ilike '%'||p_search||'%')
      and (p_filter<>'overdue' or payment_due_date<today)
      and (p_filter<>'followup' or next_followup_date<=today)
  ), page as (
    select * from filtered order by payment_due_date nulls last,pending desc,id limit 50 offset p_page*50
  )
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),
    'total',(select count(*) from filtered),
    'totalPending',coalesce((select sum(pending) from cartera),0),
    'overduePending',coalesce((select sum(pending) from cartera where payment_due_date<today),0),
    'overdueCount',(select count(*) from cartera where payment_due_date<today),
    'followupCount',(select count(*) from cartera where next_followup_date<=today)) into result;
  return result;
end $$;
revoke all on function public.get_collections(int,text,text) from public,anon;
grant execute on function public.get_collections(int,text,text) to authenticated;

create function public.get_advance_report(p_year int) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not app_private.current_user_has_role('admin','contador') then
    raise exception 'Sin permiso para consultar finanzas' using errcode='42501';
  end if;
  if p_year not between 2000 and 2200 then raise exception 'Ano invalido'; end if;
  with months as (
    select make_date(p_year,m,1) as start_date,(make_date(p_year,m,1)+interval '1 month')::date as end_date
    from generate_series(1,12) m
  ), advances as (
    select a.*,i.monto,i.monto_total,i.fecha::date as received_date,
      case when i.monto_total>0 then i.monto/i.monto_total else 0 end as net_ratio
    from public.customer_advances a join public.ingresos i on i.id=a.ingreso_id and i.team_id=a.team_id
    where a.team_id=app_private.current_user_team_id() and a.voided_at is null
  ), applications as (
    select m.fecha,m.amount*(case when m.kind='apply' then 1 else -1 end) as amount,
      a.net_ratio,
      case when p.estado='entregado' and nullif(p.fecha_entrega_real,'') is not null
        then greatest(m.fecha,p.fecha_entrega_real::date) else '9999-12-31'::date end as recognized_date
    from public.customer_account_movements m join advances a on a.id=m.advance_id
    join public.pedidos p on p.id=m.pedido_id and p.team_id=m.team_id
    where m.kind in ('apply','reverse_application')
  )
  select jsonb_agg(jsonb_build_object(
    'month',to_char(start_date,'YYYY-MM'),
    'received',coalesce((select sum(monto_total) from advances where received_date>=start_date and received_date<end_date),0),
    'receivedNet',coalesce((select sum(monto) from advances where received_date>=start_date and received_date<end_date),0),
    'appliedNet',coalesce((select sum(amount*net_ratio) from applications where recognized_date>=start_date and recognized_date<end_date),0),
    'available',coalesce((select sum(case when m.kind in ('deposit','reverse_application') then m.amount else -m.amount end)
      from public.customer_account_movements m join advances a on a.id=m.advance_id where m.fecha<end_date),0),
    'assigned',coalesce((select sum(amount) from applications where fecha<end_date and recognized_date>=end_date),0)
  ) order by start_date) into result from months;
  return result;
end $$;
revoke all on function public.get_advance_report(int) from public,anon;
grant execute on function public.get_advance_report(int) to authenticated;

-- A consistent logical snapshot for the private, encrypted backup job only.
create function public.export_business_snapshot() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb:='{}'; tbl text; rows jsonb;
begin
  foreach tbl in array array['clientes','proveedores','pedidos','ingresos','egresos','productos','cotizaciones',
    'inventario','disenos','plantillas','config','finance_entries','egresos_recurrentes','recurrentes_log',
    'customer_advances','customer_account_movements','folio_counter','deleted_records','audit_log',
    'teams','team_members','profiles','invitations','inpc'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from public.%I t',tbl) into rows;
    result:=result||jsonb_build_object(tbl,rows);
  end loop;
  return jsonb_build_object('schemaVersion',2,'createdAt',statement_timestamp(),'tables',result);
end $$;
revoke all on function public.export_business_snapshot() from public,anon,authenticated;
grant execute on function public.export_business_snapshot() to service_role;
