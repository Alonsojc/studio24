-- Customer credit is an append-only ledger. Browsers may read it but only the
-- validated transaction below may change balances and the corresponding payments.
create table public.customer_advances (
  id text primary key,
  folio bigint generated always as identity unique,
  team_id uuid not null references public.teams(id),
  user_id uuid not null references auth.users(id),
  cliente_id text not null references public.clientes(id) on delete restrict,
  ingreso_id text not null references public.ingresos(id) on delete restrict,
  source text not null check (source in ('new','existing')),
  fecha date not null,
  amount numeric(14,2) not null check (amount > 0),
  forma_pago text not null check (forma_pago in ('efectivo','tarjeta','transferencia','otro')),
  referencia text not null default '',
  notas text not null default '',
  receipt_path text not null default '',
  voided_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create unique index customer_advances_active_income on public.customer_advances(team_id,ingreso_id) where voided_at is null;
create index customer_advances_team_client on public.customer_advances(team_id,cliente_id,created_at,id);
create index customer_advances_income on public.customer_advances(ingreso_id);
create index customer_advances_user on public.customer_advances(user_id);
create index customer_advances_client on public.customer_advances(cliente_id);
create index customer_advances_receipt on public.customer_advances(team_id,receipt_path) where receipt_path<>'';

create table public.customer_account_movements (
  id text primary key,
  sequence bigint generated always as identity unique,
  team_id uuid not null references public.teams(id),
  user_id uuid not null references auth.users(id),
  cliente_id text not null references public.clientes(id) on delete restrict,
  advance_id text not null references public.customer_advances(id) on delete restrict,
  pedido_id text references public.pedidos(id) on delete restrict,
  pedido_descripcion text not null default '',
  kind text not null check (kind in ('deposit','apply','reverse_application','cancel')),
  fecha date not null,
  amount numeric(14,2) not null check (amount > 0),
  referencia text not null default '',
  notas text not null default '',
  reverses_id text unique references public.customer_account_movements(id) on delete restrict,
  operation_id uuid not null,
  request jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(team_id,operation_id),
  check ((kind in ('apply','reverse_application')) = (pedido_id is not null)),
  check ((kind = 'reverse_application') = (reverses_id is not null))
);
create index customer_movements_team_client on public.customer_account_movements(team_id,cliente_id,sequence);
create index customer_movements_advance on public.customer_account_movements(advance_id,sequence);
create index customer_movements_order on public.customer_account_movements(pedido_id);
create index customer_movements_client on public.customer_account_movements(cliente_id);
create index customer_movements_user on public.customer_account_movements(user_id);

alter table public.customer_advances enable row level security;
alter table public.customer_account_movements enable row level security;
revoke all on public.customer_advances,public.customer_account_movements from anon,authenticated;
grant select on public.customer_advances,public.customer_account_movements to authenticated;
create policy customer_advances_finance_read on public.customer_advances for select to authenticated
  using (team_id=(select app_private.current_user_team_id()) and (select app_private.current_user_has_role('admin','contador')));
create policy customer_movements_finance_read on public.customer_account_movements for select to authenticated
  using (team_id=(select app_private.current_user_team_id()) and (select app_private.current_user_has_role('admin','contador')));
create trigger customer_advance_audit after insert or update or delete on public.customer_advances
  for each row execute function public.capture_audit_log();
create trigger customer_movement_audit after insert or update or delete on public.customer_account_movements
  for each row execute function public.capture_audit_log();

create function public.get_customer_account(p_cliente_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_team uuid:=app_private.current_user_team_id(); v_result jsonb;
begin
  if auth.uid() is null or v_team is null or not app_private.current_user_has_role('admin','contador') then
    raise exception 'Solo administracion y contabilidad pueden consultar saldos';
  end if;
  if not exists(select 1 from public.clientes where id=p_cliente_id and team_id=v_team) then
    raise exception 'Cliente no disponible en el equipo';
  end if;
  select jsonb_build_object(
    'cliente',(select to_jsonb(c) from public.clientes c where c.id=p_cliente_id and c.team_id=v_team),
    'advances',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id) from public.customer_advances a where a.team_id=v_team and a.cliente_id=p_cliente_id),'[]'::jsonb),
    'movements',coalesce((select jsonb_agg(to_jsonb(m)-'request' order by m.sequence) from public.customer_account_movements m where m.team_id=v_team and m.cliente_id=p_cliente_id),'[]'::jsonb),
    'pedidos',coalesce((select jsonb_agg(to_jsonb(p) order by p.fecha_pedido,p.id) from public.pedidos p where p.team_id=v_team and p.cliente_id=p_cliente_id),'[]'::jsonb),
    'ingresos',coalesce((select jsonb_agg(to_jsonb(i) order by i.fecha,i.id) from public.ingresos i where i.team_id=v_team and i.cliente_id=p_cliente_id),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.get_customer_account(text) from public,anon;
grant execute on function public.get_customer_account(text) to authenticated;

create function public.get_customer_credit_ledger() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_team uuid:=app_private.current_user_team_id();
begin
  if auth.uid() is null or v_team is null or not app_private.current_user_has_role('admin','contador') then raise exception 'Sin permiso para consultar el historial de saldos'; end if;
  return jsonb_build_object(
    'advances',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id) from public.customer_advances a where a.team_id=v_team),'[]'::jsonb),
    'movements',coalesce((select jsonb_agg(to_jsonb(m)-'request' order by m.sequence) from public.customer_account_movements m where m.team_id=v_team),'[]'::jsonb),
    'pedidos',coalesce((select jsonb_agg(to_jsonb(p)) from public.pedidos p where p.team_id=v_team and exists(select 1 from public.customer_account_movements m where m.team_id=v_team and m.pedido_id=p.id)),'[]'::jsonb),
    'ingresos',coalesce((select jsonb_agg(to_jsonb(i)) from public.ingresos i where i.team_id=v_team and exists(select 1 from public.customer_advances a where a.team_id=v_team and a.ingreso_id=i.id)),'[]'::jsonb),
    'clientes',coalesce((select jsonb_agg(to_jsonb(c)) from public.clientes c where c.team_id=v_team and exists(select 1 from public.customer_advances a where a.team_id=v_team and a.cliente_id=c.id)),'[]'::jsonb)
  );
