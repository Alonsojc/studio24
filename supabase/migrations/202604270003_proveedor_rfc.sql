-- Studio 24 — Agrega columna RFC a proveedores (necesaria para DIOT)
-- Ejecutar UNA vez en Supabase SQL Editor.

alter table proveedores add column if not exists rfc text default '';
