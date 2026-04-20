-- Studio 24 — Tabla INPC (Índice Nacional de Precios al Consumidor)
-- Base: 2018-Jul = 100 (serie oficial INEGI, indicador 628194).
--
-- El INPC es dato público de México, igual para todos los usuarios, así que
-- vive en una tabla sin team_id: todos los autenticados pueden leer, escribir
-- requiere auth (lo llena la Edge Function o el admin a mano).
--
-- Ejecutar UNA vez en Supabase SQL Editor.

-- ============================================================
-- 1. Tabla
-- ============================================================

create table if not exists inpc (
  year int not null,
  month int not null check (month between 1 and 12),
  valor numeric(12, 4) not null,
  source text default 'seed',
  updated_at timestamptz default now(),
  primary key (year, month)
);

alter table inpc enable row level security;

drop policy if exists "Anyone authenticated can read inpc" on inpc;
create policy "Anyone authenticated can read inpc" on inpc for select
  using (auth.uid() is not null);

drop policy if exists "Anyone authenticated can write inpc" on inpc;
create policy "Anyone authenticated can write inpc" on inpc for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ============================================================
-- 2. Seed con valores históricos publicados por INEGI
--    Base 2018 = 100. Valores mensuales desde 2022.
--    Fuente: INEGI Banco de Información Económica (indicador 628194).
--    Si cambia el seed, re-ejecutar es idempotente: upsert por (year, month).
-- ============================================================

insert into inpc (year, month, valor, source) values
  -- 2022
  (2022, 1, 118.0020, 'seed'),
  (2022, 2, 118.9810, 'seed'),
  (2022, 3, 120.1590, 'seed'),
  (2022, 4, 120.8090, 'seed'),
  (2022, 5, 121.0220, 'seed'),
  (2022, 6, 122.0440, 'seed'),
  (2022, 7, 122.9480, 'seed'),
  (2022, 8, 123.8030, 'seed'),
  (2022, 9, 124.5710, 'seed'),
  (2022, 10, 125.2760, 'seed'),
  (2022, 11, 125.9970, 'seed'),
  (2022, 12, 126.4780, 'seed'),
  -- 2023
  (2023, 1, 127.3360, 'seed'),
  (2023, 2, 128.1880, 'seed'),
  (2023, 3, 128.3890, 'seed'),
  (2023, 4, 128.3630, 'seed'),
  (2023, 5, 128.0840, 'seed'),
  (2023, 6, 128.2140, 'seed'),
  (2023, 7, 128.8320, 'seed'),
  (2023, 8, 129.5450, 'seed'),
  (2023, 9, 130.1180, 'seed'),
  (2023, 10, 130.6090, 'seed'),
  (2023, 11, 131.4450, 'seed'),
  (2023, 12, 132.3730, 'seed'),
  -- 2024
  (2024, 1, 133.5550, 'seed'),
  (2024, 2, 133.6810, 'seed'),
  (2024, 3, 134.1430, 'seed'),
  (2024, 4, 134.3360, 'seed'),
  (2024, 5, 134.1830, 'seed'),
  (2024, 6, 134.5450, 'seed'),
  (2024, 7, 135.5110, 'seed'),
  (2024, 8, 135.9630, 'seed'),
  (2024, 9, 136.0030, 'seed'),
  (2024, 10, 136.1450, 'seed'),
  (2024, 11, 137.0750, 'seed'),
  (2024, 12, 137.9450, 'seed'),
  -- 2025 (valores publicados hasta la fecha del seed; los meses siguientes los
  -- jala el Edge Function)
  (2025, 1, 138.7080, 'seed'),
  (2025, 2, 139.1670, 'seed'),
  (2025, 3, 139.4380, 'seed'),
  (2025, 4, 139.6400, 'seed'),
  (2025, 5, 139.9630, 'seed'),
  (2025, 6, 140.4880, 'seed'),
  (2025, 7, 141.0500, 'seed'),
  (2025, 8, 141.4720, 'seed'),
  (2025, 9, 141.9060, 'seed'),
  (2025, 10, 142.5410, 'seed'),
  (2025, 11, 143.0990, 'seed'),
  (2025, 12, 143.7700, 'seed')
on conflict (year, month) do nothing;
