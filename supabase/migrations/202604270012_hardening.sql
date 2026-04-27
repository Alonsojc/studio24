-- Studio 24 hardening patch
-- Run after supabase-schema.sql, supabase-roles.sql, supabase-teams-migration.sql,
-- and supabase-facturas-storage.sql.

-- ============================================================
-- 1. Role helpers
-- ============================================================

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to anon, authenticated;

create or replace function app_private.current_user_team_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select team_id
  from public.team_members
  where user_id = auth.uid()
  order by joined_at desc
  limit 1;
$$;

create or replace function app_private.current_user_team_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.team_members
  where user_id = auth.uid()
    and team_id = app_private.current_user_team_id()
  limit 1;
$$;

create or replace function app_private.current_user_has_role(variadic allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members
    where user_id = auth.uid()
      and team_id = app_private.current_user_team_id()
      and role = any(allowed_roles)
  );
$$;

revoke all on function app_private.current_user_team_id() from public;
revoke all on function app_private.current_user_team_role() from public;
revoke all on function app_private.current_user_has_role(text[]) from public;
grant execute on function app_private.current_user_team_id() to anon, authenticated;
grant execute on function app_private.current_user_has_role(text[]) to anon, authenticated;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'clientes', 'proveedores', 'ingresos', 'egresos', 'pedidos',
    'productos', 'cotizaciones', 'egresos_recurrentes', 'inventario',
    'disenos', 'plantillas', 'recurrentes_log', 'config', 'folio_counter',
    'invitations'
  ] loop
    execute format('alter table public.%I alter column team_id set default app_private.current_user_team_id()', tbl);
  end loop;
end $$;

-- ============================================================
-- 2. Transactional folios
-- ============================================================

create or replace function public.next_folio(p_prefix text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_team_id uuid;
  v_next int;
  v_prefix text;
begin
  v_team_id := app_private.current_user_team_id();
  if auth.uid() is null or v_team_id is null then
    raise exception 'No authenticated team';
  end if;

  if not app_private.current_user_has_role('admin', 'operador', 'contador') then
    raise exception 'Insufficient role for folio generation';
  end if;

  v_prefix := upper(regexp_replace(coalesce(nullif(p_prefix, ''), 'DOC'), '[^a-zA-Z0-9_-]', '', 'g'));
  if v_prefix = '' then
    v_prefix := 'DOC';
  end if;

  insert into public.folio_counter (team_id, counter)
  values (v_team_id, 1)
  on conflict (team_id)
  do update set counter = public.folio_counter.counter + 1
  returning counter into v_next;

  return v_prefix || '-' || lpad(v_next::text, 3, '0');
end;
$$;

grant execute on function public.next_folio(text) to authenticated;

-- ============================================================
-- 3. Profile role-change guard
-- ============================================================

create or replace function public.prevent_profile_self_promotion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if not app_private.current_user_has_role('admin') then
      raise exception 'Only admins can change profile roles';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_profile_self_promotion on profiles;
create trigger prevent_profile_self_promotion
  before update on profiles
  for each row execute function public.prevent_profile_self_promotion();

drop policy if exists "Team reads profiles" on profiles;
drop policy if exists "Users update own profile" on profiles;
drop policy if exists "Allow insert own profile" on profiles;
drop policy if exists "Users insert own operador profile" on profiles;
drop policy if exists "Users update own non-role profile fields" on profiles;
drop policy if exists "Team sees team profiles" on profiles;

alter table profiles alter column role set default 'operador';

create policy "Team reads profiles" on profiles for select
  using (
    id = auth.uid()
    or id in (select user_id from team_members where team_id = app_private.current_user_team_id())
  );

create policy "Users insert own operador profile" on profiles for insert
  with check (id = auth.uid() and role = 'operador');

create policy "Users update own non-role profile fields" on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ============================================================
-- 4. Action-specific RLS for team data
-- ============================================================

do $$
declare
  tbl text;
  policy_name text;
begin
  foreach tbl in array array[
    'clientes', 'proveedores', 'ingresos', 'egresos', 'pedidos',
    'productos', 'cotizaciones', 'egresos_recurrentes', 'inventario',
    'disenos', 'plantillas', 'recurrentes_log', 'config', 'folio_counter'
  ] loop
    for policy_name in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = tbl
    loop
      execute format('drop policy if exists %I on %I', policy_name, tbl);
    end loop;
  end loop;
end $$;

-- Shared directory
create policy "Team reads clientes" on clientes for select using (team_id = app_private.current_user_team_id());
create policy "Allowed roles insert clientes" on clientes for insert with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador', 'contador'));
create policy "Allowed roles update clientes" on clientes for update using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador', 'contador')) with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador', 'contador'));
create policy "Allowed roles delete clientes" on clientes for delete using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin'));

