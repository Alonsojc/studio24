-- Studio 24 — Equipos compartidos (multi-usuario por equipo)
-- Ejecutar en Supabase SQL Editor UNA sola vez, después de supabase-schema.sql
-- y supabase-roles.sql. Es idempotente dentro de lo posible.

-- ============================================================
-- 1. Tablas de equipo
-- ============================================================

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade not null,
  name text default '',
  created_at timestamptz default now()
);

create table if not exists team_members (
  team_id uuid references teams(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text default 'admin' check (role in ('admin', 'operador', 'contador')),
  joined_at timestamptz default now(),
  primary key (team_id, user_id)
);

create index if not exists team_members_user_idx on team_members(user_id);

alter table teams enable row level security;
alter table team_members enable row level security;

-- ============================================================
-- 2. Helper: team_id del usuario autenticado
-- Usa SECURITY DEFINER para poder leer team_members sin RLS
-- ============================================================

create or replace function public.current_user_team_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select team_id from team_members where user_id = auth.uid() limit 1;
$$;

-- ============================================================
-- 3. Políticas RLS para teams y team_members
-- ============================================================

drop policy if exists "Members see their team" on teams;
create policy "Members see their team" on teams for select
  using (id = current_user_team_id());

drop policy if exists "Owner manages team" on teams;
create policy "Owner manages team" on teams for update
  using (owner_id = auth.uid());

drop policy if exists "Members see team members" on team_members;
create policy "Members see team members" on team_members for select
  using (team_id = current_user_team_id());

drop policy if exists "Owner manages members" on team_members;
create policy "Owner manages members" on team_members for all
  using (
    team_id in (select id from teams where owner_id = auth.uid())
  );

-- ============================================================
-- 4. Backfill: cada usuario existente tiene su propio equipo
-- ============================================================

-- Para cada profile sin equipo, crea un equipo y agrégalo como miembro
insert into teams (owner_id, name)
select p.id, coalesce(nullif(p.nombre, ''), p.email, 'Mi Equipo')
from profiles p
where not exists (
  select 1 from team_members tm where tm.user_id = p.id
);

insert into team_members (team_id, user_id, role)
select t.id, p.id, coalesce(p.role, 'admin')
from profiles p
join teams t on t.owner_id = p.id
where not exists (
  select 1 from team_members tm where tm.user_id = p.id
);

-- ============================================================
-- 5. Agrega team_id a todas las tablas de datos y hace backfill
-- ============================================================

do $$
declare
  tbl text;
  data_tables text[] := array[
    'clientes', 'proveedores', 'ingresos', 'egresos', 'pedidos',
    'productos', 'cotizaciones', 'egresos_recurrentes', 'inventario',
    'disenos', 'plantillas', 'recurrentes_log'
  ];
begin
  foreach tbl in array data_tables loop
    execute format(
      'alter table %I add column if not exists team_id uuid references teams(id) on delete cascade',
      tbl
    );
    execute format(
      'update %I set team_id = (select tm.team_id from team_members tm where tm.user_id = %I.user_id limit 1) where team_id is null',
      tbl, tbl
    );
    -- Elimina filas huérfanas (usuarios sin profile/equipo) para permitir NOT NULL
    execute format('delete from %I where team_id is null', tbl);
    execute format('alter table %I alter column team_id set default current_user_team_id()', tbl);
    execute format('alter table %I alter column team_id set not null', tbl);
    execute format('create index if not exists %I on %I(team_id)', tbl || '_team_idx', tbl);
  end loop;
end $$;

-- Config y folio_counter: antes PK user_id; ahora PK team_id (uno por equipo)
alter table config add column if not exists team_id uuid references teams(id) on delete cascade;
update config set team_id = (
  select tm.team_id from team_members tm where tm.user_id = config.user_id limit 1
) where team_id is null;

-- Elimina filas duplicadas dentro del mismo team (conserva la más reciente)
delete from config c using config c2
where c.team_id = c2.team_id and c.updated_at < c2.updated_at;
delete from config where team_id is null;

alter table config drop constraint if exists config_pkey;
alter table config add primary key (team_id);
alter table config alter column team_id set default current_user_team_id();

alter table folio_counter add column if not exists team_id uuid references teams(id) on delete cascade;
update folio_counter set team_id = (
  select tm.team_id from team_members tm where tm.user_id = folio_counter.user_id limit 1
) where team_id is null;

delete from folio_counter fc using folio_counter fc2
where fc.team_id = fc2.team_id and fc.counter < fc2.counter;
delete from folio_counter where team_id is null;

alter table folio_counter drop constraint if exists folio_counter_pkey;
alter table folio_counter add primary key (team_id);
alter table folio_counter alter column team_id set default current_user_team_id();

-- ============================================================
-- 6. Reemplaza policies: de scope user_id a scope team_id
-- ============================================================

do $$
declare
  tbl text;
  scoped_tables text[] := array[
    'clientes', 'proveedores', 'ingresos', 'egresos', 'pedidos',
    'productos', 'cotizaciones', 'egresos_recurrentes', 'inventario',
    'disenos', 'plantillas', 'recurrentes_log', 'config', 'folio_counter'
  ];
  old_policy_names text[] := array[
    'Users see own clientes', 'Users see own proveedores', 'Users see own ingresos',
    'Users see own egresos', 'Users see own pedidos', 'Users see own productos',
    'Users see own cotizaciones', 'Users see own egresos_recurrentes',
    'Users see own inventario', 'Users see own disenos', 'Users see own plantillas',
    'Users see own recurrentes_log', 'Users see own config', 'Users see own folio_counter'
  ];
  i int;
begin
  for i in 1 .. array_length(scoped_tables, 1) loop
    tbl := scoped_tables[i];
    execute format('drop policy if exists %I on %I', old_policy_names[i], tbl);
    execute format(
      'create policy "Team sees team %s" on %I for all using (team_id = current_user_team_id())',
      tbl, tbl
    );
  end loop;
end $$;

-- ============================================================
-- 7. Profiles: miembros del equipo se ven entre sí
-- ============================================================

drop policy if exists "Users see own profile" on profiles;
create policy "Team sees team profiles" on profiles for select
  using (
    id = auth.uid()
    or id in (select user_id from team_members where team_id = current_user_team_id())
  );

-- ============================================================
-- 8. Invitations: ahora incluye team_id
-- ============================================================

alter table invitations add column if not exists team_id uuid references teams(id) on delete cascade;

update invitations set team_id = (
  select t.id from teams t where t.owner_id = invitations.invited_by limit 1
) where team_id is null;

-- Invitaciones huérfanas (inviter sin equipo) se descartan
delete from invitations where team_id is null;

alter table invitations alter column team_id set default current_user_team_id();
alter table invitations alter column team_id set not null;

drop policy if exists "Users see own invitations" on invitations;
create policy "Admin manages team invitations" on invitations for all
  using (team_id = current_user_team_id());

-- ============================================================
-- 9. Trigger handle_new_user: engancha invitaciones al registrarse
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_invite invitations%rowtype;
  new_team_id uuid;
  assigned_role text := 'admin';
begin
  -- ¿Hay una invitación pendiente para este email?
  select * into pending_invite
  from invitations
  where lower(email) = lower(new.email) and accepted = false
  order by created_at desc
  limit 1;

  if found then
    -- Únete al equipo del que invitó
    new_team_id := pending_invite.team_id;
    assigned_role := pending_invite.role;
    insert into team_members (team_id, user_id, role)
    values (new_team_id, new.id, assigned_role)
    on conflict (team_id, user_id) do nothing;
    update invitations set accepted = true where id = pending_invite.id;
  else
    -- Crea un equipo nuevo del que este usuario es dueño
    insert into teams (owner_id, name) values (new.id, coalesce(new.email, 'Mi Equipo'))
    returning id into new_team_id;
    insert into team_members (team_id, user_id, role)
    values (new_team_id, new.id, 'admin')
    on conflict (team_id, user_id) do nothing;
  end if;

  -- Crea el profile con el rol correcto
  insert into profiles (id, email, role)
  values (new.id, new.email, assigned_role)
  on conflict (id) do update set role = excluded.role;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 10. Verificación opcional
-- ============================================================
-- select * from teams;
-- select * from team_members;
-- select column_name from information_schema.columns where table_name = 'ingresos';
