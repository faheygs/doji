-- Persist one bounded operational summary for each completed production Doji.
-- The service monitor refreshes a recent event while delivery settles and freezes
-- it after thirty minutes; mobile correctness never depends on this telemetry.

create table if not exists public.admin_daily_event_health_snapshots (
  daily_event_id uuid primary key references public.daily_events(id) on delete cascade,
  observed_from timestamptz not null,
  observed_through timestamptz not null,
  captured_at timestamptz not null default clock_timestamp(),
  finalized_at timestamptz,
  healthy boolean not null,
  realtime_sample_count integer not null default 0 check (realtime_sample_count >= 0),
  realtime_p95_ms integer not null default 0 check (realtime_p95_ms >= 0),
  realtime_max_ms integer not null default 0 check (realtime_max_ms >= 0),
  realtime_over_5s integer not null default 0 check (realtime_over_5s >= 0),
  outbox_total integer not null default 0 check (outbox_total >= 0),
  outbox_unpublished integer not null default 0 check (outbox_unpublished >= 0),
  outbox_exhausted integer not null default 0 check (outbox_exhausted >= 0),
  push_shards_total integer not null default 0 check (push_shards_total >= 0),
  push_shards_completed integer not null default 0 check (push_shards_completed >= 0),
  push_shards_expired integer not null default 0 check (push_shards_expired >= 0),
  push_shards_exhausted integer not null default 0 check (push_shards_exhausted >= 0),
  participant_count integer not null default 0 check (participant_count >= 0),
  post_count integer not null default 0 check (post_count >= 0)
);

create index if not exists admin_daily_event_health_captured_idx
  on public.admin_daily_event_health_snapshots (observed_through desc, daily_event_id desc);

alter table public.admin_daily_event_health_snapshots enable row level security;
revoke all on table public.admin_daily_event_health_snapshots
  from public, anon, authenticated;

