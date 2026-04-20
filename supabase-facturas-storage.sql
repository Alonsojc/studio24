-- Studio 24 — Storage bucket para archivos de facturas (XML + PDF)
-- Ejecutar UNA vez en Supabase SQL Editor, después de supabase-teams-migration.sql.

-- ============================================================
-- 0. Asegurar que las columnas CFDI existan en ingresos/egresos
--    (idempotente; si ya existen, no hace nada)
-- ============================================================

alter table ingresos add column if not exists uuid_cfdi text default '';
alter table ingresos add column if not exists xml_url text default '';
alter table ingresos add column if not exists pdf_url text default '';

alter table egresos add column if not exists uuid_cfdi text default '';
alter table egresos add column if not exists xml_url text default '';
alter table egresos add column if not exists pdf_url text default '';

-- ============================================================
-- 1. Crear bucket privado para facturas
-- ============================================================

insert into storage.buckets (id, name, public)
values ('facturas', 'facturas', false)
on conflict (id) do nothing;

-- ============================================================
-- 2. Políticas RLS: los archivos viven en <team_id>/<archivo>
--    Solo miembros del equipo pueden leer, escribir y borrar.
-- ============================================================

drop policy if exists "Team reads own facturas" on storage.objects;
create policy "Team reads own facturas" on storage.objects for select
  using (
    bucket_id = 'facturas'
    and (storage.foldername(name))[1] = current_user_team_id()::text
  );

drop policy if exists "Team uploads own facturas" on storage.objects;
create policy "Team uploads own facturas" on storage.objects for insert
  with check (
    bucket_id = 'facturas'
    and (storage.foldername(name))[1] = current_user_team_id()::text
  );

drop policy if exists "Team updates own facturas" on storage.objects;
create policy "Team updates own facturas" on storage.objects for update
  using (
    bucket_id = 'facturas'
    and (storage.foldername(name))[1] = current_user_team_id()::text
  );

drop policy if exists "Team deletes own facturas" on storage.objects;
create policy "Team deletes own facturas" on storage.objects for delete
  using (
    bucket_id = 'facturas'
    and (storage.foldername(name))[1] = current_user_team_id()::text
  );
