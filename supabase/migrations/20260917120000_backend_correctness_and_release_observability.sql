-- Backend-only correctness and observability hardening.
--
-- 1. Persist expired lazy occurrences as missed instead of returning a synthetic
--    missed phase while leaving the source-of-truth row pending.
-- 2. Remove database-advisor drift that weakens the authoritative posts policy
--    and duplicates a leaderboard index.
-- 3. Prepare optional release identity capture for the next native client while
--    preserving v1/v2 endpoint registration for every installed build.

drop policy if exists posts_read_all_authenticated on public.posts;
drop index if exists public.weekly_xp_week_xp_user_idx;

alter table public.device_push_endpoints
  add column if not exists app_version text,
  add column if not exists native_build_number text,
  add column if not exists release_channel text,
  add column if not exists release_observed_at timestamptz;

create index if not exists device_push_endpoints_release_observability_idx
  on public.device_push_endpoints (
    platform, app_version, native_build_number, last_registered_at desc
  )
  where active = true;

create or replace function public.register_native_push_endpoint_v3(
  p_installation_id text,
  p_token text,
  p_platform text,
  p_environment text,
  p_expo_token text default null,
  p_notification_contract_version smallint default 2,
  p_app_version text default null,
  p_native_build_number text default null,
  p_release_channel text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  normalized_version text := nullif(trim(p_app_version), '');
  normalized_build text := nullif(trim(p_native_build_number), '');
  normalized_channel text := nullif(lower(trim(p_release_channel)), '');
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if normalized_version is not null
     and (length(normalized_version) > 32 or normalized_version !~ '^[A-Za-z0-9._+\-]+$') then
    raise exception 'Invalid app version';
  end if;
  if normalized_build is not null
     and (length(normalized_build) > 32 or normalized_build !~ '^[A-Za-z0-9._+\-]+$') then
    raise exception 'Invalid native build number';
  end if;
  if normalized_channel is not null
     and normalized_channel not in (
       'production', 'internal', 'alpha', 'beta', 'testflight', 'preview', 'development'
     ) then
    raise exception 'Invalid release channel';
  end if;

  perform public.register_native_push_endpoint_v2(
    p_installation_id,
    p_token,
    p_platform,
    p_environment,
    p_expo_token,
    p_notification_contract_version
  );

  update public.device_push_endpoints endpoint
  set app_version = normalized_version,
      native_build_number = normalized_build,
      release_channel = normalized_channel,
      release_observed_at = clock_timestamp()
  where endpoint.user_id = uid
    and endpoint.installation_id = nullif(trim(p_installation_id), '')
    and endpoint.active = true;

  return found;
end;
$$;

revoke all on function public.register_native_push_endpoint_v3(
  text, text, text, text, text, smallint, text, text, text
) from public, anon;
grant execute on function public.register_native_push_endpoint_v3(
  text, text, text, text, text, smallint, text, text, text
) to authenticated;

create or replace function public.get_mobile_release_observability()
returns table (
  platform text,
  app_version text,
  native_build_number text,
  release_channel text,
  active_installations bigint,
  last_seen_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select endpoint.platform,
         endpoint.app_version,
         endpoint.native_build_number,
         endpoint.release_channel,
         count(*)::bigint,
         max(endpoint.last_registered_at)
  from public.device_push_endpoints endpoint
  where endpoint.active = true
  group by endpoint.platform, endpoint.app_version,
           endpoint.native_build_number, endpoint.release_channel
  order by endpoint.platform, max(endpoint.last_registered_at) desc;
$$;

revoke all on function public.get_mobile_release_observability()
  from public, anon, authenticated;
grant execute on function public.get_mobile_release_observability() to service_role;

-- Repair existing rows that were lazily materialized after their authoritative
-- participation deadline. Completion/buy-in states are intentionally untouched.
update public.user_events occurrence
set status = 'missed'
from public.daily_events event
where occurrence.daily_event_id = event.id
  and occurrence.status = 'pending'
  and event.activated_at is not null
  and case
        when occurrence.signup_day_grace is true then occurrence.expires_at
        else coalesce(event.closes_at, occurrence.expires_at)
      end <= clock_timestamp();

create or replace function public.get_current_doji_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  server_now_ts timestamptz := clock_timestamp();
  selected_event record;
  event_row record;
  occurrence_expires_at timestamptz;
  initial_status text;
  participant_deadline timestamptz;
  signup_grace boolean := false;
  phase text;
  event_json jsonb;
  challenge_json jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select event.*, to_jsonb(challenge) as challenge_json
  into selected_event
  from public.daily_events event
  join public.challenges challenge on challenge.id = event.challenge_id
  where (event.activated_at is not null or event.prelive_at is not null)
    and (
      not exists (
        select 1 from public.daily_event_audience audience
        where audience.daily_event_id = event.id
      )
      or exists (
        select 1 from public.daily_event_audience audience
        where audience.daily_event_id = event.id and audience.user_id = uid
      )
    )
  order by coalesce(event.activated_at, event.prelive_at) desc, event.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('server_now', server_now_ts, 'phase', 'none', 'user_event', null);
  end if;

  select (profile.created_at at time zone coalesce(profile.timezone, 'UTC'))::date =
         (server_now_ts at time zone coalesce(profile.timezone, 'UTC'))::date
  into signup_grace
  from public.profiles profile where profile.id = uid;
  signup_grace := coalesce(signup_grace, false);

  occurrence_expires_at := case
    when signup_grace then public.user_end_of_day(uid)
    else coalesce(
      selected_event.closes_at,
      selected_event.fires_at + make_interval(mins => least(selected_event.window_minutes, 10))
    )
  end;
  initial_status := case
    when selected_event.activated_at is null then 'pending'
    when server_now_ts < selected_event.activated_at then 'pending'
    when server_now_ts < occurrence_expires_at then 'pending'
    else 'missed'
  end;

  insert into public.user_events (
    user_id, daily_event_id, status, expires_at, signup_day_grace
  ) values (
    uid, selected_event.id, initial_status, occurrence_expires_at, signup_grace
  ) on conflict (user_id, daily_event_id) do nothing;

  -- Defensive reconciliation covers rows created by older clients/functions
  -- after close, without changing completed, late, or paid buy-in states.
  update public.user_events occurrence
  set status = 'missed'
  where occurrence.user_id = uid
    and occurrence.daily_event_id = selected_event.id
    and occurrence.status = 'pending'
    and selected_event.activated_at is not null
    and case
          when occurrence.signup_day_grace is true then occurrence.expires_at
          else coalesce(selected_event.closes_at, occurrence.expires_at)
        end <= server_now_ts;

  select occurrence.*, selected_event.fires_at, selected_event.window_minutes,
         selected_event.activated_at, selected_event.closes_at, selected_event.closed_at,
         selected_event.challenge_id, selected_event.created_at as daily_created_at,
         selected_event.challenge_json
  into event_row
  from public.user_events occurrence
  where occurrence.user_id = uid and occurrence.daily_event_id = selected_event.id;

  participant_deadline := case
    when event_row.signup_day_grace is true then event_row.expires_at
    else coalesce(event_row.closes_at, event_row.expires_at)
  end;

  challenge_json := event_row.challenge_json;
  if challenge_json->>'type' = 'poll' then
    challenge_json := challenge_json || jsonb_build_object(
      'poll_options', coalesce((
        select jsonb_agg(to_jsonb(option_row) order by option_row.position)
        from public.poll_options option_row
        where option_row.challenge_id = event_row.challenge_id
      ), '[]'::jsonb)
    );
  end if;

  phase := case
    when event_row.status in ('completed', 'late') then 'completed'
    when event_row.status = 'buy_in_open' then 'live'
    when event_row.status = 'missed' then 'missed'
    when event_row.activated_at is null then 'waiting'
    when server_now_ts < event_row.activated_at then 'waiting'
    when server_now_ts >= participant_deadline then 'missed'
    else 'live'
  end;

  event_json := to_jsonb(event_row)
    - 'fires_at' - 'window_minutes' - 'activated_at' - 'closes_at'
    - 'closed_at' - 'challenge_id' - 'daily_created_at' - 'challenge_json';
  event_json := event_json || jsonb_build_object(
    'status', event_row.status,
    'daily_event', jsonb_build_object(
      'id', event_row.daily_event_id,
      'challenge_id', event_row.challenge_id,
      'fires_at', event_row.fires_at,
      'window_minutes', event_row.window_minutes,
      'activated_at', event_row.activated_at,
      'closes_at', event_row.closes_at,
      'closed_at', event_row.closed_at,
      'created_at', event_row.daily_created_at,
      'challenge', challenge_json
    ),
    'challenge', challenge_json
  );

  return jsonb_build_object(
    'server_now', server_now_ts,
    'phase', phase,
    'opens_at', event_row.activated_at,
    'closes_at', case when event_row.status = 'buy_in_open' then null else participant_deadline end,
    'user_event', event_json
  );
end;
$$;

revoke all on function public.get_current_doji_state() from public, anon;
grant execute on function public.get_current_doji_state() to authenticated;

comment on function public.get_current_doji_state() is
  'Returns authoritative current Doji state and atomically materializes an already-expired occurrence as missed.';
