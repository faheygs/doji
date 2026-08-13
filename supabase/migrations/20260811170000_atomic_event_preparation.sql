-- Preparing the next Doji is one serialized transaction. User fan-out remains in
-- activate_daily_event so no account can participate before the durable alarm fires.
create or replace function public.prepare_next_daily_event(
  p_proposed_fires_at timestamptz,
  p_window_minutes integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.daily_events%rowtype;
  challenge_row public.challenges%rowtype;
  already_prepared boolean := false;
begin
  if p_proposed_fires_at <= clock_timestamp() then
    raise exception 'Proposed fire time must be in the future';
  end if;
  if p_window_minutes < 1 or p_window_minutes > 10 then
    raise exception 'Window must be between 1 and 10 minutes';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('doji:prepare-next', 0));

  select * into event_row
  from public.daily_events
  where closed_at is null
    and (fires_at > clock_timestamp() or closes_at > clock_timestamp())
  order by fires_at asc
  limit 1
  for update;

  if found then
    already_prepared := true;
  else
    select challenge.* into challenge_row
    from public.challenges challenge
    where challenge.is_active = true
      and challenge.id not in (
        select recent.challenge_id
        from public.daily_events recent
        order by recent.created_at desc
        limit 10
      )
    order by challenge.schedule_count asc, random()
    limit 1
    for update;

    if not found then
      select challenge.* into challenge_row
      from public.challenges challenge
      where challenge.is_active = true
      order by challenge.schedule_count asc, random()
      limit 1
      for update;
    end if;
    if not found then raise exception 'No active challenges in database'; end if;

    insert into public.daily_events (challenge_id, fires_at, window_minutes)
    values (challenge_row.id, p_proposed_fires_at, p_window_minutes)
    returning * into event_row;

    update public.challenges
    set schedule_count = coalesce(schedule_count, 0) + 1
    where id = challenge_row.id;
  end if;

  return jsonb_build_object(
    'daily_event_id', event_row.id,
    'challenge_id', event_row.challenge_id,
    'fires_at', event_row.fires_at,
    'already_prepared', already_prepared
  );
end;
$$;

revoke all on function public.prepare_next_daily_event(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.prepare_next_daily_event(timestamptz, integer)
  to service_role;
