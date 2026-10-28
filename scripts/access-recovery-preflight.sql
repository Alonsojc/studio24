-- Read-only diagnostics. Run in the intended project's SQL Editor as an
-- authorized administrator. Returns counts and schema names, never credentials.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '15s';

select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.teams) as teams,
  (select count(*) from public.profiles p
    left join auth.users u on u.id = p.id
    where u.id is null) as profiles_without_auth,
  (select count(*) from public.team_members tm
    left join auth.users u on u.id = tm.user_id
    where u.id is null) as memberships_without_auth,
  (select count(*) from public.teams t
    where not exists (
      select 1 from public.team_members tm
      join auth.users u on u.id = tm.user_id
      where tm.team_id = t.id and tm.role = 'admin'
        and (u.banned_until is null or u.banned_until <= now())
        and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
    )) as teams_without_confirmed_unbanned_admin,
  (select count(*) from public.profiles p
    join auth.users u on u.id = p.id
    where lower(p.email) is distinct from lower(u.email)) as profile_email_mismatches,
  (select count(*) from public.team_members tm
    left join public.profiles p on p.id = tm.user_id
    where p.id is null) as memberships_without_profile,
  (select count(*) from public.teams t
    where not exists (
      select 1 from public.team_members tm
      where tm.team_id = t.id and tm.user_id = t.owner_id and tm.role = 'admin'
    )) as owners_without_admin_membership,
  (select count(*) from (
    select lower(btrim(email)) from public.profiles
    where nullif(btrim(email), '') is not null
    group by lower(btrim(email)) having count(*) > 1
  ) duplicate_emails) as duplicate_profile_emails,
  (select count(*) from public.profiles
    where nullif(btrim(email), '') is null) as profiles_without_email;

-- Discover every identity reference; do not limit a recovery to profiles.id.
select c.conrelid::regclass::text as source_table,
       a.attname as source_column,
       c.convalidated as constraint_validated
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
where c.contype = 'f'
  and c.confrelid = 'auth.users'::regclass
  and c.connamespace = 'public'::regnamespace
order by source_table, source_column;

-- A confirmed, unbanned account still needs an actual login/permission test.
rollback;