create policy "Team reads proveedores" on proveedores for select using (team_id = app_private.current_user_team_id());
create policy "Finance roles insert proveedores" on proveedores for insert with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'contador'));
create policy "Finance roles update proveedores" on proveedores for update using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'contador')) with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'contador'));
create policy "Admin deletes proveedores" on proveedores for delete using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin'));

-- Production and sales
create policy "Team reads pedidos" on pedidos for select using (team_id = app_private.current_user_team_id());
create policy "Production roles insert pedidos" on pedidos for insert with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador'));
create policy "Production roles update pedidos" on pedidos for update using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador')) with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador'));
create policy "Admin deletes pedidos" on pedidos for delete using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin'));

create policy "Team reads productos" on productos for select using (team_id = app_private.current_user_team_id());
create policy "Production roles insert productos" on productos for insert with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador'));
create policy "Production roles update productos" on productos for update using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador')) with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador'));
create policy "Admin deletes productos" on productos for delete using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin'));

create policy "Team reads cotizaciones" on cotizaciones for select using (team_id = app_private.current_user_team_id());
create policy "Production roles insert cotizaciones" on cotizaciones for insert with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador'));
create policy "Production roles update cotizaciones" on cotizaciones for update using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador')) with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador'));
create policy "Admin deletes cotizaciones" on cotizaciones for delete using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin'));

create policy "Team reads inventario" on inventario for select using (team_id = app_private.current_user_team_id());
create policy "Production roles insert inventario" on inventario for insert with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador'));
create policy "Production roles update inventario" on inventario for update using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador')) with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador'));
create policy "Admin deletes inventario" on inventario for delete using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin'));

create policy "Team reads disenos" on disenos for select using (team_id = app_private.current_user_team_id());
create policy "Production roles insert disenos" on disenos for insert with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador'));
create policy "Production roles update disenos" on disenos for update using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador')) with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador'));
create policy "Admin deletes disenos" on disenos for delete using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin'));

create policy "Team reads plantillas" on plantillas for select using (team_id = app_private.current_user_team_id());
create policy "Production roles insert plantillas" on plantillas for insert with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador'));
create policy "Production roles update plantillas" on plantillas for update using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador')) with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador'));
create policy "Admin deletes plantillas" on plantillas for delete using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin'));

-- Finance
create policy "Team reads ingresos" on ingresos for select using (team_id = app_private.current_user_team_id());
create policy "Finance roles insert ingresos" on ingresos for insert with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'contador'));
create policy "Finance roles update ingresos" on ingresos for update using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'contador')) with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'contador'));
create policy "Admin deletes ingresos" on ingresos for delete using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin'));

create policy "Team reads egresos" on egresos for select using (team_id = app_private.current_user_team_id());
create policy "Finance roles insert egresos" on egresos for insert with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'contador'));
create policy "Finance roles update egresos" on egresos for update using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'contador')) with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'contador'));
create policy "Admin deletes egresos" on egresos for delete using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin'));

