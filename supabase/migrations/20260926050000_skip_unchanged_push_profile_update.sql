-- Approved member-backend scope: avoid profile triggers on unchanged Expo-token
-- reconciliation. Native endpoint freshness remains owned by the v1/v2/v3 chain.
-- No grants, RLS, token-transfer policy, Auth settings or other RPC changes.
do $$
begin
  if md5(pg_get_functiondef('public.register_push_token(text)'::regprocedure))
    <> '9643647407ac75f82729df0fe1e1fcb5' then
    raise exception 'register_push_token baseline drift; review before applying';
  end if;
end;
$$;

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
  where id = uid
    and notification_token is distinct from normalized_token;

  -- UPDATE 0 is a valid unchanged token, not necessarily a missing profile.
  -- Retain the error for a deleted/missing member so a transfer rolls back too.
  if not found and not exists (select 1 from public.profiles where id = uid) then
    raise exception 'Profile not found';
  end if;
  return true;
end;
$$;
