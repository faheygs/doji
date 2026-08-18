-- Expo's shared push gateway is capped at 600 notifications/second per project.
-- Keep Expo tokens as a migration fallback, but register native endpoints so the
-- iOS launch fanout can talk directly to APNs without that global bottleneck.
-- Android endpoints are retained for a direct FCM worker; Expo remains their fallback.

create table public.device_push_endpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  installation_id text not null,
  provider text not null check (provider in ('apns', 'fcm')),
  platform text not null check (platform in ('ios', 'android')),
  environment text not null check (environment in ('sandbox', 'production')),
  token text not null,
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  last_registered_at timestamptz not null default clock_timestamp(),
  invalidated_at timestamptz,
  unique (provider, token),
  unique (user_id, installation_id)
);

alter table public.device_push_endpoints enable row level security;
revoke all on table public.device_push_endpoints from public, anon, authenticated;

create index device_push_endpoints_user_active_idx
  on public.device_push_endpoints (user_id, last_registered_at desc, id desc)
  where active = true;
create index device_push_endpoints_retention_idx
  on public.device_push_endpoints (last_registered_at, id);

drop index if exists public.profiles_push_shard_broadcast_idx;
create index profiles_push_shard_active_idx
  on public.profiles (push_shard, id)
  where coalesce(is_banned, false) = false;

create or replace function public.register_native_push_endpoint(
  p_installation_id text,
  p_token text,
  p_platform text,
  p_environment text,
  p_expo_token text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  normalized_installation text := nullif(trim(p_installation_id), '');
  normalized_token text := nullif(trim(p_token), '');
  normalized_platform text := lower(trim(p_platform));
  normalized_environment text := lower(trim(p_environment));
  native_provider text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if normalized_installation is null or length(normalized_installation) > 160 then
    raise exception 'Invalid installation identifier';
  end if;
  if normalized_token is null or length(normalized_token) > 4096 then
    raise exception 'Invalid native push token';
  end if;
  if normalized_platform not in ('ios', 'android') then
    raise exception 'Invalid push platform';
  end if;
  if normalized_environment not in ('sandbox', 'production') then
    raise exception 'Invalid push environment';
  end if;
  native_provider := case when normalized_platform = 'ios' then 'apns' else 'fcm' end;

  perform pg_advisory_xact_lock(hashtextextended(native_provider || ':' || normalized_token, 0));
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || normalized_installation, 0));

  delete from public.device_push_endpoints endpoint
  where (endpoint.provider = native_provider and endpoint.token = normalized_token)
     or (endpoint.user_id = uid and endpoint.installation_id = normalized_installation);

  insert into public.device_push_endpoints (
    user_id, installation_id, provider, platform, environment, token
  ) values (
    uid, normalized_installation, native_provider, normalized_platform,
    normalized_environment, normalized_token
  );

  -- Bound both storage and per-notification provider work for accounts that are
  -- repeatedly reinstalled. The five most recently registered devices remain live.
  with ranked as (
    select endpoint.id,
           row_number() over (
             order by endpoint.last_registered_at desc, endpoint.id desc
           ) position
    from public.device_push_endpoints endpoint
    where endpoint.user_id = uid and endpoint.active = true
  )
  update public.device_push_endpoints endpoint
  set active = false, invalidated_at = clock_timestamp()
  from ranked
  where endpoint.id = ranked.id and ranked.position > 5;

  if nullif(trim(p_expo_token), '') is not null then
    perform public.register_push_token(trim(p_expo_token));
  end if;
  return true;
end;
$$;

