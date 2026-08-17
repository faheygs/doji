-- Return immutable event timing to the relay. This lets push delivery reject
-- stale retries while preserving every outbox row for an auditable drain.

create or replace function public.claim_domain_events_v2(p_batch_size integer default 100)
returns table (
  id uuid,
  topic text,
  event_type text,
  aggregate_id uuid,
  payload jsonb,
  attempts integer,
  lease_id uuid,
  created_at timestamptz,
  available_at timestamptz
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
              event.created_at, event.available_at,
              case
                when event.event_type = 'doji.activated' then 0
                when coalesce((event.payload ->> 'sendPush')::boolean, false) is false
                  and coalesce((event.payload ->> 'broadcastPush')::boolean, false) is false then 1
                else 2
              end as delivery_priority
  )
  select claimed.id, claimed.topic, claimed.event_type, claimed.aggregate_id,
         claimed.payload, claimed.attempts, claimed.lease_id,
         claimed.created_at, claimed.available_at
  from claimed
  order by claimed.delivery_priority, claimed.available_at, claimed.created_at, claimed.id;
end;
$$;

revoke all on function public.claim_domain_events_v2(integer)
  from public, anon, authenticated;
grant execute on function public.claim_domain_events_v2(integer) to service_role;
