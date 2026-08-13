-- `current_time` is a PostgreSQL reserved expression (timetz). Use an
-- unambiguous variable name so all comparisons stay timestamptz-to-timestamptz.
create or replace function public.get_current_doji_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  server_now_ts timestamptz := clock_timestamp();
  event_row record;
  phase text;
  event_json jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select ue.*, de.fires_at, de.window_minutes, de.activated_at, de.closes_at,
         de.closed_at, de.challenge_id, de.created_at as daily_created_at,
         to_jsonb(ch) as challenge_json
  into event_row
  from public.user_events ue
  join public.daily_events de on de.id = ue.daily_event_id
  join public.challenges ch on ch.id = de.challenge_id
  where ue.user_id = uid
  order by coalesce(de.activated_at, de.fires_at) desc, de.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('server_now', server_now_ts, 'phase', 'none', 'user_event', null);
  end if;

  phase := case
    when event_row.status in ('completed', 'late') then 'completed'
    when event_row.activated_at is null then 'waiting'
    when server_now_ts < event_row.activated_at then 'waiting'
    when server_now_ts >= coalesce(event_row.closes_at, event_row.expires_at) then 'missed'
    else 'live'
  end;

  event_json := to_jsonb(event_row)
    - 'fires_at' - 'window_minutes' - 'activated_at' - 'closes_at'
    - 'closed_at' - 'challenge_id' - 'daily_created_at' - 'challenge_json';
  event_json := event_json || jsonb_build_object(
    'status', case when phase = 'missed' and event_row.status = 'pending' then 'missed' else event_row.status end,
    'daily_event', jsonb_build_object(
      'id', event_row.daily_event_id,
      'challenge_id', event_row.challenge_id,
      'fires_at', event_row.fires_at,
      'window_minutes', event_row.window_minutes,
      'activated_at', event_row.activated_at,
      'closes_at', event_row.closes_at,
      'closed_at', event_row.closed_at,
      'created_at', event_row.daily_created_at,
      'challenge', event_row.challenge_json
    ),
    'challenge', event_row.challenge_json
  );

  return jsonb_build_object(
    'server_now', server_now_ts,
    'phase', phase,
    'opens_at', event_row.activated_at,
    'closes_at', coalesce(event_row.closes_at, event_row.expires_at),
    'user_event', event_json
  );
end;
$$;

revoke all on function public.get_current_doji_state() from public, anon;
grant execute on function public.get_current_doji_state() to authenticated;
