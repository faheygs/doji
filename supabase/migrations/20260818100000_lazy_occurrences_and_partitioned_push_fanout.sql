-- Scale contract:
--   * activation and pre-live never scan every account;
--   * user_events are materialized when an eligible user opens the occurrence;
--   * push delivery is split into 128 independently leased, resumable shards;
--   * old feed rows are retained and hidden by occurrence instead of deleted
--     inside the alarm transaction.

drop trigger if exists profile_fanout_user_events_trigger on public.profiles;

alter table public.profiles
  add column if not exists push_shard smallint generated always as
    ((hashtextextended(id::text, 0) & 127)::smallint) stored;

drop index if exists public.profiles_push_broadcast_idx;
create index profiles_push_shard_broadcast_idx
  on public.profiles (push_shard, id)
  where notification_token is not null and coalesce(is_banned, false) = false;

create table if not exists public.push_fanout_shards (
  daily_event_id uuid not null references public.daily_events(id) on delete cascade,
  shard smallint not null check (shard between 0 and 127),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'expired')),
  after_user_id uuid,
  lease_id uuid,
  leased_at timestamptz,
  attempts integer not null default 0,
  claimed_recipients integer not null default 0,
  provider_accepted integer not null default 0,
  last_error text,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (daily_event_id, shard)
);

alter table public.push_fanout_shards enable row level security;
revoke all on table public.push_fanout_shards from public, anon, authenticated;

create or replace function public.get_doji_push_recipients_shard_page(
  p_daily_event_id uuid,
  p_shard smallint,
  p_after_user_id uuid default null,
  p_limit integer default 500
)
returns table (user_id uuid, notification_token text)
language sql
stable
security definer
set search_path = ''
as $$
  select profile.id, profile.notification_token
  from public.profiles profile
  where profile.push_shard = p_shard
    and (p_after_user_id is null or profile.id > p_after_user_id)
    and profile.notification_token is not null
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