create or replace function public.unregister_push_installation(
  p_installation_id text,
  p_expo_token text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return false; end if;
  update public.device_push_endpoints endpoint
  set active = false, invalidated_at = clock_timestamp()
  where endpoint.user_id = uid
    and endpoint.installation_id = nullif(trim(p_installation_id), '')
    and endpoint.active = true;
  update public.profiles profile
  set notification_token = null, updated_at = clock_timestamp()
  where profile.id = uid
    and profile.notification_token = nullif(trim(p_expo_token), '');
  return true;
end;
$$;

revoke all on function public.register_native_push_endpoint(text, text, text, text, text)
  from public, anon;
revoke all on function public.unregister_push_installation(text, text)
  from public, anon;
grant execute on function public.register_native_push_endpoint(text, text, text, text, text)
  to authenticated;
grant execute on function public.unregister_push_installation(text, text)
  to authenticated;

create or replace function public.get_push_recipients(p_user_ids uuid[])
returns table (
  user_id uuid,
  notification_token text,
  notification_preferences jsonb,
  native_endpoints jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select profile.id, profile.notification_token, profile.notification_preferences,
         coalesce(native.endpoints, '[]'::jsonb)
  from public.profiles profile
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'installationId', endpoint.installation_id,
      'token', endpoint.token,
      'provider', endpoint.provider,
      'environment', endpoint.environment
    ) order by endpoint.last_registered_at desc, endpoint.id desc) endpoints
    from (
      select endpoint.installation_id, endpoint.token, endpoint.provider,
             endpoint.environment, endpoint.last_registered_at, endpoint.id
      from public.device_push_endpoints endpoint
      where endpoint.user_id = profile.id and endpoint.active = true
      order by endpoint.last_registered_at desc, endpoint.id desc
      limit 5
    ) endpoint
  ) native on true
  where profile.id = any(coalesce(p_user_ids, array[]::uuid[]))
    and cardinality(coalesce(p_user_ids, array[]::uuid[])) <= 500
    and coalesce(profile.is_banned, false) = false;
$$;

revoke all on function public.get_push_recipients(uuid[])
  from public, anon, authenticated;
grant execute on function public.get_push_recipients(uuid[]) to service_role;

drop function if exists public.get_doji_push_recipients_shard_page(uuid, smallint, uuid, integer);
create function public.get_doji_push_recipients_shard_page(
  p_daily_event_id uuid,
  p_shard smallint,
  p_after_user_id uuid default null,
  p_limit integer default 500
)
returns table (
  user_id uuid,
  notification_token text,
  native_endpoints jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select profile.id, profile.notification_token,
         coalesce(native.endpoints, '[]'::jsonb)
  from public.profiles profile
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'installationId', endpoint.installation_id,
      'token', endpoint.token,
      'provider', endpoint.provider,
      'environment', endpoint.environment
    ) order by endpoint.last_registered_at desc, endpoint.id desc) endpoints
    from (
      select endpoint.installation_id, endpoint.token, endpoint.provider,
             endpoint.environment, endpoint.last_registered_at, endpoint.id
      from public.device_push_endpoints endpoint
      where endpoint.user_id = profile.id and endpoint.active = true
      order by endpoint.last_registered_at desc, endpoint.id desc
      limit 5
    ) endpoint
  ) native on true
  where profile.push_shard = p_shard
    and (p_after_user_id is null or profile.id > p_after_user_id)
    and (jsonb_array_length(coalesce(native.endpoints, '[]'::jsonb)) > 0
      or profile.notification_token is not null)
    and coalesce(profile.is_banned, false) = false
    and coalesce((profile.notification_preferences ->> 'push_enabled')::boolean, true)
    and coalesce((profile.notification_preferences ->> 'doji_start')::boolean, true)
    and (
      not exists (
        select 1 from public.daily_event_audience audience
        where audience.daily_event_id = p_daily_event_id
      )
      or exists (
        select 1 from public.daily_event_audience audience
        where audience.daily_event_id = p_daily_event_id
          and audience.user_id = profile.id
      )
    )
  order by profile.id
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

