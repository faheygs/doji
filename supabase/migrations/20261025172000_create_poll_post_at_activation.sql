-- Scheduling-time poll cards can be retired by an intervening activation.
-- Restore the current poll's required card after retention, in the same commit.
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

  insert into public.posts (
    user_event_id, user_id, type, daily_event_id, is_community_poll,
    is_late, visibility, selected_option_index
  )
  select null, null, 'poll_vote', event_row.id, true, false, 'public', null
  from public.challenges challenge
  where challenge.id = event_row.challenge_id and challenge.type = 'poll'
  on conflict (daily_event_id)
    where is_community_poll = true and daily_event_id is not null
    do nothing;

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
