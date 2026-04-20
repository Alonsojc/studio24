-- Studio 24 — Aceptación de invitaciones para usuarios ya existentes
-- Ejecutar UNA vez en Supabase SQL Editor, después de supabase-teams-migration.sql.
--
-- Problema que arregla: si invitas a un email que YA tenía cuenta de Supabase,
-- el trigger `handle_new_user` no se redispara (porque no se crea un auth.users
-- nuevo) y la invitación se queda pendiente para siempre. Este SQL agrega un
-- RPC que la app llama al iniciar sesión para aceptar invitaciones pendientes
-- del usuario actual.

-- ============================================================
-- 1. RPC: aceptar invitaciones pendientes del usuario autenticado
-- ============================================================

create or replace function public.accept_pending_invitations()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inv invitations%rowtype;
  user_email text;
  accepted_count int := 0;
begin
  if auth.uid() is null then return 0; end if;

  select email into user_email from auth.users where id = auth.uid();
  if user_email is null then return 0; end if;

  for inv in
    select * from invitations
    where lower(email) = lower(user_email)
      and accepted = false
    order by created_at asc
  loop
    insert into team_members (team_id, user_id, role)
    values (inv.team_id, auth.uid(), inv.role)
    on conflict (team_id, user_id) do nothing;

    update invitations set accepted = true where id = inv.id;
    accepted_count := accepted_count + 1;

    -- Si el profile del invitado decía 'admin' por default (sólo porque
    -- handle_new_user lo crea así), actualízalo al rol invitado. Esto
    -- no afecta a admins "reales" que tienen su propio equipo con datos.
    update profiles set role = inv.role where id = auth.uid() and role = 'admin';
  end loop;

  return accepted_count;
end;
$$;

-- Permite que cualquier usuario autenticado la invoque; el SECURITY DEFINER
-- se encarga de limitar qué invitaciones procesa (sólo las de su email).
grant execute on function public.accept_pending_invitations() to authenticated;

-- ============================================================
-- 2. current_user_team_id(): regresa la membresía MÁS RECIENTE.
--    Si un usuario fue invitado después de crear su propio equipo,
--    su membresía del equipo invitado es más reciente → la verá.
--    Simple y sin joins.
-- ============================================================

create or replace function public.current_user_team_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select team_id
  from team_members
  where user_id = auth.uid()
  order by joined_at desc
  limit 1;
$$;
