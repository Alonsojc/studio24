-- Restore verification found a production installation missing this older column.
-- Do not infer RFCs or change supplier identities, cash or historical movements.
alter table public.proveedores add column if not exists rfc text default '';
