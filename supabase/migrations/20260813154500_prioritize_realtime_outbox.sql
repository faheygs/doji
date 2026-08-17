-- Realtime invalidations must never sit behind slower OS push delivery.
-- Preserve the database claim order explicitly and durably record Ably
-- publication before the relay begins optional push side effects.

drop index if exists public.domain_event_outbox_delivery_priority_idx;
create index domain_event_outbox_delivery_priority_idx
  on public.domain_event_outbox (
    (case
      when event_type = 'doji.activated' then 0
      when coalesce((payload ->> 'sendPush')::boolean, false) is false
        and coalesce((payload ->> 'broadcastPush')::boolean, false) is false then 1
      else 2
    end),
    available_at,
    created_at
  )
  where published_at is null;

create or replace function public.claim_domain_events(p_batch_size integer default 100)
returns table (
  id uuid,
  topic text,
  event_type text,
  aggregate_id uuid,
  payload jsonb,
  attempts integer,
  lease_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_lease uuid := gen_random_uuid();
begin
  if p_batch_size < 1 or p_batch_size > 500 then
    raise exception 'batch size must be between 1 and 500';
  end if;

  return query
  with claimable as (
    select event.id
    from public.domain_event_outbox event
    where event.published_at is null
      and event.available_at <= clock_timestamp()
      and (event.leased_at is null
        or event.leased_at < clock_timestamp() - interval '2 minutes')
    order by case
        when event.event_type = 'doji.activated' then 0
        when coalesce((event.payload ->> 'sendPush')::boolean, false) is false
          and coalesce((event.payload ->> 'broadcastPush')::boolean, false) is false then 1
        else 2
      end,
      event.available_at, event.created_at, event.id
    for update skip locked
    limit p_batch_size
  ), claimed as (
    update public.domain_event_outbox event
    set lease_id = next_lease,
        leased_at = clock_timestamp(),
        attempts = event.attempts + 1,
        last_error = null
    from claimable
    where event.id = claimable.id
    returning event.id, event.topic, event.event_type, event.aggregate_id,
              event.payload, event.attempts, event.lease_id,
              case
                when event.event_type = 'doji.activated' then 0
                when coalesce((event.payload ->> 'sendPush')::boolean, false) is false
                  and coalesce((event.payload ->> 'broadcastPush')::boolean, false) is false then 1
                else 2
              end as delivery_priority,
              event.available_at, event.created_at
  )
  select claimed.id, claimed.topic, claimed.event_type, claimed.aggregate_id,
         claimed.payload, claimed.attempts, claimed.lease_id
  from claimed
  order by claimed.delivery_priority, claimed.available_at, claimed.created_at, claimed.id;
end;
$$;

create or replace function public.mark_domain_events_realtime_published(
  p_events jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  with requested as (
    select (item ->> 'id')::uuid as id,
           (item ->> 'leaseId')::uuid as lease_id
    from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) item
  )
  update public.domain_event_outbox event
  set payload = jsonb_set(event.payload, '{realtimePublished}', 'true'::jsonb, true)
  from requested
  where event.id = requested.id
    and event.lease_id = requested.lease_id
    and event.published_at is null;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.claim_domain_events(integer)
  from public, anon, authenticated;
revoke all on function public.mark_domain_events_realtime_published(jsonb)
  from public, anon, authenticated;
grant execute on function public.claim_domain_events(integer) to service_role;
grant execute on function public.mark_domain_events_realtime_published(jsonb)
  to service_role;
