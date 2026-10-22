-- Production operators may update an order, but collection annotations belong
-- to finance. Enforce this on direct REST updates as well as the dedicated RPC.
create function app_private.guard_collection_metadata() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_user in ('authenticated','anon')
    and (new.payment_due_date,new.next_followup_date,new.collection_notes) is distinct from
      (old.payment_due_date,old.next_followup_date,old.collection_notes)
    and not app_private.current_user_has_role('admin','contador') then
    raise exception 'Sin permiso para gestionar cobranza' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function app_private.guard_collection_metadata() from public,anon,authenticated;
create trigger guard_collection_metadata before update on public.pedidos
  for each row execute function app_private.guard_collection_metadata();
