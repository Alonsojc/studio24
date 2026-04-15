-- Studio 24 — Roles y perfiles
-- Ejecutar en SQL Editor de Supabase (después del schema inicial)

-- Perfiles de usuario con rol
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text default 'admin' check (role in ('admin', 'operador', 'contador')),
  nombre text default '',
  created_at timestamptz default now()
);
alter table profiles enable row level security;

-- Admin ve todos los perfiles de su "equipo" (misma org)
-- Por ahora cada usuario ve su propio perfil, el admin ve todos los que comparten datos
create policy "Users see own profile" on profiles for select using (auth.uid() = id);
create policy "Users update own profile" on profiles for update using (auth.uid() = id);
create policy "Allow insert own profile" on profiles for insert with check (auth.uid() = id);

-- Auto-crear perfil al registrarse
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'admin');
  return new;
end;
$$ language plpgsql security definer;

-- Trigger: crear perfil automáticamente
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Tabla de invitaciones (para que el admin invite operadores/contadores)
create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  invited_by uuid references auth.users(id) on delete cascade not null default auth.uid(),
  email text not null,
  role text default 'operador' check (role in ('operador', 'contador')),
  accepted boolean default false,
  created_at timestamptz default now()
);
alter table invitations enable row level security;
create policy "Users see own invitations" on invitations for all using (auth.uid() = invited_by);
