create function app_private.guard_collection_creation() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_user in ('authenticated','anon') and not app_private.current_user_has_role('admin','contador')
    and (new.payment_due_date is not null or new.next_followup_date is not null or coalesce(new.collection_notes,'')<>'') then
    raise exception 'Sin permiso para gestionar cobranza' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function app_private.guard_collection_creation() from public,anon,authenticated;
create trigger guard_collection_creation before insert on public.pedidos
  for each row execute function app_private.guard_collection_creation();
