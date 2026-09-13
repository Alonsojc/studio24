-- Durable deletion history, optimistic writes, and team-owned finance state.
create table public.finance_entries (
  id text primary key,
  team_id uuid not null default app_private.current_user_team_id() references public.teams(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id),
  kind text not null check (kind in ('reinversion','donacion','perdida')),
  period text not null check (period ~ '^\d{4}(-\d{2}|-anual)?$'),
  amount numeric not null default 0 check (amount >= 0),
  separated boolean not null default false,
  actor_id uuid default auth.uid() references auth.users(id) on delete set null,
  separated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(team_id,kind,period)
);
alter table public.finance_entries enable row level security;
grant select,insert,update,delete on public.finance_entries to authenticated;
create policy finance_entries_read on public.finance_entries for select to authenticated
  using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin','contador'));
create policy finance_entries_insert on public.finance_entries for insert to authenticated
  with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin','contador'));
create policy finance_entries_update on public.finance_entries for update to authenticated
  using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin','contador'))
  with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin','contador'));
create policy finance_entries_delete on public.finance_entries for delete to authenticated
  using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin'));
create trigger set_finance_entries_updated_at before update on public.finance_entries
  for each row execute function public.set_updated_at();
create trigger audit_finance_entries after insert or update or delete on public.finance_entries
  for each row execute function public.capture_audit_log();

create table public.deleted_records (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  table_name text not null,
  record_id text not null,
  deleted_at timestamptz not null default now(),
  unique(team_id,table_name,record_id)
);
alter table public.deleted_records enable row level security;
grant select on public.deleted_records to authenticated;
create policy deleted_records_read on public.deleted_records for select to authenticated
  using (team_id = app_private.current_user_team_id() and
    (table_name not in ('ingresos','egresos','egresos_recurrentes','finance_entries')
      or app_private.current_user_has_role('admin','contador')));
create index deleted_records_team_id_idx on public.deleted_records(team_id,id);

create or replace function app_private.remember_deleted_record() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.deleted_records(team_id,table_name,record_id)
    values(old.team_id,tg_table_name,old.id)
    on conflict(team_id,table_name,record_id) do update set deleted_at=now();
  return old;
end $$;
revoke all on function app_private.remember_deleted_record() from public;
do $$ declare tbl text; begin
  foreach tbl in array array['clientes','proveedores','ingresos','egresos','pedidos','productos',
    'cotizaciones','egresos_recurrentes','inventario','disenos','plantillas','finance_entries'] loop
    execute format('create trigger remember_deleted after delete on public.%I for each row execute function app_private.remember_deleted_record()',tbl);
    execute format('alter table public.%I add column sync_operation text',tbl);
  end loop;
end $$;
alter table public.config add column sync_operation text;

-- Recover only genuine deletions, not records subsequently re-created.
do $$ declare r record; present boolean; begin
  for r in select distinct team_id,table_name,record_id from public.audit_log where action='DELETE' and team_id is not null
    and table_name in ('clientes','proveedores','ingresos','egresos','pedidos','productos','cotizaciones','egresos_recurrentes','inventario','disenos','plantillas') loop
    execute format('select exists(select 1 from public.%I where team_id=$1 and id=$2)',r.table_name) into present using r.team_id,r.record_id;
    if not present then
      insert into public.deleted_records(team_id,table_name,record_id) values(r.team_id,r.table_name,r.record_id) on conflict do nothing;
    end if;
  end loop;
end $$;

