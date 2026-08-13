-- Keep the alarm transaction bounded at 100k+ accounts. Eligibility is
-- prepared during pre-live; activation emits one realtime event and one
-- resumable push-broadcast command instead of one outbox row per account.

alter table public.push_delivery_claims
  add column if not exists delivered_at timestamptz,
  add column if not exists attempts integer not null default 1;

-- Claims created by the former at-most-once path are already terminal.
update public.push_delivery_claims set delivered_at = claimed_at
where delivered_at is null;

create or replace function public.claim_push_delivery(
  p_delivery_key text,
  p_target_user_id uuid,
  p_category text,
  p_aggregate_id text default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_delivery_key is null or length(p_delivery_key) < 16 then
    raise exception 'Invalid push delivery key';
  end if;
  insert into public.push_delivery_claims (
    delivery_key, target_user_id, category, aggregate_id
  ) values (p_delivery_key, p_target_user_id,
    coalesce(nullif(trim(p_category), ''), 'unknown'), nullif(trim(p_aggregate_id), ''))
  on conflict (delivery_key) do update
    set attempts = public.push_delivery_claims.attempts + 1,
        claimed_at = clock_timestamp()
    where public.push_delivery_claims.delivered_at is null;
  return found;
end;
$$;

create or replace function public.continue_domain_event_broadcast(
  p_event_id uuid,
  p_lease_id uuid,
  p_after_user_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with continued as (
    update public.domain_event_outbox
    set payload = jsonb_set(
          jsonb_set(payload, '{broadcastAfterUserId}', to_jsonb(p_after_user_id::text), true),
          '{realtimePublished}', 'true'::jsonb, true
        ),
        lease_id = null,
        leased_at = null
    where id = p_event_id and lease_id = p_lease_id and published_at is null
    returning id
  )
  select exists(select 1 from continued);
$$;

create or replace function public.claim_push_deliveries_batch(
  p_event_id uuid,
  p_target_user_ids jsonb,
  p_category text,
  p_aggregate_id text default null
)
returns table (target_user_id uuid)
language sql
security definer
set search_path = ''
as $$
  with targets as (
    select distinct value::uuid as user_id
    from jsonb_array_elements_text(coalesce(p_target_user_ids, '[]'::jsonb))
  ), inserted as (
    insert into public.push_delivery_claims (
      delivery_key, target_user_id, category, aggregate_id
    )
    select 'outbox-push:' || p_event_id::text || ':' || target.user_id::text,
           target.user_id,
           coalesce(nullif(trim(p_category), ''), 'unknown'),
           nullif(trim(p_aggregate_id), '')
    from targets target
    on conflict (delivery_key) do update
      set attempts = public.push_delivery_claims.attempts + 1,
          claimed_at = clock_timestamp()
      where public.push_delivery_claims.delivered_at is null
    returning push_delivery_claims.target_user_id
  )
  select inserted.target_user_id from inserted;
$$;

create or replace function public.complete_push_deliveries_batch(
  p_event_id uuid,
  p_target_user_ids jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  update public.push_delivery_claims claim set delivered_at = clock_timestamp()
  where claim.delivery_key in (
    select 'outbox-push:' || p_event_id::text || ':' || value::uuid::text
    from jsonb_array_elements_text(coalesce(p_target_user_ids, '[]'::jsonb))
  ) and claim.delivered_at is null;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.continue_domain_event_broadcast(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.claim_push_deliveries_batch(uuid, jsonb, text, text)
  from public, anon, authenticated;
revoke all on function public.complete_push_deliveries_batch(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.continue_domain_event_broadcast(uuid, uuid, uuid)
  to service_role;
grant execute on function public.claim_push_deliveries_batch(uuid, jsonb, text, text)
  to service_role;
grant execute on function public.complete_push_deliveries_batch(uuid, jsonb)
  to service_role;

create or replace function public.get_doji_push_recipients_page(
  p_daily_event_id uuid,
  p_after_user_id uuid default null,
  p_limit integer default 1000
)
returns table (user_id uuid, notification_token text)
language sql
stable
security definer
set search_path = ''
as $$
  select participant.user_id, profile.notification_token
  from public.user_events participant
  join public.profiles profile on profile.id = participant.user_id
  where participant.daily_event_id = p_daily_event_id
    and (p_after_user_id is null or participant.user_id > p_after_user_id)
    and profile.notification_token is not null
    and coalesce(profile.is_banned, false) = false
    and coalesce((profile.notification_preferences ->> 'push_enabled')::boolean, true)
    and coalesce((profile.notification_preferences ->> 'doji_start')::boolean, true)
  order by participant.user_id
  limit least(greatest(p_limit, 1), 2000);
$$;

revoke all on function public.get_doji_push_recipients_page(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.get_doji_push_recipients_page(uuid, uuid, integer)
  to service_role;

create index if not exists profiles_push_broadcast_idx
  on public.profiles (id)
  where notification_token is not null and coalesce(is_banned, false) = false;

create index if not exists user_events_event_status_idx
  on public.user_events (daily_event_id, status, user_id);

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
  insert into public.user_events (user_id, daily_event_id, status, expires_at)
  select profile.id, event_row.id, 'pending',
         event_row.fires_at + make_interval(mins => least(event_row.window_minutes, 10))
  from public.profiles profile
  where coalesce(profile.is_banned, false) = false
    and (not exists (select 1 from public.daily_event_audience a where a.daily_event_id = event_row.id)
      or exists (select 1 from public.daily_event_audience a
                 where a.daily_event_id = event_row.id and a.user_id = profile.id))
  on conflict (user_id, daily_event_id) do nothing;

  delete from public.posts post
  where post.daily_event_id is not null and post.daily_event_id <> event_row.id;
  delete from public.posts post using public.user_events participant
  where post.user_event_id = participant.id and participant.daily_event_id <> event_row.id;

  perform public.enqueue_domain_event('doji:global', 'doji.pre_live', event_row.id,
    jsonb_build_object('dailyEventId', event_row.id, 'preliveAt', prelive_time,
      'firesAt', event_row.fires_at), 'doji-pre-live:' || event_row.id::text);
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
  select de.*, ch.title into event_row from public.daily_events de
  join public.challenges ch on ch.id = de.challenge_id
  where de.id = p_daily_event_id for update of de;
  if not found then raise exception 'Daily event not found'; end if;
  if event_row.activated_at is not null then
    return jsonb_build_object('daily_event_id', event_row.id,
      'activated_at', event_row.activated_at, 'closes_at', event_row.closes_at,
      'already_active', true);
  end if;

  close_time := activation_time + make_interval(mins => least(event_row.window_minutes, 10));
  update public.daily_events set fires_at = activation_time, activated_at = activation_time,
    closes_at = close_time where id = event_row.id;

  -- Recovery path for an alarm that skipped pre-live; normally this is a no-op.
  insert into public.user_events (user_id, daily_event_id, status, expires_at)
  select profile.id, event_row.id, 'pending', close_time
  from public.profiles profile
  where coalesce(profile.is_banned, false) = false
    and (not exists (select 1 from public.daily_event_audience a where a.daily_event_id = event_row.id)
      or exists (select 1 from public.daily_event_audience a
                 where a.daily_event_id = event_row.id and a.user_id = profile.id))
  on conflict (user_id, daily_event_id) do nothing;

  perform public.enqueue_domain_event('doji:global', 'doji.activated', event_row.id,
    jsonb_build_object(
      'dailyEventId', event_row.id, 'challengeId', event_row.challenge_id,
      'activatedAt', activation_time, 'closesAt', close_time,
      'windowMinutes', least(event_row.window_minutes, 10),
      'broadcastPush', true, 'preferenceKey', 'doji_start',
      'title', 'It''s time to Doji!',
      'body', event_row.title || ' — you have 10 minutes.',
      'url', '/(app)/challenge'
    ), 'doji-activated:' || event_row.id::text);

  return jsonb_build_object('daily_event_id', event_row.id,
    'activated_at', activation_time, 'closes_at', close_time, 'already_active', false);
end;
$$;

revoke all on function public.begin_daily_event_prelive(uuid) from public, anon, authenticated;
grant execute on function public.begin_daily_event_prelive(uuid) to service_role;
revoke all on function public.activate_daily_event(uuid) from public, anon, authenticated;
grant execute on function public.activate_daily_event(uuid) to service_role;
