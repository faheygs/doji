-- A relay can begin just before a coalesced event becomes available and finish
-- just after it becomes due. The previous next-wake query considered only
-- future rows, so that boundary event was skipped until another timer happened
-- to wake the relay. Return "now" whenever any claimable work is already due.

create or replace function public.next_domain_event_available_at()
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  with next_event as (
    select min(event.available_at) as next_at
    from public.domain_event_outbox event
    where event.published_at is null
      and (
        event.leased_at is null
        or event.leased_at < clock_timestamp() - interval '2 minutes'
      )
  )
  select case
    when next_event.next_at is null then null
    else greatest(clock_timestamp(), next_event.next_at)
  end
  from next_event;
$$;

revoke all on function public.next_domain_event_available_at()
  from public, anon, authenticated;
grant execute on function public.next_domain_event_available_at() to service_role;

comment on function public.next_domain_event_available_at() is
  'Returns an immediate wake for due claimable outbox work, otherwise the earliest future availability.';
