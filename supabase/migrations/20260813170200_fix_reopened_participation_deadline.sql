-- Paid buy-ins and signup-day grace extend one participant beyond the shared
-- 10-minute close. Reads and writes must use the same server-authorized deadline.

create or replace function public.close_daily_event(p_daily_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.daily_events
  set closed_at = coalesce(closed_at, clock_timestamp())
  where id = p_daily_event_id
    and activated_at is not null
    and clock_timestamp() >= closes_at;
  if not found then return 0; end if;

  update public.user_events
  set status = 'missed'
  where daily_event_id = p_daily_event_id
    and status = 'pending'
    and not (
      signup_day_grace is true
      and expires_at > clock_timestamp()
    );
  get diagnostics changed = row_count;

  perform public.enqueue_domain_event(
    'doji:global', 'doji.closed', p_daily_event_id,
    jsonb_build_object('dailyEventId', p_daily_event_id, 'closedAt', clock_timestamp()),
    'doji-closed:' || p_daily_event_id::text
  );
  return changed;
end;
$$;

revoke all on function public.close_daily_event(uuid) from public, anon, authenticated;
grant execute on function public.close_daily_event(uuid) to service_role;

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
  participant_deadline timestamptz;
  phase text;
  event_json jsonb;
  challenge_json jsonb;
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

  participant_deadline := case
    when event_row.status = 'buy_in_open' or event_row.signup_day_grace is true
      then event_row.expires_at
    else coalesce(event_row.closes_at, event_row.expires_at)
  end;

  challenge_json := event_row.challenge_json;
  if challenge_json->>'type' = 'poll' then
    challenge_json := challenge_json || jsonb_build_object(
      'poll_options', coalesce((
        select jsonb_agg(to_jsonb(option_row) order by option_row.position)
        from public.poll_options option_row
        where option_row.challenge_id = event_row.challenge_id
      ), '[]'::jsonb)
    );
  end if;

  phase := case
    when event_row.status in ('completed', 'late') then 'completed'
    when event_row.activated_at is null then 'waiting'
    when server_now_ts < event_row.activated_at then 'waiting'
    when server_now_ts >= participant_deadline then 'missed'
    else 'live'
  end;

  event_json := to_jsonb(event_row)
    - 'fires_at' - 'window_minutes' - 'activated_at' - 'closes_at'
    - 'closed_at' - 'challenge_id' - 'daily_created_at' - 'challenge_json';
  event_json := event_json || jsonb_build_object(
    'status', case
      when phase = 'missed' and event_row.status = 'pending' then 'missed'
      else event_row.status
    end,
    'daily_event', jsonb_build_object(
      'id', event_row.daily_event_id,
      'challenge_id', event_row.challenge_id,
      'fires_at', event_row.fires_at,
      'window_minutes', event_row.window_minutes,
      'activated_at', event_row.activated_at,
      'closes_at', event_row.closes_at,
      'closed_at', event_row.closed_at,
      'created_at', event_row.daily_created_at,
      'challenge', challenge_json
    ),
    'challenge', challenge_json
  );

  return jsonb_build_object(
    'server_now', server_now_ts,
    'phase', phase,
    'opens_at', event_row.activated_at,
    'closes_at', participant_deadline,
    'user_event', event_json
  );
end;
$$;

revoke all on function public.get_current_doji_state() from public, anon;
grant execute on function public.get_current_doji_state() to authenticated;

create or replace function public.submit_poll_vote(
  p_user_event_id uuid,
  p_option_id uuid,
  p_custom_text text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  event_row record;
  participant_deadline timestamptz;
  vote_row record;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;

  select participant.*, event.challenge_id, event.activated_at, event.closes_at
  into event_row
  from public.user_events participant
  join public.daily_events event on event.id = participant.daily_event_id
  where participant.id = p_user_event_id and participant.user_id = uid
  for update of participant;
  if not found then raise exception 'Doji not found'; end if;

  select * into vote_row
  from public.poll_votes vote
  where vote.user_event_id = p_user_event_id or vote.idempotency_key = p_idempotency_key
  order by (vote.user_event_id = p_user_event_id) desc
  limit 1;
  if found then return to_jsonb(vote_row); end if;

  participant_deadline := case
    when event_row.status = 'buy_in_open' or event_row.signup_day_grace is true
      then event_row.expires_at
    else coalesce(event_row.closes_at, event_row.expires_at)
  end;

  if event_row.status not in ('pending', 'buy_in_open') then raise exception 'Doji is no longer open'; end if;
  if event_row.activated_at is null or clock_timestamp() < event_row.activated_at then raise exception 'Doji is not live yet'; end if;
  if clock_timestamp() >= participant_deadline then raise exception 'Doji has closed'; end if;
  if not exists (
    select 1 from public.poll_options option
    where option.id = p_option_id and option.challenge_id = event_row.challenge_id
  ) then raise exception 'Invalid poll option'; end if;

  insert into public.poll_votes (
    user_id, challenge_id, option_id, custom_text, user_event_id, idempotency_key
  ) values (
    uid, event_row.challenge_id, p_option_id, nullif(trim(p_custom_text), ''),
    p_user_event_id, p_idempotency_key
  ) returning * into vote_row;

  update public.user_events
  set status = case when event_row.status = 'buy_in_open' then 'late' else 'completed' end,
      completed_at = clock_timestamp()
  where id = p_user_event_id;

  perform public.enqueue_domain_event(
    'doji:global', 'poll.vote.created', vote_row.id,
    jsonb_build_object(
      'voteId', vote_row.id,
      'dailyEventId', event_row.daily_event_id,
      'challengeId', event_row.challenge_id,
      'optionId', p_option_id,
      'userId', uid
    ),
    'poll-vote:' || vote_row.id::text
  );
  return to_jsonb(vote_row);
end;
$$;

revoke all on function public.submit_poll_vote(uuid, uuid, text, text) from public, anon;
grant execute on function public.submit_poll_vote(uuid, uuid, text, text) to authenticated;

create or replace function public.complete_doji_with_post(
  p_user_event_id uuid,
  p_post_type text,
  p_caption text,
  p_photo_url text,
  p_front_photo_url text,
  p_video_url text,
  p_visibility text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  event_row record;
  participant_deadline timestamptz;
  post_row record;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;

  select participant.*, event.activated_at, event.closes_at
  into event_row
  from public.user_events participant
  join public.daily_events event on event.id = participant.daily_event_id
  where participant.id = p_user_event_id and participant.user_id = uid
  for update of participant;
  if not found then raise exception 'Doji not found'; end if;

  select * into post_row
  from public.posts post
  where post.user_event_id = p_user_event_id or post.idempotency_key = p_idempotency_key
  order by (post.user_event_id = p_user_event_id) desc
  limit 1;
  if found then return to_jsonb(post_row); end if;

  participant_deadline := case
    when event_row.status = 'buy_in_open' or event_row.signup_day_grace is true
      then event_row.expires_at
    else coalesce(event_row.closes_at, event_row.expires_at)
  end;

  if event_row.status not in ('pending', 'buy_in_open') then raise exception 'Doji is no longer open'; end if;
  if event_row.activated_at is null or clock_timestamp() < event_row.activated_at then raise exception 'Doji is not live yet'; end if;
  if clock_timestamp() >= participant_deadline then raise exception 'Doji has closed'; end if;

  insert into public.posts (
    user_event_id, user_id, type, caption, photo_url, front_photo_url,
    video_url, is_late, visibility, idempotency_key
  ) values (
    p_user_event_id, uid, p_post_type, nullif(trim(p_caption), ''), p_photo_url,
    p_front_photo_url, p_video_url, event_row.status = 'buy_in_open',
    p_visibility, p_idempotency_key
  ) returning * into post_row;

  update public.user_events
  set status = case when event_row.status = 'buy_in_open' then 'late' else 'completed' end,
      completed_at = clock_timestamp()
  where id = p_user_event_id;

  return to_jsonb(post_row);
end;
$$;

revoke all on function public.complete_doji_with_post(uuid, text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.complete_doji_with_post(uuid, text, text, text, text, text, text, text)
  to authenticated;
