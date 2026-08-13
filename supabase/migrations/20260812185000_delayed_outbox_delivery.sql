-- Durable one-shot delivery for short notification aggregation windows.
-- Business state remains immediate; only low-urgency OS alerts may be delayed.

alter table public.domain_event_outbox
  add column if not exists available_at timestamptz not null default clock_timestamp();

drop index if exists public.domain_event_outbox_pending_idx;
create index domain_event_outbox_pending_idx
  on public.domain_event_outbox (available_at, created_at)
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
    order by event.available_at, event.created_at
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
              event.payload, event.attempts, event.lease_id
  )
  select * from claimed;
end;
$$;

create or replace function public.next_domain_event_available_at()
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  select min(event.available_at)
  from public.domain_event_outbox event
  where event.published_at is null
    and event.available_at > clock_timestamp();
$$;

revoke all on function public.claim_domain_events(integer)
  from public, anon, authenticated;
revoke all on function public.next_domain_event_available_at()
  from public, anon, authenticated;
grant execute on function public.claim_domain_events(integer) to service_role;
grant execute on function public.next_domain_event_available_at() to service_role;