create or replace function public.sync_write_record(p_table text,p_record jsonb,p_expected timestamptz,p_operation text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_team uuid := app_private.current_user_team_id(); v_id text; v_old jsonb; v_result jsonb;
  v_key text; v_cols text; v_values text; v_updates text; v_data jsonb;
begin
  if auth.uid() is null or v_team is null then raise exception 'Sesion requerida'; end if;
  if p_table not in ('clientes','proveedores','ingresos','egresos','pedidos','productos','cotizaciones',
      'egresos_recurrentes','inventario','disenos','plantillas','config','finance_entries')
    or p_operation is null or length(p_operation) < 16 then raise exception 'Operacion invalida'; end if;
  v_key := case when p_table='config' then 'team_id' else 'id' end;
  v_id := case when p_table='config' then v_team::text else p_record->>'id' end;
  if v_id is null then raise exception 'ID requerido'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_team::text || ':' || p_table || ':' || v_id,0));
  execute format('select to_jsonb(t) from public.%I t where %I::text=$1 and team_id=$2 for update',p_table,v_key)
    into v_old using v_id,v_team;
  if v_old->>'sync_operation'=p_operation then return v_old; end if;
  if exists(select 1 from public.deleted_records where team_id=v_team and table_name=p_table and record_id=v_id) then
    raise exception 'CONFLICT: registro eliminado en otro dispositivo';
  end if;
  if v_old is not null and (p_expected is null or (v_old->>'updated_at')::timestamptz is distinct from p_expected) then
    raise exception 'CONFLICT: existe una version mas reciente; revisa el registro antes de guardar';
  end if;
  if v_old is null and p_expected is not null then raise exception 'CONFLICT: registro no disponible'; end if;
  v_data := (p_record - array['user_id','team_id','updated_at','sync_operation']) ||
    jsonb_build_object('team_id',v_team,'sync_operation',p_operation,'updated_at',clock_timestamp());
  if p_table='config' then v_data := v_data - array['id','created_at']; end if;
  if v_old is null then v_data := v_data || jsonb_build_object('user_id',auth.uid());
  else v_data := v_data - 'created_at'; end if;
  if p_table='finance_entries' then v_data := v_data || jsonb_build_object('actor_id',auth.uid()); end if;
  if exists(select 1 from jsonb_object_keys(v_data) k where not exists(
    select 1 from information_schema.columns where table_schema='public' and table_name=p_table and column_name=k)) then
    raise exception 'Campos no reconocidos; actualiza la aplicacion';
  end if;
  select string_agg(format('%I',k),','),string_agg(format('r.%I',k),','),
    string_agg(format('%I=r.%I',k,k),',') into v_cols,v_values,v_updates from jsonb_object_keys(v_data) k;
  if v_old is null then
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning to_jsonb(%I.*)',p_table,v_cols,v_values,p_table,p_table)
      into v_result using v_data;
  else
    execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.%I::text=$2 and t.team_id=$3 returning to_jsonb(t.*)',p_table,v_updates,p_table,v_key)
      into v_result using v_data,v_id,v_team;
    if v_result is null then raise exception 'Sin permiso para editar'; end if;
  end if;
  return v_result;
end $$;
revoke all on function public.sync_write_record(text,jsonb,timestamptz,text) from public;
grant execute on function public.sync_write_record(text,jsonb,timestamptz,text) to authenticated;

create or replace function public.sync_delete_record(p_table text,p_id text,p_expected timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
declare v_team uuid:=app_private.current_user_team_id(); v_old jsonb; affected integer;
begin
  if auth.uid() is null or not app_private.current_user_has_role('admin') then raise exception 'Solo administradores pueden eliminar'; end if;
  if p_table not in ('clientes','proveedores','ingresos','egresos','pedidos','productos','cotizaciones',
    'egresos_recurrentes','inventario','disenos','plantillas','finance_entries') then raise exception 'Tabla invalida'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_team::text || ':' || p_table || ':' || p_id,0));
  execute format('select to_jsonb(t) from public.%I t where id=$1 and team_id=$2 for update',p_table) into v_old using p_id,v_team;
  if v_old is null then return; end if;
  if p_expected is null or (v_old->>'updated_at')::timestamptz is distinct from p_expected then raise exception 'CONFLICT: existe una version mas reciente'; end if;
  execute format('delete from public.%I where id=$1 and team_id=$2',p_table) using p_id,v_team;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'No se pudo eliminar'; end if;
end $$;
revoke all on function public.sync_delete_record(text,text,timestamptz) from public;
grant execute on function public.sync_delete_record(text,text,timestamptz) to authenticated;

drop policy "Team reads ingresos" on public.ingresos;
drop policy "Team reads egresos" on public.egresos;
drop policy "Team reads egresos recurrentes" on public.egresos_recurrentes;
drop policy "Team reads recurrentes log" on public.recurrentes_log;
do $$ declare tbl text; begin
  foreach tbl in array array['ingresos','egresos','egresos_recurrentes','recurrentes_log'] loop
    execute format('create policy finance_reads on public.%I for select to authenticated using (team_id=app_private.current_user_team_id() and app_private.current_user_has_role(''admin'',''contador''))',tbl);
  end loop;
end $$;
drop policy "Team reads own facturas" on storage.objects;
create policy "Finance reads own facturas" on storage.objects for select to authenticated
  using(bucket_id='facturas' and (storage.foldername(name))[1]=app_private.current_user_team_id()::text and app_private.current_user_has_role('admin','contador'));

