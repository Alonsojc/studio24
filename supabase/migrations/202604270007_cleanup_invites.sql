-- Studio 24 — Limpieza manual de invitaciones pendientes y perfiles
-- Ejecutar UNA vez en Supabase SQL Editor cuando haya invitaciones pendientes
-- de usuarios que ya tenían cuenta antes de ser invitados.
--
-- Esta migración NO depende del cliente. Solo toca la DB para dejar a los
-- invitados dentro del equipo correcto con el rol correcto.

-- ============================================================
-- 1. Rellenar profiles.email desde auth.users donde esté vacío
--    (asegura que los miembros del equipo tengan su email visible en Ajustes)
-- ============================================================

update profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and (p.email is null or p.email = '');

-- ============================================================
-- 2. Procesar TODAS las invitaciones pendientes
--    Para cada invitación no aceptada, si el email ya tiene cuenta:
--      - Mete al usuario al team_members del invitador con el rol correcto
--      - Marca la invitación como aceptada
--      - Actualiza el profile.role (si estaba en 'admin' por default)
-- ============================================================

do $$
declare
  inv record;
  invitee_id uuid;
begin
  for inv in
    select i.id, i.team_id, lower(i.email) as email, i.role
    from invitations i
    where i.accepted = false
  loop
    select u.id into invitee_id
    from auth.users u
    where lower(u.email) = inv.email
    limit 1;

    if invitee_id is null then
      continue; -- el usuario aún no se registra; queda pendiente
    end if;

    insert into team_members (team_id, user_id, role)
    values (inv.team_id, invitee_id, inv.role)
    on conflict (team_id, user_id) do nothing;

    update invitations set accepted = true where id = inv.id;

    -- Si profile.role estaba en 'admin' (default de handle_new_user),
    -- cámbialo al rol que se le invitó. Así la sidebar le oculta
    -- PRODUCCIÓN / VENTAS cuando es contador.
    update profiles set role = inv.role where id = invitee_id and role = 'admin';
  end loop;
end $$;

-- ============================================================
-- 3. current_user_team_id(): regresa la membresía MÁS RECIENTE.
--    Si el usuario tenía su propio equipo y después fue invitado,
--    la membresía del equipo invitado es más reciente → la verá.
--    Idempotente: reemplaza la definición si ya existía.
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

-- ============================================================
-- 4. Verificación (opcional, para leer resultados)
-- ============================================================
-- select email, role from profiles order by created_at;
-- select * from invitations where accepted = false;
-- select tm.*, u.email, p.role as profile_role
--   from team_members tm
--   join auth.users u on u.id = tm.user_id
--   left join profiles p on p.id = tm.user_id
--   order by tm.joined_at desc;
