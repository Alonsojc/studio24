-- Studio 24 — Cron mensual para fetch-inpc
--
-- Corre la Edge Function `fetch-inpc` automáticamente cada día 11 de cada mes
-- a las 09:00 (UTC). INEGI publica el INPC del mes anterior alrededor del
-- día 10, así que el día 11 ya está disponible.
--
-- Requiere:
--   - Edge Function `fetch-inpc` ya desplegada (ver
--     supabase/functions/fetch-inpc/README.md).
--   - Las extensiones pg_cron y pg_net habilitadas en el proyecto Supabase
--     (Database → Extensions → habilitar si no lo están).
--
-- IMPORTANTE: antes de ejecutar, reemplaza <PROJECT_REF> por tu ref de Supabase
-- (Project Settings → General → Reference ID) y <FETCH_INPC_SECRET> por el
-- mismo secreto que configuraste en la Edge Function.

-- ============================================================
-- 1. Habilitar extensiones (idempotente)
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ============================================================
-- 2. Programar el cron
-- ============================================================

-- Borra el job anterior si existe (permite re-ejecutar este SQL sin duplicar)
do $$
declare
  job_id int;
begin
  select jobid into job_id from cron.job where jobname = 'sync-inpc-mensual';
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;
end $$;

-- Programa: día 11 de cada mes a las 09:00 UTC (~03:00 CDMX)
select cron.schedule(
  'sync-inpc-mensual',
  '0 9 11 * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/fetch-inpc',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<FETCH_INPC_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================
-- 3. Verificación (opcional)
-- ============================================================
-- select * from cron.job where jobname = 'sync-inpc-mensual';
-- select * from cron.job_run_details where jobid = (
--   select jobid from cron.job where jobname = 'sync-inpc-mensual'
-- ) order by start_time desc limit 5;
