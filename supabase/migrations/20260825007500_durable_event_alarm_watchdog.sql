-- Durable Object alarms are the authoritative one-shot challenge scheduler.
-- Cloudflare retries failed alarms, but a finite retry budget must not be able
-- to strand a prepared or active event. The existing one-minute operational
-- health check re-registers the same idempotent phase; it never creates a new
-- event and does not make correctness depend on handset or push scheduling.

create or replace function public.get_repairable_doji_alarms(p_limit integer default 20)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as (
    select event.id,
      event.fires_at,
      event.prelive_at,
      event.activated_at,
      event.closes_at,
      exists (
        select 1 from public.daily_event_audience audience
        where audience.daily_event_id = event.id
      ) as targeted
    from public.daily_events event
    where event.closed_at is null
      and (
        (event.activated_at is null
          and event.fires_at >= clock_timestamp() - interval '1 day')
        or (event.activated_at is not null
          and event.closes_at >= clock_timestamp() - interval '1 day')
      )
    order by coalesce(event.closes_at, event.fires_at), event.id
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'dailyEventId', id,
    'firesAt', fires_at,
    'phase', case
      when activated_at is not null then 'close'
      when prelive_at is not null then 'activate'
      else 'prelive'
    end,
    'closesAt', closes_at,
    'chainNext', not targeted,
    'closeAction', case when targeted then 'close_targeted' else 'close' end
  ) order by coalesce(closes_at, fires_at), id), '[]'::jsonb)
  from candidates;
$$;

revoke all on function public.get_repairable_doji_alarms(integer)
  from public, anon, authenticated;
grant execute on function public.get_repairable_doji_alarms(integer)
  to service_role;

comment on function public.get_repairable_doji_alarms(integer) is
  'Bounded service-only snapshots used to idempotently repair prepared and active Durable Object alarms.';