create or replace function public.claim_doji_push_fanout_shard(
  p_daily_event_id uuid,
  p_shard smallint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row record;
  shard_row public.push_fanout_shards%rowtype;
  new_lease uuid := gen_random_uuid();
  push_expires_at timestamptz;
begin
  if p_shard < 0 or p_shard > 127 then raise exception 'Invalid push shard'; end if;

  select event.id, event.challenge_id, event.activated_at, event.closes_at,
         challenge.title
  into event_row
  from public.daily_events event
  join public.challenges challenge on challenge.id = event.challenge_id
  where event.id = p_daily_event_id;
  if not found or event_row.activated_at is null then
    raise exception 'Activated Doji not found';
  end if;

  push_expires_at := least(
    event_row.activated_at + interval '2 minutes',
    coalesce(event_row.closes_at, event_row.activated_at + interval '10 minutes')
  );

  if clock_timestamp() >= push_expires_at then
    update public.push_fanout_shards
    set status = 'expired', lease_id = null, leased_at = null,
        completed_at = coalesce(completed_at, clock_timestamp()), updated_at = now()
    where daily_event_id = p_daily_event_id and shard = p_shard
      and status not in ('completed', 'expired');
    return jsonb_build_object('state', 'done', 'reason', 'expired');
  end if;

  update public.push_fanout_shards
  set status = 'processing', lease_id = new_lease, leased_at = clock_timestamp(),
      attempts = attempts + 1, last_error = null, updated_at = now()
  where daily_event_id = p_daily_event_id and shard = p_shard
    and status in ('pending', 'processing')
    and (status = 'pending' or leased_at < clock_timestamp() - interval '45 seconds')
  returning * into shard_row;

  if not found then
    select * into shard_row from public.push_fanout_shards
    where daily_event_id = p_daily_event_id and shard = p_shard;
    if shard_row.status in ('completed', 'expired') then
      return jsonb_build_object('state', 'done', 'reason', shard_row.status);
    end if;
    return jsonb_build_object('state', 'busy', 'retry_after_seconds', 5);
  end if;

  return jsonb_build_object(
    'state', 'claimed',
    'lease_id', new_lease,
    'after_user_id', shard_row.after_user_id,
    'activated_at', event_row.activated_at,
    'push_expires_at', push_expires_at,
    'title', 'It''s time to Doji!',
    'body', event_row.title || ' — you have 10 minutes.'
  );
end;
$$;

create or replace function public.advance_doji_push_fanout_shard(
  p_daily_event_id uuid,
  p_shard smallint,
  p_lease_id uuid,
  p_after_user_id uuid,
  p_has_more boolean,
  p_claimed_count integer,
  p_accepted_count integer
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with changed as (
    update public.push_fanout_shards
    set after_user_id = case when p_has_more then p_after_user_id else after_user_id end,
        status = case when p_has_more then 'pending' else 'completed' end,
        lease_id = null,
        leased_at = null,
        claimed_recipients = claimed_recipients + greatest(coalesce(p_claimed_count, 0), 0),
        provider_accepted = provider_accepted + greatest(coalesce(p_accepted_count, 0), 0),
        completed_at = case when p_has_more then null else clock_timestamp() end,
        updated_at = now()
    where daily_event_id = p_daily_event_id and shard = p_shard
      and lease_id = p_lease_id and status = 'processing'
    returning 1
  )
  select exists(select 1 from changed);
$$;

create or replace function public.release_doji_push_fanout_shard(
  p_daily_event_id uuid,
  p_shard smallint,
  p_lease_id uuid,
  p_error text
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with changed as (
    update public.push_fanout_shards
    set status = 'pending', lease_id = null, leased_at = null,
        last_error = left(coalesce(p_error, 'Unknown fanout error'), 1000), updated_at = now()
    where daily_event_id = p_daily_event_id and shard = p_shard
      and lease_id = p_lease_id and status = 'processing'
    returning 1
  )
  select exists(select 1 from changed);
$$;

revoke all on function public.get_doji_push_recipients_shard_page(uuid, smallint, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.claim_doji_push_fanout_shard(uuid, smallint)
  from public, anon, authenticated;
revoke all on function public.advance_doji_push_fanout_shard(uuid, smallint, uuid, uuid, boolean, integer, integer)
  from public, anon, authenticated;
revoke all on function public.release_doji_push_fanout_shard(uuid, smallint, uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_doji_push_recipients_shard_page(uuid, smallint, uuid, integer)
  to service_role;
grant execute on function public.claim_doji_push_fanout_shard(uuid, smallint)
  to service_role;
grant execute on function public.advance_doji_push_fanout_shard(uuid, smallint, uuid, uuid, boolean, integer, integer)
  to service_role;
grant execute on function public.release_doji_push_fanout_shard(uuid, smallint, uuid, text)
  to service_role;

create or replace function public.begin_daily_event_prelive(p_daily_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.daily_events%rowtype;
  prelive_time timestamptz := clock_timestamp();
begin
  select * into event_row from public.daily_events
  where id = p_daily_event_id for update;
  if not found then raise exception 'Daily event not found'; end if;
  if event_row.activated_at is not null then
    return jsonb_build_object('daily_event_id', event_row.id, 'prelive_at', event_row.prelive_at,
      'fires_at', event_row.fires_at, 'already_active', true);
  end if;
  if event_row.prelive_at is not null then
    return jsonb_build_object('daily_event_id', event_row.id, 'prelive_at', event_row.prelive_at,
      'fires_at', event_row.fires_at, 'already_started', true);
  end if;
  if prelive_time < event_row.fires_at - interval '20 minutes 5 seconds' then
    raise exception 'Pre-live window has not started';
  end if;

  update public.daily_events set prelive_at = prelive_time where id = event_row.id;
  perform public.enqueue_domain_event(
    'doji:global', 'doji.pre_live', event_row.id,
    jsonb_build_object('dailyEventId', event_row.id, 'preliveAt', prelive_time,
      'firesAt', event_row.fires_at),
    'doji-pre-live:' || event_row.id::text
  );
  return jsonb_build_object('daily_event_id', event_row.id, 'prelive_at', prelive_time,
    'fires_at', event_row.fires_at, 'already_started', false);
end;
$$;

create or replace function public.activate_daily_event(p_daily_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row record;
  activation_time timestamptz := clock_timestamp();
  close_time timestamptz;
begin
  select event.*, challenge.title into event_row
  from public.daily_events event
  join public.challenges challenge on challenge.id = event.challenge_id
  where event.id = p_daily_event_id for update of event;
  if not found then raise exception 'Daily event not found'; end if;
  if event_row.activated_at is not null then
    return jsonb_build_object('daily_event_id', event_row.id,
      'activated_at', event_row.activated_at, 'closes_at', event_row.closes_at,
      'already_active', true);
  end if;

  close_time := activation_time + make_interval(mins => least(event_row.window_minutes, 10));
  update public.daily_events
  set fires_at = activation_time, activated_at = activation_time, closes_at = close_time
  where id = event_row.id;

  insert into public.push_fanout_shards (daily_event_id, shard)
  select event_row.id, shard::smallint from generate_series(0, 127) shard
  on conflict (daily_event_id, shard) do nothing;

  perform public.enqueue_domain_event(
    'doji:global', 'doji.activated', event_row.id,
    jsonb_build_object(
      'dailyEventId', event_row.id, 'challengeId', event_row.challenge_id,
      'activatedAt', activation_time, 'closesAt', close_time,
      'windowMinutes', least(event_row.window_minutes, 10)
    ),
    'doji-activated:' || event_row.id::text
  );

  return jsonb_build_object('daily_event_id', event_row.id,
    'activated_at', activation_time, 'closes_at', close_time, 'already_active', false);
end;
$$;

revoke all on function public.begin_daily_event_prelive(uuid) from public, anon, authenticated;
grant execute on function public.begin_daily_event_prelive(uuid) to service_role;
revoke all on function public.activate_daily_event(uuid) from public, anon, authenticated;
grant execute on function public.activate_daily_event(uuid) to service_role;

-- Materialize only the requesting user's occurrence. This preserves every
-- existing atomic submission/buy-in contract without creating 100k idle rows.
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

  insert into public.user_events (
    user_id, daily_event_id, status, expires_at, signup_day_grace
  ) values (
    uid, selected_event.id, 'pending',
    case
      when signup_grace then public.user_end_of_day(uid)
      else coalesce(
        selected_event.closes_at,
        selected_event.fires_at + make_interval(mins => least(selected_event.window_minutes, 10))
      )
    end,
    signup_grace
  ) on conflict (user_id, daily_event_id) do nothing;

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
    'status', case
      when phase = 'missed' and event_row.status = 'pending' then 'missed'
      else event_row.status
    end,
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

comment on table public.push_fanout_shards is
  '128 durable, independently leased Doji-start push partitions. Realtime and challenge correctness do not depend on these jobs.';