revoke all on function public.get_doji_push_recipients_shard_page(uuid, smallint, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.get_doji_push_recipients_shard_page(uuid, smallint, uuid, integer)
  to service_role;

-- Claim provider handoffs independently per installation. One event may target
-- several devices owned by the same user; retrying one must not duplicate another.
create or replace function public.claim_push_delivery_targets_batch(
  p_event_id uuid,
  p_targets jsonb,
  p_category text,
  p_aggregate_id text default null
)
returns table (delivery_key text, target_user_id uuid, endpoint_key text)
language sql
security definer
set search_path = ''
as $$
  with targets as (
    select distinct
      (item ->> 'userId')::uuid user_id,
      nullif(trim(item ->> 'endpointKey'), '') endpoint_key
    from jsonb_array_elements(coalesce(p_targets, '[]'::jsonb)) item
    where nullif(trim(item ->> 'userId'), '') is not null
      and nullif(trim(item ->> 'endpointKey'), '') is not null
  ), inserted as (
    insert into public.push_delivery_claims (
      delivery_key, target_user_id, category, aggregate_id,
      terminal_at, outcome
    )
    select 'outbox-push:' || p_event_id::text || ':' || target.user_id::text || ':' ||
             target.endpoint_key,
           target.user_id,
           coalesce(nullif(trim(p_category), ''), 'unknown'),
           nullif(trim(p_aggregate_id), ''), clock_timestamp(), 'claimed'
    from targets target
    on conflict (delivery_key) do nothing
    returning push_delivery_claims.delivery_key,
              push_delivery_claims.target_user_id
  )
  select inserted.delivery_key, inserted.target_user_id, target.endpoint_key
  from inserted
  join targets target on target.user_id = inserted.target_user_id
    and inserted.delivery_key = 'outbox-push:' || p_event_id::text || ':' ||
      target.user_id::text || ':' || target.endpoint_key;
$$;

revoke all on function public.claim_push_delivery_targets_batch(uuid, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_push_delivery_targets_batch(uuid, jsonb, text, text)
  to service_role;

create or replace function public.invalidate_native_push_tokens(p_tokens text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  update public.device_push_endpoints endpoint
  set active = false, invalidated_at = clock_timestamp()
  where endpoint.token = any(coalesce(p_tokens, array[]::text[])) and endpoint.active = true;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.invalidate_expo_push_token(
  p_user_id uuid,
  p_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  update public.profiles profile
  set notification_token = null, updated_at = clock_timestamp()
  where profile.id = p_user_id
    and profile.notification_token = nullif(trim(p_token), '');
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

create or replace function public.invalidate_expo_push_tokens(p_tokens text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  update public.profiles profile
  set notification_token = null, updated_at = clock_timestamp()
  where profile.notification_token = any(coalesce(p_tokens, array[]::text[]));
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.delete_stale_push_endpoints(p_limit integer default 5000)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  with doomed as (
    select endpoint.id from public.device_push_endpoints endpoint
    where endpoint.last_registered_at < clock_timestamp() - interval '180 days'
      or (endpoint.active = false
        and endpoint.invalidated_at < clock_timestamp() - interval '30 days')
    order by endpoint.last_registered_at, endpoint.id
    limit least(greatest(coalesce(p_limit, 5000), 100), 10000)
  )
  delete from public.device_push_endpoints endpoint using doomed
  where endpoint.id = doomed.id;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.invalidate_native_push_tokens(text[])
  from public, anon, authenticated;
revoke all on function public.invalidate_expo_push_token(uuid, text)
  from public, anon, authenticated;
revoke all on function public.invalidate_expo_push_tokens(text[])
  from public, anon, authenticated;
revoke all on function public.delete_stale_push_endpoints(integer)
  from public, anon, authenticated;
grant execute on function public.invalidate_native_push_tokens(text[]) to service_role;
grant execute on function public.invalidate_expo_push_token(uuid, text) to service_role;
grant execute on function public.invalidate_expo_push_tokens(text[]) to service_role;
grant execute on function public.delete_stale_push_endpoints(integer) to service_role;

-- Friend lists are user-controlled collections and can become large. Keep their
-- cost flat with keyset cursors instead of OFFSET scans.
create index if not exists friendships_requester_accepted_page_idx
  on public.friendships (requester_id, accepted_at desc, id desc)
  where status = 'accepted';
create index if not exists friendships_addressee_accepted_page_idx
  on public.friendships (addressee_id, accepted_at desc, id desc)
  where status = 'accepted';

create or replace function public.list_my_friends_page(
  p_before_accepted_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns table (
  friendship_id uuid, friend_id uuid, username text, display_name text,
  avatar_url text, avatar_gradient text[], current_streak integer,
  equipped_border_key text, accepted_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select friendship.id, profile.id, profile.username, profile.display_name,
    profile.avatar_url, profile.avatar_gradient, profile.current_streak,
    profile.equipped_border_key, friendship.accepted_at
  from public.friendships friendship
  join public.profiles profile on profile.id = case
    when friendship.requester_id = auth.uid() then friendship.addressee_id
    else friendship.requester_id end
  where auth.uid() is not null and friendship.status = 'accepted'
    and (friendship.requester_id = auth.uid() or friendship.addressee_id = auth.uid())
    and (
      p_before_accepted_at is null
      or friendship.accepted_at < p_before_accepted_at
      or (friendship.accepted_at = p_before_accepted_at and friendship.id < p_before_id)
    )
  order by friendship.accepted_at desc, friendship.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.list_my_friends_page(timestamptz, uuid, integer)
  from public, anon;
grant execute on function public.list_my_friends_page(timestamptz, uuid, integer)
  to authenticated;

drop function if exists public.list_profile_friends_page(uuid, integer, integer);
create function public.list_profile_friends_page(
  p_profile_user_id uuid,
  p_after_friend_id uuid default null,
  p_limit integer default 50
)
returns table (
  friend_id uuid, username text, display_name text, avatar_url text,
  avatar_gradient text[], equipped_border_key text
)
language sql stable security definer set search_path = '' as $$
  select distinct on (profile.id)
    profile.id, profile.username, profile.display_name, profile.avatar_url,
    profile.avatar_gradient, profile.equipped_border_key
  from public.friendships friendship
  join public.profiles profile on profile.id = case
    when friendship.requester_id = p_profile_user_id then friendship.addressee_id
    else friendship.requester_id end
  where friendship.status = 'accepted'
    and (friendship.requester_id = p_profile_user_id
      or friendship.addressee_id = p_profile_user_id)
    and auth.uid() is not null
    and not exists (
      select 1 from public.blocks block
      where (block.blocker_id = p_profile_user_id and block.blocked_id = auth.uid())
         or (block.blocker_id = auth.uid() and block.blocked_id = p_profile_user_id)
    )
    and not exists (
      select 1 from public.blocks block
      where (block.blocker_id = profile.id and block.blocked_id = auth.uid())
         or (block.blocker_id = auth.uid() and block.blocked_id = profile.id)
    )
    and (p_after_friend_id is null or profile.id > p_after_friend_id)
  order by profile.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.list_profile_friends_page(uuid, uuid, integer)
  from public, anon;
grant execute on function public.list_profile_friends_page(uuid, uuid, integer)
  to authenticated;

create index if not exists blocks_blocker_created_page_idx
  on public.blocks (blocker_id, created_at desc, id desc);

create or replace function public.list_blocked_users_page(
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns table (
  block_id uuid, blocked_at timestamptz, id uuid, username text,
  display_name text, avatar_url text, equipped_border_key text
)
language sql stable security definer set search_path = '' as $$
  select block.id, block.created_at, profile.id, profile.username,
    coalesce(profile.display_name, profile.username), profile.avatar_url,
    profile.equipped_border_key
  from public.blocks block
  join public.profiles profile on profile.id = block.blocked_id
  where block.blocker_id = auth.uid()
    and (
      p_before_created_at is null
      or block.created_at < p_before_created_at
      or (block.created_at = p_before_created_at and block.id < p_before_id)
    )
  order by block.created_at desc, block.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

create or replace function public.blocked_user_count()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.blocks block where block.blocker_id = auth.uid();
$$;

revoke all on function public.list_blocked_users_page(timestamptz, uuid, integer)
  from public, anon;
revoke all on function public.blocked_user_count() from public, anon;
grant execute on function public.list_blocked_users_page(timestamptz, uuid, integer)
  to authenticated;
grant execute on function public.blocked_user_count() to authenticated;
create index if not exists friendships_pending_addressee_page_idx
  on public.friendships (addressee_id, created_at desc, id desc)
  where status = 'pending';

create or replace function public.list_friend_requests_page(
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns table (
  id uuid, requester_id uuid, addressee_id uuid, status text,
  created_at timestamptz, accepted_at timestamptz,
  requester_username text, requester_display_name text,
  requester_avatar_url text, requester_avatar_gradient text[],
  requester_equipped_border_key text
)
language sql stable security definer set search_path = '' as $$
  select friendship.id, friendship.requester_id, friendship.addressee_id,
    friendship.status, friendship.created_at, friendship.accepted_at,
    profile.username, coalesce(profile.display_name, profile.username),
    profile.avatar_url, profile.avatar_gradient, profile.equipped_border_key
  from public.friendships friendship
  join public.profiles profile on profile.id = friendship.requester_id
  where friendship.addressee_id = auth.uid()
    and friendship.status = 'pending'
    and not exists (
      select 1 from public.blocks block
      where (block.blocker_id = auth.uid() and block.blocked_id = friendship.requester_id)
         or (block.blocker_id = friendship.requester_id and block.blocked_id = auth.uid())
    )
    and (
      p_before_created_at is null
      or friendship.created_at < p_before_created_at
      or (friendship.created_at = p_before_created_at and friendship.id < p_before_id)
    )
  order by friendship.created_at desc, friendship.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

create or replace function public.friend_request_count()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer
  from public.friendships friendship
  where friendship.addressee_id = auth.uid() and friendship.status = 'pending';
$$;

revoke all on function public.list_friend_requests_page(timestamptz, uuid, integer)
  from public, anon;
revoke all on function public.friend_request_count() from public, anon;
grant execute on function public.list_friend_requests_page(timestamptz, uuid, integer)
  to authenticated;
grant execute on function public.friend_request_count() to authenticated;

create or replace function public.get_post_detail(p_post_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select (to_jsonb(post) - 'idempotency_key') || jsonb_build_object(
    'profile', case when profile.id is null then null else jsonb_build_object(
      'id', profile.id, 'username', profile.username,
      'display_name', profile.display_name, 'avatar_url', profile.avatar_url,
      'avatar_gradient', profile.avatar_gradient,
      'equipped_border_key', profile.equipped_border_key,
      'equipped_title_key', profile.equipped_title_key
    ) end,
    'challenge', to_jsonb(challenge),
    'daily_event', to_jsonb(event) || jsonb_build_object(
      'challenge', to_jsonb(challenge)
    )
  )
  from public.posts post
  join public.daily_events event on event.id = post.daily_event_id
  join public.challenges challenge on challenge.id = event.challenge_id
  left join public.profiles profile on profile.id = post.user_id
  where post.id = p_post_id
    and auth.uid() is not null
    and public.can_view_full_post(
      auth.uid(), post.user_event_id, post.daily_event_id,
      post.user_id, post.is_community_poll
    )
    and not exists (
      select 1 from public.blocks block
      where (block.blocker_id = auth.uid() and block.blocked_id = post.user_id)
         or (block.blocker_id = post.user_id and block.blocked_id = auth.uid())
    );
$$;

revoke all on function public.get_post_detail(uuid) from public, anon;
grant execute on function public.get_post_detail(uuid) to authenticated;

-- Compatibility for installed clients. Never build public profile output by
-- subtracting private columns from a full row; future columns would leak.
create or replace function public.get_profile_by_username(p_username text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  target_id uuid;
  public_view jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select profile.id into target_id from public.profiles profile
  where profile.username = lower(trim(p_username)) limit 1;
  if target_id is null then return null; end if;
  if target_id = auth.uid() then return public.get_own_profile(); end if;
  public_view := public.get_public_profile_view(p_username);
  if public_view ->> 'status' <> 'visible' then return null; end if;
  return public_view -> 'profile';
end;
$$;

revoke all on function public.get_profile_by_username(text) from public, anon;
grant execute on function public.get_profile_by_username(text) to authenticated;

create or replace function public.search_profiles(
  p_query text default '',
  p_limit integer default 20
)
returns setof jsonb language sql stable security definer set search_path = '' as $$
  with candidates as (
    select profile.*
    from public.profiles profile
    where auth.uid() is not null
      and profile.id <> auth.uid()
      and coalesce(profile.is_banned, false) = false
      and coalesce(profile.is_demo_account, false) = false
      and not exists (
        select 1 from public.blocks block
        where (block.blocker_id = auth.uid() and block.blocked_id = profile.id)
           or (block.blocked_id = auth.uid() and block.blocker_id = profile.id)
      )
      and (
        nullif(lower(trim(p_query)), '') is null
        or profile.username like lower(trim(p_query)) || '%'
      )
    order by
      case when nullif(lower(trim(p_query)), '') is null then profile.created_at end desc,
      profile.username
    limit least(greatest(coalesce(p_limit, 20), 1), 30)
  )
  select jsonb_build_object(
    'id', profile.id, 'username', profile.username,
    'display_name', profile.display_name, 'avatar_url', profile.avatar_url,
    'avatar_gradient', profile.avatar_gradient,
    'equipped_border_key', profile.equipped_border_key,
    'friendship_status', case
      when exists (
        select 1 from public.friendships friendship
        where friendship.status = 'accepted'
          and ((friendship.requester_id = auth.uid() and friendship.addressee_id = profile.id)
            or (friendship.addressee_id = auth.uid() and friendship.requester_id = profile.id))
      ) then 'friends'
      when exists (
        select 1 from public.friendships friendship
        where friendship.status = 'pending'
          and friendship.requester_id = auth.uid() and friendship.addressee_id = profile.id
      ) then 'pending_out'
      when exists (
        select 1 from public.friendships friendship
        where friendship.status = 'pending'
          and friendship.addressee_id = auth.uid() and friendship.requester_id = profile.id
      ) then 'pending_in'
      else 'none'
    end
  ) from candidates profile;
$$;

revoke all on function public.search_profiles(text, integer) from public, anon;
grant execute on function public.search_profiles(text, integer) to authenticated;
comment on table public.device_push_endpoints is
  'Private per-installation native push endpoints. Every active installation is independently idempotent and uses direct APNs or FCM when configured.';