end $$;
revoke all on function public.get_customer_credit_ledger() from public,anon;
grant execute on function public.get_customer_credit_ledger() to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('customer-receipts','customer-receipts',false,10*1024*1024,array['application/pdf','image/jpeg','image/png']);
create policy customer_receipts_read on storage.objects for select to authenticated
  using(bucket_id='customer-receipts' and (storage.foldername(name))[1]=app_private.current_user_team_id()::text and app_private.current_user_has_role('admin','contador'));
create policy customer_receipts_insert on storage.objects for insert to authenticated
  with check(bucket_id='customer-receipts' and (storage.foldername(name))[1]=app_private.current_user_team_id()::text and app_private.current_user_has_role('admin','contador'));
create policy customer_receipts_remove_unlinked on storage.objects for delete to authenticated
  using(bucket_id='customer-receipts' and (storage.foldername(name))[1]=app_private.current_user_team_id()::text and app_private.current_user_has_role('admin','contador') and not exists(select 1 from public.customer_advances a where a.team_id=app_private.current_user_team_id() and a.receipt_path=name));

-- The definer is private because direct table writes are intentionally revoked.
-- Every request derives its team and actor from the authenticated session.
create function app_private.customer_account_command(p_action text,p_operation uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_team uuid:=app_private.current_user_team_id(); v_actor uuid:=auth.uid();
  v_client text:=p_data->>'clienteId'; v_request jsonb:=jsonb_build_object('action',p_action,'data',p_data);
  v_previous public.customer_account_movements%rowtype;
  v_advance public.customer_advances%rowtype;
  v_original public.customer_account_movements%rowtype;
  v_order public.pedidos%rowtype; v_income public.ingresos%rowtype;
  v_date date; v_amount numeric; v_available numeric; v_paid numeric; v_credit numeric;
  v_payments jsonb; v_id text:=p_operation::text; v_income_id text;
  v_source text; v_reference text:=coalesce(p_data->>'referencia',''); v_notes text:=coalesce(p_data->>'notas','');
begin
  if v_actor is null or v_team is null or not app_private.current_user_has_role('admin','contador') then
    raise exception 'Solo administracion y contabilidad pueden mover saldos';
  end if;
  if p_operation is null or v_client is null or length(v_reference)>200 or length(v_notes)>2000 then
    raise exception 'Datos del movimiento invalidos';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_team::text||':customer-account:'||v_client,0));
  if not exists(select 1 from public.clientes where id=v_client and team_id=v_team) then
    raise exception 'Cliente no disponible en el equipo';
  end if;
  select * into v_previous from public.customer_account_movements where team_id=v_team and operation_id=p_operation;
  if found then
    if v_previous.request is distinct from v_request then raise exception 'La operacion ya se uso con otros datos'; end if;
    return public.get_customer_account(v_client);
  end if;
  v_date:=coalesce(nullif(p_data->>'fecha','')::date,(clock_timestamp() at time zone 'America/Mexico_City')::date);
  if v_date > (clock_timestamp() at time zone 'America/Mexico_City')::date then raise exception 'La fecha no puede ser futura'; end if;

  if p_action='receive' then
    if coalesce(p_data->>'receiptPath','')<>'' and (
      p_data->>'receiptPath' !~ ('^'||v_team::text||'/'||v_id||'/receipt[.](pdf|jpg|png)$')
      or not exists(select 1 from storage.objects where bucket_id='customer-receipts' and name=p_data->>'receiptPath')
    ) then raise exception 'El comprobante no esta disponible para este adelanto'; end if;
    v_source:=coalesce(p_data->>'source','new');
    if v_source='existing' then
      perform pg_advisory_xact_lock(hashtextextended(v_team::text||':ingresos:'||(p_data->>'ingresoId'),0));
      select * into v_income from public.ingresos where id=p_data->>'ingresoId' and team_id=v_team for update;
      if not found or v_income.cliente_id is distinct from v_client or coalesce(v_income.pedido_id,'')<>'' or v_income.monto_total<=0 then
        raise exception 'Selecciona un ingreso de esta clienta, sin pedido y con importe positivo';
      end if;
      if exists(select 1 from public.customer_advances where team_id=v_team and ingreso_id=v_income.id and voided_at is null) then
        raise exception 'Este ingreso ya tiene un adelanto registrado';
      end if;
      v_amount:=v_income.monto_total; v_date:=v_income.fecha::date; v_income_id:=v_income.id;
      if v_date > (clock_timestamp() at time zone 'America/Mexico_City')::date then raise exception 'El ingreso tiene una fecha futura'; end if;
    elsif v_source='new' then
      v_amount:=(p_data->>'amount')::numeric;
      if v_amount is null or not(v_amount>0 and v_amount<=999999999999.99 and v_amount=round(v_amount,2)) then
        raise exception 'Ingresa un importe positivo con maximo dos decimales';
      end if;
      if coalesce(p_data->>'formaPago','') not in ('efectivo','tarjeta','transferencia','otro') then raise exception 'Forma de pago invalida'; end if;
      v_income_id:=gen_random_uuid()::text;
      insert into public.ingresos(id,team_id,user_id,fecha,cliente_id,pedido_id,descripcion,concepto,monto,iva,monto_total,forma_pago,factura,numero_factura,notas)
        values(v_income_id,v_team,v_actor,v_date::text,v_client,'','Adelanto de cliente','otro',v_amount,0,v_amount,p_data->>'formaPago',false,'',v_notes)
        returning * into v_income;
    else raise exception 'Origen de adelanto invalido'; end if;
    if v_amount is null or not(v_amount>0 and v_amount<=999999999999.99 and v_amount=round(v_amount,2)) then raise exception 'Importe del ingreso invalido'; end if;
    insert into public.customer_advances(id,team_id,user_id,cliente_id,ingreso_id,source,fecha,amount,forma_pago,referencia,notas,receipt_path)
      values(v_id,v_team,v_actor,v_client,v_income_id,v_source,v_date,v_amount,v_income.forma_pago,v_reference,v_notes,coalesce(p_data->>'receiptPath',''));
    insert into public.customer_account_movements(id,team_id,user_id,cliente_id,advance_id,kind,fecha,amount,referencia,notas,operation_id,request)
      values(v_id,v_team,v_actor,v_client,v_id,'deposit',v_date,v_amount,v_reference,v_notes,p_operation,v_request);

  elsif p_action in ('apply','reverse_application','cancel') then
    if p_action='reverse_application' and length(trim(v_notes))=0 then raise exception 'Indica el motivo de la correccion'; end if;
    if p_action='reverse_application' then
      select * into v_original from public.customer_account_movements where id=p_data->>'movementId' and team_id=v_team and cliente_id=v_client and kind='apply';
      if not found then raise exception 'Aplicacion no disponible'; end if;
      if exists(select 1 from public.customer_account_movements where reverses_id=v_original.id) then raise exception 'Esta aplicacion ya fue revertida'; end if;
      select * into v_advance from public.customer_advances where id=v_original.advance_id and team_id=v_team and cliente_id=v_client for update;
    else
      select * into v_advance from public.customer_advances where id=p_data->>'advanceId' and team_id=v_team and cliente_id=v_client for update;
    end if;
    if not found or v_advance.voided_at is not null then raise exception 'Adelanto no disponible'; end if;
    if v_date<(select max(fecha) from public.customer_account_movements where advance_id=v_advance.id) then
      raise exception 'La fecha debe ser igual o posterior al ultimo movimiento del adelanto';
    end if;
    select coalesce(sum(case when kind in ('deposit','reverse_application') then amount else -amount end),0)
      into v_available from public.customer_account_movements where advance_id=v_advance.id;

    if p_action='cancel' then
      if not app_private.current_user_has_role('admin') then raise exception 'Solo administracion puede anular adelantos'; end if;
      if length(trim(v_notes))=0 then raise exception 'Indica el motivo de la anulacion'; end if;
      if v_available<>v_advance.amount then raise exception 'Revierte primero todas las aplicaciones de este adelanto'; end if;
      if v_advance.source='new' then
        perform pg_advisory_xact_lock(hashtextextended(v_team::text||':ingresos:'||v_advance.ingreso_id,0));
        select * into v_income from public.ingresos where id=v_advance.ingreso_id and team_id=v_team for update;
        if v_income.factura or coalesce(v_income.uuid_cfdi,'')<>'' or coalesce(v_income.xml_url,'')<>'' or coalesce(v_income.pdf_url,'')<>'' then
          raise exception 'El ingreso tiene factura. Revisa el movimiento con contabilidad antes de anular';
        end if;
        update public.ingresos set monto=0,iva=0,monto_total=0,notas=concat_ws(E'\n',notas,'Adelanto anulado por captura: '||v_notes)
          where id=v_income.id and team_id=v_team;
      end if;
      update public.customer_advances set voided_at=clock_timestamp(),updated_at=clock_timestamp() where id=v_advance.id;
      insert into public.customer_account_movements(id,team_id,user_id,cliente_id,advance_id,kind,fecha,amount,referencia,notas,operation_id,request)
        values(v_id,v_team,v_actor,v_client,v_advance.id,'cancel',v_date,v_available,v_reference,v_notes,p_operation,v_request);
    else
      if p_action='apply' then v_amount:=(p_data->>'amount')::numeric; else v_amount:=v_original.amount; end if;
      if v_amount is null or not(v_amount>0 and v_amount<=999999999999.99 and v_amount=round(v_amount,2)) then raise exception 'Importe invalido'; end if;
      if p_action='apply' and v_amount>v_available then raise exception 'El importe supera el saldo disponible del adelanto'; end if;
      perform pg_advisory_xact_lock(hashtextextended(v_team::text||':pedidos:'||case when p_action='apply' then p_data->>'pedidoId' else v_original.pedido_id end,0));
      select * into v_order from public.pedidos where id=case when p_action='apply' then p_data->>'pedidoId' else v_original.pedido_id end
        and team_id=v_team and cliente_id=v_client for update;
      if not found or v_order.estado='cancelado' then raise exception 'Selecciona un pedido vigente de esta clienta'; end if;
      v_payments:=coalesce(v_order.pagos,'[]'::jsonb);
      if jsonb_array_length(v_payments)=0 and v_order.monto_pagado>0 then
        v_payments:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'fecha',v_order.fecha_pedido,'formaPago','otro','monto',v_order.monto_pagado,'referencia','Pago previo registrado','createdAt',clock_timestamp()));
      end if;
      select coalesce(sum(greatest((x->>'monto')::numeric,0)),0) into v_paid from jsonb_array_elements(v_payments) x;
      if v_paid is distinct from v_order.monto_pagado then raise exception 'Los pagos del pedido no coinciden. Revisalos antes de aplicar saldo'; end if;
      if p_action='apply' then
        if v_amount>v_order.monto_total-v_paid then raise exception 'El importe supera lo pendiente del pedido'; end if;
        select coalesce(sum(case when kind='apply' then amount else -amount end),0) into v_credit
          from public.customer_account_movements where pedido_id=v_order.id and kind in ('apply','reverse_application');
        if coalesce((select sum(monto_total) from public.ingresos where team_id=v_team and pedido_id=v_order.id),0)+v_credit+v_amount>v_order.monto_total then
          raise exception 'El pedido ya tiene ingresos registrados. Concilialos antes de aplicar este saldo';
        end if;
        v_payments:=v_payments||jsonb_build_array(jsonb_build_object('id',v_id,'fecha',v_date,'formaPago','otro','monto',v_amount,'referencia',v_reference,'origen','saldo_cliente','anticipoId',v_advance.id,'createdAt',clock_timestamp()));
      else
        if not exists(select 1 from jsonb_array_elements(v_payments) x where x->>'id'=v_original.id and x->>'origen'='saldo_cliente') then
          raise exception 'No se encontro el pago original en el pedido';
        end if;
        select coalesce(jsonb_agg(x),'[]'::jsonb) into v_payments from jsonb_array_elements(v_payments) x where x->>'id' is distinct from v_original.id;
      end if;
      select coalesce(sum(greatest((x->>'monto')::numeric,0)),0) into v_paid from jsonb_array_elements(v_payments) x;
      update public.pedidos set pagos=v_payments,monto_pagado=v_paid,
        estado_pago=case when v_paid>=monto_total and monto_total>0 then 'pagado' when v_paid>0 then 'parcial' else 'pendiente' end
        where id=v_order.id and team_id=v_team;
      insert into public.customer_account_movements(id,team_id,user_id,cliente_id,advance_id,pedido_id,pedido_descripcion,kind,fecha,amount,referencia,notas,reverses_id,operation_id,request)
        values(v_id,v_team,v_actor,v_client,v_advance.id,v_order.id,v_order.descripcion,p_action,v_date,v_amount,v_reference,v_notes,case when p_action='reverse_application' then v_original.id end,p_operation,v_request);
    end if;
  else raise exception 'Accion de cuenta invalida'; end if;
  return public.get_customer_account(v_client);
