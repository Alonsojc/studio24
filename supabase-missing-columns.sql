-- ============================================================
-- Studio 24 — Missing Supabase Columns
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================

-- 1. Config table: add RFC, régimen fiscal, código postal
ALTER TABLE config ADD COLUMN IF NOT EXISTS rfc text DEFAULT '';
ALTER TABLE config ADD COLUMN IF NOT EXISTS regimen_fiscal text DEFAULT '';
ALTER TABLE config ADD COLUMN IF NOT EXISTS codigo_postal text DEFAULT '';

-- 2. Egresos table: add solo_fiscal flag
ALTER TABLE egresos ADD COLUMN IF NOT EXISTS solo_fiscal boolean DEFAULT false;

-- Done! Verify with:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'config';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'egresos';