create policy "Team reads egresos recurrentes" on egresos_recurrentes for select using (team_id = app_private.current_user_team_id());
create policy "Finance roles insert egresos recurrentes" on egresos_recurrentes for insert with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'contador'));
create policy "Finance roles update egresos recurrentes" on egresos_recurrentes for update using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'contador')) with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'contador'));
create policy "Admin deletes egresos recurrentes" on egresos_recurrentes for delete using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin'));

create policy "Team reads recurrentes log" on recurrentes_log for select using (team_id = app_private.current_user_team_id());
create policy "Finance roles insert recurrentes log" on recurrentes_log for insert with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'contador'));
create policy "Finance roles update recurrentes log" on recurrentes_log for update using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'contador')) with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'contador'));
create policy "Admin deletes recurrentes log" on recurrentes_log for delete using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin'));

-- Settings / counters
create policy "Team reads config" on config for select using (team_id = app_private.current_user_team_id());
create policy "Admin inserts config" on config for insert with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin'));
create policy "Admin updates config" on config for update using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin')) with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin'));
create policy "Admin deletes config" on config for delete using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin'));

create policy "Team reads folio counter" on folio_counter for select using (team_id = app_private.current_user_team_id());
create policy "Team inserts folio counter" on folio_counter for insert with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador', 'contador'));
create policy "Team updates folio counter" on folio_counter for update using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador', 'contador')) with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin', 'operador', 'contador'));

-- Teams and invitations
drop policy if exists "Members see their team" on teams;
create policy "Members see their team" on teams for select
  using (id = app_private.current_user_team_id());

drop policy if exists "Owner manages team" on teams;
create policy "Owner manages team" on teams for update
  using (owner_id = (select auth.uid()));

drop policy if exists "Members see team members" on team_members;
create policy "Members see team members" on team_members for select
  using (team_id = app_private.current_user_team_id());

drop policy if exists "Owner manages members" on team_members;
drop policy if exists "Admin manages team members" on team_members;
create policy "Admin manages team members" on team_members for all
  using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin'))
  with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin'));