end $$;
revoke all on function app_private.customer_account_command(text,uuid,jsonb) from public,anon;
grant execute on function app_private.customer_account_command(text,uuid,jsonb) to authenticated;
create function public.customer_account_command(p_action text,p_operation uuid,p_data jsonb) returns jsonb
language sql security invoker set search_path='' as $$
  select app_private.customer_account_command(p_action,p_operation,p_data);
$$;
revoke all on function public.customer_account_command(text,uuid,jsonb) from public,anon;
grant execute on function public.customer_account_command(text,uuid,jsonb) to authenticated;

-- Generic editing, old devices and the sync API may not remove server-owned
-- credit payments or mutate the money backing an advance.
create function app_private.order_has_customer_credit(p_order_id text) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.customer_account_movements
    where pedido_id=p_order_id and team_id=app_private.current_user_team_id());
$$;
revoke all on function app_private.order_has_customer_credit(text) from public,anon;
grant execute on function app_private.order_has_customer_credit(text) to authenticated;
create function app_private.guard_customer_credit() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_old jsonb; v_new jsonb; v_credit numeric; v_paid numeric;
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
      if (new.cliente_id,new.pedido_id,new.monto,new.iva,new.monto_total,new.fecha,new.forma_pago) is distinct from
        (old.cliente_id,old.pedido_id,old.monto,old.iva,old.monto_total,old.fecha,old.forma_pago) then
        raise exception 'CONFLICT: el importe del adelanto se corrige desde la cuenta de la clienta';
      end if;
    end if;
    if tg_op<>'DELETE' and coalesce(new.pedido_id,'')<>'' then
      perform pg_advisory_xact_lock(hashtextextended(new.team_id::text||':pedidos:'||new.pedido_id,0));
      select coalesce(sum(case when kind='apply' then amount else -amount end),0) into v_credit
        from public.customer_account_movements where team_id=new.team_id and pedido_id=new.pedido_id and kind in ('apply','reverse_application');
      if v_credit>0 and new.monto_total>(select monto_total from public.pedidos where id=new.pedido_id and team_id=new.team_id)-v_credit then
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
create trigger guard_customer_credit_income before insert or update or delete on public.ingresos
  for each row execute function app_private.guard_customer_credit();
create trigger guard_customer_credit_order before insert or update or delete on public.pedidos
  for each row execute function app_private.guard_customer_credit();
create trigger guard_customer_credit_client before delete on public.clientes
  for each row execute function app_private.guard_customer_credit();