create or replace function public.get_public_pedido_tracking(p_token text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('pedido',jsonb_build_object(
    'descripcion',p.descripcion,'concepto',p.concepto,'piezas',p.piezas,'montoTotal',p.monto_total,
    'estado',p.estado,'estadoPago',p.estado_pago,'montoPagado',p.monto_pagado,
    'fechaPedido',p.fecha_pedido,'fechaEntrega',p.fecha_entrega,'fechaEntregaReal',p.fecha_entrega_real,'urgente',p.urgente),
    'cliente',jsonb_build_object('nombre',c.nombre),
    'config',jsonb_build_object('nombreNegocio',cfg.nombre_negocio,'telefono',cfg.telefono,'email',cfg.email))
  from public.pedidos p left join public.clientes c on c.id=p.cliente_id and c.team_id=p.team_id
  left join public.config cfg on cfg.team_id=p.team_id
  where p.tracking_token=p_token and p_token ~ '^[A-Za-z0-9_-]{48,}$' limit 1;
$$;
revoke all on function public.get_public_pedido_tracking(text) from public;
grant execute on function public.get_public_pedido_tracking(text) to anon,authenticated;

alter table public.recurrentes_log add column egreso_id text;
create or replace function public.create_recurrente_egreso(
  p_log_key text,
  p_recurrente_id text,
  p_yyyy_mm text,
  p_egreso jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, app_private
as $$
declare
  v_team_id uuid;
  v_inserted_log int;
  v_egreso public.egresos%rowtype;
begin
  v_team_id := app_private.current_user_team_id();
  if auth.uid() is null or v_team_id is null then
    raise exception 'No authenticated team';
  end if;

  if not app_private.current_user_has_role('admin', 'contador') then
    raise exception 'Insufficient role for recurring expenses';
  end if;

  insert into public.recurrentes_log (team_id, user_id, log_key, recurrente_id, yyyy_mm)
  values (v_team_id, auth.uid(), p_log_key, p_recurrente_id, p_yyyy_mm)
  on conflict (team_id, log_key) do nothing;

  get diagnostics v_inserted_log = row_count;
  if p_log_key is distinct from p_recurrente_id || '::' || p_yyyy_mm or p_yyyy_mm !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Periodo recurrente invalido';
  end if;
  if v_inserted_log = 0 then
    select e.* into v_egreso from public.egresos e join public.recurrentes_log l
      on l.egreso_id=e.id and l.team_id=e.team_id where l.team_id=v_team_id and l.log_key=p_log_key;
    return jsonb_build_object('created', false, 'egreso', case when v_egreso.id is null then null else to_jsonb(v_egreso) end);
  end if;

  insert into public.egresos (
    id, team_id, user_id, fecha, descripcion, categoria, subcategoria,
    proveedor_id, monto, iva, monto_total, forma_pago, factura,
    numero_factura, uuid_cfdi, xml_url, pdf_url, solo_fiscal, notas,
    created_at, updated_at
  )
  values (
    coalesce(p_egreso->>'id', gen_random_uuid()::text),
    v_team_id,
    auth.uid(),
    p_egreso->>'fecha',
    p_egreso->>'descripcion',
    p_egreso->>'categoria',
    coalesce(p_egreso->>'subcategoria', ''),
    coalesce(p_egreso->>'proveedor_id', ''),
    coalesce((p_egreso->>'monto')::numeric, 0),
    coalesce((p_egreso->>'iva')::numeric, 0),
    coalesce((p_egreso->>'monto_total')::numeric, 0),
    coalesce(p_egreso->>'forma_pago', 'efectivo'),
    coalesce((p_egreso->>'factura')::boolean, false),
    coalesce(p_egreso->>'numero_factura', ''),
    nullif(p_egreso->>'uuid_cfdi', ''),
    nullif(p_egreso->>'xml_url', ''),
    nullif(p_egreso->>'pdf_url', ''),
    coalesce((p_egreso->>'solo_fiscal')::boolean, false),
    coalesce(p_egreso->>'notas', ''),
    coalesce((p_egreso->>'created_at')::timestamptz, now()),
    now()
  )
  returning * into v_egreso;

  update public.recurrentes_log set egreso_id=v_egreso.id where team_id=v_team_id and log_key=p_log_key;
  return jsonb_build_object('created', true, 'egreso', to_jsonb(v_egreso));
end;
$$;

grant execute on function public.create_recurrente_egreso(text, text, text, jsonb) to authenticated;

revoke all on function public.create_recurrente_egreso(text,text,text,jsonb) from public;
grant execute on function public.create_recurrente_egreso(text,text,text,jsonb) to authenticated;
