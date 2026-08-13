-- Backward compatibility for installed clients that still update
-- profiles.notification_token directly. Transfer a token away from its old
-- owner before the unique index checks the incoming row.
create or replace function public.transfer_push_token_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_token text := nullif(trim(new.notification_token), '');
begin
  new.notification_token := normalized_token;
  if normalized_token is null or normalized_token is not distinct from old.notification_token then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(normalized_token, 0));
  update public.profiles
  set notification_token = null
  where notification_token = normalized_token and id <> new.id;
  return new;
end;
$$;

revoke all on function public.transfer_push_token_ownership()
  from public, anon, authenticated;

drop trigger if exists profiles_transfer_push_token on public.profiles;
create trigger profiles_transfer_push_token
  before update of notification_token on public.profiles
  for each row execute function public.transfer_push_token_ownership();