drop policy if exists "Admin manages team invitations" on invitations;
create policy "Admin manages team invitations" on invitations for all
  using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin'))
  with check (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin'));

-- ============================================================
-- 5. Public INPC: read for auth users, write only finance roles
-- ============================================================

drop policy if exists "Anyone authenticated can write inpc" on inpc;
drop policy if exists "Finance roles write inpc" on inpc;
create policy "Finance roles write inpc" on inpc for all
  using (auth.uid() is not null and app_private.current_user_has_role('admin', 'contador'))
  with check (auth.uid() is not null and app_private.current_user_has_role('admin', 'contador'));

-- ============================================================
-- 6. Storage policies
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('backups', 'backups', false, 5 * 1024 * 1024, array['application/json', 'text/plain']),
  ('facturas', 'facturas', false, 10 * 1024 * 1024, array['application/xml', 'text/xml', 'application/pdf']),
  ('photos', 'photos', false, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read own backups" on storage.objects;
create policy "Users read own backups" on storage.objects for select
  using (bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users upload own backups" on storage.objects;
create policy "Users upload own backups" on storage.objects for insert
  with check (bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users update own backups" on storage.objects;
create policy "Users update own backups" on storage.objects for update
  using (bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete own backups" on storage.objects;
create policy "Users delete own backups" on storage.objects for delete
  using (bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Team reads own facturas" on storage.objects;
create policy "Team reads own facturas" on storage.objects for select
  using (bucket_id = 'facturas' and (storage.foldername(name))[1] = app_private.current_user_team_id()::text);

drop policy if exists "Team uploads own facturas" on storage.objects;
create policy "Team uploads own facturas" on storage.objects for insert
  with check (
    bucket_id = 'facturas'
    and (storage.foldername(name))[1] = app_private.current_user_team_id()::text
    and app_private.current_user_has_role('admin', 'contador')
  );

drop policy if exists "Team updates own facturas" on storage.objects;
create policy "Team updates own facturas" on storage.objects for update
  using (
    bucket_id = 'facturas'
    and (storage.foldername(name))[1] = app_private.current_user_team_id()::text
    and app_private.current_user_has_role('admin', 'contador')
  )
  with check (
    bucket_id = 'facturas'
    and (storage.foldername(name))[1] = app_private.current_user_team_id()::text
    and app_private.current_user_has_role('admin', 'contador')
  );

drop policy if exists "Team deletes own facturas" on storage.objects;
create policy "Team deletes own facturas" on storage.objects for delete
  using (
    bucket_id = 'facturas'
    and (storage.foldername(name))[1] = app_private.current_user_team_id()::text
    and app_private.current_user_has_role('admin', 'contador')
  );

drop policy if exists "Team uploads team photos" on storage.objects;
drop policy if exists "Team views team photos" on storage.objects;
drop policy if exists "Team updates team photos" on storage.objects;
drop policy if exists "Team deletes team photos" on storage.objects;
drop policy if exists "Users upload own photos" on storage.objects;
drop policy if exists "Users view own photos" on storage.objects;
drop policy if exists "Users delete own photos" on storage.objects;

create policy "Team views team photos" on storage.objects for select
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = app_private.current_user_team_id()::text
  );

create policy "Team uploads team photos" on storage.objects for insert
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = app_private.current_user_team_id()::text
    and app_private.current_user_has_role('admin', 'operador')
  );

create policy "Team updates team photos" on storage.objects for update
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = app_private.current_user_team_id()::text
    and app_private.current_user_has_role('admin', 'operador')
  )
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = app_private.current_user_team_id()::text
    and app_private.current_user_has_role('admin', 'operador')
  );

create policy "Team deletes team photos" on storage.objects for delete
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = app_private.current_user_team_id()::text
    and app_private.current_user_has_role('admin', 'operador')
  );

-- ============================================================
-- 7. Financial consistency constraints and unique CFDI
-- ============================================================

alter table ingresos add column if not exists uuid_cfdi text default '';
alter table ingresos add column if not exists xml_url text default '';
alter table ingresos add column if not exists pdf_url text default '';
alter table egresos add column if not exists uuid_cfdi text default '';
alter table egresos add column if not exists xml_url text default '';
alter table egresos add column if not exists pdf_url text default '';
alter table pedidos add column if not exists pagos jsonb not null default '[]'::jsonb;
alter table pedidos add column if not exists inventario_usado jsonb not null default '[]'::jsonb;

create unique index if not exists ingresos_team_uuid_cfdi_unique
  on ingresos(team_id, uuid_cfdi)
  where coalesce(uuid_cfdi, '') <> '';

create unique index if not exists egresos_team_uuid_cfdi_unique
  on egresos(team_id, uuid_cfdi)
  where coalesce(uuid_cfdi, '') <> '';

create unique index if not exists ingresos_team_pedido_unique
  on ingresos(team_id, pedido_id)
  where coalesce(pedido_id, '') <> '';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ingresos_amounts_nonnegative') then
    alter table ingresos add constraint ingresos_amounts_nonnegative check (monto >= 0 and iva >= 0 and monto_total >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'egresos_amounts_nonnegative') then
    alter table egresos add constraint egresos_amounts_nonnegative check (monto >= 0 and iva >= 0 and monto_total >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pedidos_amounts_nonnegative') then
    alter table pedidos add constraint pedidos_amounts_nonnegative check (piezas >= 1 and precio_unitario >= 0 and monto_total >= 0 and costo_materiales >= 0 and monto_pagado >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pedidos_payment_not_over_total') then
    alter table pedidos add constraint pedidos_payment_not_over_total check (monto_pagado <= monto_total);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pedidos_total_matches_items') then
    alter table pedidos add constraint pedidos_total_matches_items check (abs(monto_total - (piezas * precio_unitario)) <= 0.01);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pedidos_valid_estado') then
    alter table pedidos add constraint pedidos_valid_estado check (estado in ('pendiente', 'diseno', 'aprobado', 'en_maquina', 'terminado', 'entregado', 'cancelado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pedidos_valid_estado_pago') then
    alter table pedidos add constraint pedidos_valid_estado_pago check (estado_pago in ('pendiente', 'parcial', 'pagado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inventario_amounts_nonnegative') then
    alter table inventario add constraint inventario_amounts_nonnegative check (stock >= 0 and stock_minimo >= 0 and costo >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'productos_precio_nonnegative') then
    alter table productos add constraint productos_precio_nonnegative check (precio >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cotizaciones_amounts_nonnegative') then
    alter table cotizaciones add constraint cotizaciones_amounts_nonnegative check (subtotal >= 0 and iva >= 0 and total >= 0);
  end if;
end $$;

-- ============================================================
-- 8. Audit log for sensitive tables
-- ============================================================

create table if not exists audit_log (
  id bigserial primary key,
  team_id uuid references teams(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null default auth.uid(),
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_team_created_idx on audit_log(team_id, created_at desc);
alter table audit_log enable row level security;

drop policy if exists "Admins read audit log" on audit_log;
create policy "Admins read audit log" on audit_log for select
  using (team_id = app_private.current_user_team_id() and app_private.current_user_has_role('admin'));

create or replace function public.capture_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_team_id uuid;
  v_record_id text;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
  else
    v_old := to_jsonb(old);
  end if;

  v_team_id := coalesce((v_new ->> 'team_id')::uuid, (v_old ->> 'team_id')::uuid);
  v_record_id := coalesce(v_new ->> 'id', v_new ->> 'team_id', v_old ->> 'id', v_old ->> 'team_id');

  insert into audit_log (team_id, actor_id, table_name, record_id, action, old_data, new_data)
  values (v_team_id, auth.uid(), tg_table_name, v_record_id, tg_op, v_old, v_new);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'clientes', 'proveedores', 'ingresos', 'egresos', 'pedidos',
    'productos', 'cotizaciones', 'egresos_recurrentes', 'inventario',
    'disenos', 'plantillas', 'config'
  ] loop
    execute format('drop trigger if exists audit_%I on %I', tbl, tbl);
    execute format(
      'create trigger audit_%I after insert or update or delete on %I for each row execute function public.capture_audit_log()',
      tbl,
      tbl
    );
  end loop;
end $$;

-- ============================================================
-- 9. Restrict exposed SECURITY DEFINER RPC surface
-- ============================================================

do $$
begin
  if to_regprocedure('public.accept_pending_invitations()') is not null then
    execute 'revoke execute on function public.accept_pending_invitations() from public, anon, authenticated';
  end if;

  if to_regprocedure('public.capture_audit_log()') is not null then
    execute 'revoke execute on function public.capture_audit_log() from public, anon, authenticated';
  end if;

  if to_regprocedure('public.current_user_team_id()') is not null then
    execute 'revoke execute on function public.current_user_team_id() from public, anon, authenticated';
  end if;

  if to_regprocedure('public.current_user_has_role(text[])') is not null then
    execute 'revoke execute on function public.current_user_has_role(text[]) from public, anon, authenticated';
  end if;

  if to_regprocedure('public.current_user_team_role()') is not null then
    execute 'revoke execute on function public.current_user_team_role() from public, anon, authenticated';
  end if;

  if to_regprocedure('public.handle_new_user()') is not null then
    execute 'revoke execute on function public.handle_new_user() from public, anon, authenticated';
  end if;

  if to_regprocedure('public.next_folio(text)') is not null then
    execute 'revoke execute on function public.next_folio(text) from public, anon';
    execute 'grant execute on function public.next_folio(text) to authenticated';
  end if;

  if to_regprocedure('public.prevent_profile_self_promotion()') is not null then
    execute 'revoke execute on function public.prevent_profile_self_promotion() from public, anon, authenticated';
  end if;

  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
