-- Supabase can grant anon explicitly through default privileges, independently of PUBLIC.
revoke execute on function public.sync_write_record(text,jsonb,timestamptz,text) from anon;
revoke execute on function public.sync_delete_record(text,text,timestamptz) from anon;
revoke execute on function public.create_recurrente_egreso(text,text,text,jsonb) from anon;
