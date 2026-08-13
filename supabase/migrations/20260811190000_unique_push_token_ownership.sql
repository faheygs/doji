-- An Expo token identifies one app installation, not a user account. A token
-- retained by multiple profiles turns normal per-user fan-out into a push storm
-- on one physical device. Keep only the most recently updated owner, enforce
-- uniqueness, and transfer ownership transactionally on registration.
with ranked_tokens as (
  select
    profile.id,
    row_number() over (
      partition by profile.notification_token
      order by profile.updated_at desc nulls last, profile.created_at desc, profile.id
    ) as ownership_rank
  from public.profiles profile
  where nullif(trim(profile.notification_token), '') is not null
)
update public.profiles profile
set notification_token = null
from ranked_tokens ranked
where profile.id = ranked.id
  and ranked.ownership_rank > 1;

update public.profiles
set notification_token = null
where notification_token is not null and trim(notification_token) = '';

create unique index if not exists profiles_notification_token_unique
  on public.profiles (notification_token)
  where notification_token is not null;

create or replace function public.register_push_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  normalized_token text := nullif(trim(p_token), '');
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if normalized_token is null or length(normalized_token) < 20 then
    raise exception 'Invalid push token';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(normalized_token, 0));

  update public.profiles
  set notification_token = null
  where notification_token = normalized_token and id <> uid;

  update public.profiles
  set notification_token = normalized_token, updated_at = clock_timestamp()
  where id = uid;

  if not found then raise exception 'Profile not found'; end if;
  return true;
end;
$$;

revoke all on function public.register_push_token(text) from public, anon;
grant execute on function public.register_push_token(text) to authenticated;

create or replace function public.unregister_push_token()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return false; end if;
  update public.profiles
  set notification_token = null, updated_at = clock_timestamp()
  where id = uid and notification_token is not null;
  return true;
end;
$$;

revoke all on function public.unregister_push_token() from public, anon;
grant execute on function public.unregister_push_token() to authenticated;
