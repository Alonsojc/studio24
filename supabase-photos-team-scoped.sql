-- Studio 24 — Fotos de pedidos compartidas por equipo
-- Ejecutar UNA vez en Supabase SQL Editor, después de supabase-teams-migration.sql.
--
-- El bucket `photos` existe desde el schema original pero sus policies de
-- storage.objects estaban keyeadas por auth.uid(), lo que significa que
-- cada usuario solo ve sus propias fotos. Cuando un operador subía una
-- foto a un pedido, el admin/contador no la veían.
--
-- Este SQL cambia el scoping a team_id. Path esperado en el bucket:
--   <team_id>/<pedido_id>/<photo_id>
--
-- Nota: no intentamos migrar fotos viejas automáticamente; hoy viven en
-- IndexedDB del navegador del operador. Cualquier foto nueva ya sí queda
-- compartida para todo el equipo.

-- ============================================================
-- 1. Reemplazar policies del bucket photos
-- ============================================================

drop policy if exists "Users upload own photos" on storage.objects;
drop policy if exists "Users view own photos" on storage.objects;
drop policy if exists "Users delete own photos" on storage.objects;
-- Por si alguien ya corrió este SQL una vez
drop policy if exists "Team uploads team photos" on storage.objects;
drop policy if exists "Team views team photos" on storage.objects;
drop policy if exists "Team deletes team photos" on storage.objects;
drop policy if exists "Team updates team photos" on storage.objects;

create policy "Team views team photos" on storage.objects for select
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = current_user_team_id()::text
  );

create policy "Team uploads team photos" on storage.objects for insert
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = current_user_team_id()::text
  );

create policy "Team updates team photos" on storage.objects for update
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = current_user_team_id()::text
  );

create policy "Team deletes team photos" on storage.objects for delete
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = current_user_team_id()::text
  );