create or replace function public.refresh_daily_event_health_snapshots_v1(
  p_limit integer default 5
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  bounded_limit integer := least(greatest(coalesce(p_limit, 5), 1), 20);
  event_row record;
  refreshed integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  for event_row in
    select
      event.id,
      event.activated_at,
      event.closes_at,
      event.activated_at - interval '5 minutes' as observed_from,
      event.closes_at + interval '5 minutes' as observed_through
    from public.daily_events event
    left join public.admin_daily_event_health_snapshots snapshot
      on snapshot.daily_event_id = event.id
    where event.activated_at is not null
      and event.closes_at is not null
      and event.closes_at <= clock_timestamp() - interval '2 minutes'
      and event.closes_at >= clock_timestamp() - interval '30 days'
      and snapshot.finalized_at is null
    order by event.closes_at desc, event.id desc
    limit bounded_limit
  loop
    insert into public.admin_daily_event_health_snapshots (
      daily_event_id,
      observed_from,
      observed_through,
      captured_at,
      finalized_at,
      healthy,
      realtime_sample_count,
      realtime_p95_ms,
      realtime_max_ms,
      realtime_over_5s,
      outbox_total,
      outbox_unpublished,
      outbox_exhausted,
      push_shards_total,
      push_shards_completed,
      push_shards_expired,
      push_shards_exhausted,
      participant_count,
      post_count
    )
    with event_outbox as (
      select event.*
      from public.domain_event_outbox event
      where event.created_at between event_row.observed_from and event_row.observed_through
        and (
          event.aggregate_id = event_row.id
          or event.payload ->> 'dailyEventId' = event_row.id::text
        )
    ), realtime as (
      select
        count(*) filter (where event.realtime_published_at is not null)::integer as sample_count,
        coalesce(percentile_cont(0.95) within group (
          order by extract(epoch from event.realtime_published_at
            - greatest(event.created_at, event.available_at)) * 1000
        ) filter (where event.realtime_published_at is not null), 0)::integer as p95_ms,
        coalesce(max(extract(epoch from event.realtime_published_at
          - greatest(event.created_at, event.available_at)) * 1000)
          filter (where event.realtime_published_at is not null), 0)::integer as max_ms,
        count(*) filter (
          where event.realtime_published_at
            - greatest(event.created_at, event.available_at) > interval '5 seconds'
        )::integer as slow,
        count(*)::integer as total,
        count(*) filter (where event.published_at is null)::integer as unpublished,
        count(*) filter (where event.published_at is null and event.attempts >= 10)::integer as exhausted
      from event_outbox event
    ), push as (
      select
        count(*)::integer as total,
        count(*) filter (where shard.status = 'completed')::integer as completed,
        count(*) filter (where shard.status = 'expired')::integer as expired,
        count(*) filter (
          where shard.status in ('pending', 'processing') and shard.attempts >= 8
        )::integer as exhausted
      from public.push_fanout_shards shard
      where shard.daily_event_id = event_row.id
    ), participation as (
      select count(*)::integer as participants
      from public.user_events participant
      where participant.daily_event_id = event_row.id
    ), content as (
      select count(*)::integer as posts
      from public.posts post
      where post.daily_event_id = event_row.id
    )
    select
      event_row.id,
      event_row.observed_from,
      event_row.observed_through,
      clock_timestamp(),
      case when clock_timestamp() >= event_row.closes_at + interval '30 minutes'
        then clock_timestamp() else null end,
      realtime.unpublished = 0
        and realtime.exhausted = 0
        and (realtime.sample_count < 20 or realtime.p95_ms <= 5000)
        and realtime.max_ms <= 30000
        and push.exhausted = 0,
      realtime.sample_count,
      realtime.p95_ms,
      realtime.max_ms,
      realtime.slow,
      realtime.total,
      realtime.unpublished,
      realtime.exhausted,
      push.total,
      push.completed,
      push.expired,
      push.exhausted,
      participation.participants,
      content.posts
    from realtime cross join push cross join participation cross join content
    on conflict (daily_event_id) do update set
      observed_from = excluded.observed_from,
      observed_through = excluded.observed_through,
      captured_at = excluded.captured_at,
      finalized_at = excluded.finalized_at,
      healthy = excluded.healthy,
      realtime_sample_count = excluded.realtime_sample_count,
      realtime_p95_ms = excluded.realtime_p95_ms,
      realtime_max_ms = excluded.realtime_max_ms,
      realtime_over_5s = excluded.realtime_over_5s,
      outbox_total = excluded.outbox_total,
      outbox_unpublished = excluded.outbox_unpublished,
      outbox_exhausted = excluded.outbox_exhausted,
      push_shards_total = excluded.push_shards_total,
      push_shards_completed = excluded.push_shards_completed,
      push_shards_expired = excluded.push_shards_expired,
      push_shards_exhausted = excluded.push_shards_exhausted,
      participant_count = excluded.participant_count,
      post_count = excluded.post_count
    where public.admin_daily_event_health_snapshots.finalized_at is null;

    refreshed := refreshed + 1;
  end loop;

  return refreshed;
end;
$$;

revoke all on function public.refresh_daily_event_health_snapshots_v1(integer)
  from public, anon, authenticated;
grant execute on function public.refresh_daily_event_health_snapshots_v1(integer)
  to service_role;

create or replace function public.get_admin_event_health_history_v1(
  p_limit integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  bounded_limit integer := least(greatest(coalesce(p_limit, 12), 1), 30);
begin
  if coalesce((select auth.jwt() ->> 'aal'), '') <> 'aal2' then
    raise exception 'Administrator MFA required';
  end if;
  if not public.admin_user_has_permission('operations.read') then
    raise exception 'Administrator access required';
  end if;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'daily_event_id', snapshot.daily_event_id,
        'title', challenge.title,
        'fires_at', event.fires_at,
        'activated_at', event.activated_at,
        'closes_at', event.closes_at,
        'observed_from', snapshot.observed_from,
        'observed_through', snapshot.observed_through,
        'captured_at', snapshot.captured_at,
        'finalized_at', snapshot.finalized_at,
        'healthy', snapshot.healthy,
        'realtime_sample_count', snapshot.realtime_sample_count,
        'realtime_p95_ms', snapshot.realtime_p95_ms,
        'realtime_max_ms', snapshot.realtime_max_ms,
        'realtime_over_5s', snapshot.realtime_over_5s,
        'outbox_total', snapshot.outbox_total,
        'outbox_unpublished', snapshot.outbox_unpublished,
        'outbox_exhausted', snapshot.outbox_exhausted,
        'push_shards_total', snapshot.push_shards_total,
        'push_shards_completed', snapshot.push_shards_completed,
        'push_shards_expired', snapshot.push_shards_expired,
        'push_shards_exhausted', snapshot.push_shards_exhausted,
        'participant_count', snapshot.participant_count,
        'post_count', snapshot.post_count
      ) order by event.closes_at desc, event.id desc)
      from (
        select stored.*
        from public.admin_daily_event_health_snapshots stored
        join public.daily_events stored_event on stored_event.id = stored.daily_event_id
        order by stored_event.closes_at desc, stored.daily_event_id desc
        limit bounded_limit
      ) snapshot
      join public.daily_events event on event.id = snapshot.daily_event_id
      join public.challenges challenge on challenge.id = event.challenge_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_admin_event_health_history_v1(integer)
  from public, anon;
grant execute on function public.get_admin_event_health_history_v1(integer)
  to authenticated;

comment on table public.admin_daily_event_health_snapshots is
  'Service-owned, event-scoped operational summaries retained for post-Doji review.';
comment on function public.refresh_daily_event_health_snapshots_v1(integer) is
  'Refreshes recent completed Doji telemetry and freezes it thirty minutes after close.';
comment on function public.get_admin_event_health_history_v1(integer) is
  'Returns bounded event health history to AAL2 operations readers.';
