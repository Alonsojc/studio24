-- Historical storage migrations reference these helpers before hardening creates them.
create schema if not exists app_private;
create function app_private.current_user_team_id() returns uuid language sql stable security definer
  as $$ select public.current_user_team_id() $$;
create function app_private.current_user_has_role(variadic allowed_roles text[]) returns boolean language sql stable security definer
  as $$ select exists(select 1 from public.team_members where user_id=auth.uid() and role=any(allowed_roles)) $$;
