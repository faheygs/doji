-- Preserve the free signup-day exception. For every other participant, a paid
-- buy-in reopens the newest missed occurrence without another time deadline.

create or replace function public.buy_in_today()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  participant public.user_events%rowtype;
  balance integer;
  buy_in_cost constant integer := 400;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select occurrence.* into participant
  from public.user_events occurrence
  join public.daily_events event on event.id = occurrence.daily_event_id
  where occurrence.user_id = uid
    and occurrence.daily_event_id = (
      select latest.daily_event_id
      from public.user_events latest
      join public.daily_events latest_event on latest_event.id = latest.daily_event_id
      where latest.user_id = uid
      order by coalesce(latest_event.activated_at, latest_event.fires_at) desc,
               latest_event.created_at desc
      limit 1
    )
    and occurrence.buy_in_at is null
    and occurrence.signup_day_grace is not true
    and (
      occurrence.status = 'missed'
      or (
        occurrence.status = 'pending'
        and clock_timestamp() >= coalesce(event.closes_at, occurrence.expires_at)
      )
    )
  for update of occurrence;

  if not found then raise exception 'no_buy_in_available'; end if;

  if participant.status = 'pending' then
    update public.user_events set status = 'missed' where id = participant.id;
  end if;

  balance := public.spend_sparks(uid, buy_in_cost, 'buy_in', participant.id::text);

  if participant.streak_before_miss is not null then
    update public.profiles
    set current_streak = greatest(current_streak, participant.streak_before_miss)
    where id = uid;
  end if;

  update public.user_events
  set status = 'buy_in_open',
      buy_in_at = clock_timestamp()
  where id = participant.id;

  return jsonb_build_object(
    'user_event_id', participant.id,
    'sparks', balance,
    'expires_at', null
  );
end;
$$;

revoke all on function public.buy_in_today() from public, anon;
grant execute on function public.buy_in_today() to authenticated;

-- Repair only the current occurrence when an earlier paid buy-in was incorrectly
-- changed back to missed by its former end-of-day deadline.
update public.user_events occurrence
set status = 'buy_in_open'
where occurrence.status = 'missed'
  and occurrence.buy_in_at is not null
  and occurrence.completed_at is null
  and occurrence.daily_event_id = (
    select event.id
    from public.daily_events event
    where event.activated_at is not null
    order by event.activated_at desc, event.created_at desc
    limit 1
  )
  and not exists (
    select 1 from public.posts post where post.user_event_id = occurrence.id
  )
  and not exists (
    select 1 from public.poll_votes vote where vote.user_event_id = occurrence.id
  );

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

  select occurrence.*, event.fires_at, event.window_minutes,
         event.activated_at, event.closes_at, event.closed_at,
         event.challenge_id, event.created_at as daily_created_at,
         to_jsonb(challenge) as challenge_json
  into event_row
  from public.user_events occurrence
  join public.daily_events event on event.id = occurrence.daily_event_id
  join public.challenges challenge on challenge.id = event.challenge_id
  where occurrence.user_id = uid
  order by coalesce(event.activated_at, event.fires_at) desc,
           event.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'server_now', server_now_ts, 'phase', 'none', 'user_event', null
    );
  end if;

  participant_deadline := case
    when event_row.signup_day_grace is true then event_row.expires_at
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
    when event_row.status = 'buy_in_open' then 'live'
    when event_row.status = 'missed' then 'missed'
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
    'closes_at', case when event_row.status = 'buy_in_open' then null else participant_deadline end,
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
  option_row record;
  community_post_id uuid;
  normalized_custom_text text := nullif(trim(p_custom_text), '');
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;

  select participant.*, event.challenge_id, event.activated_at, event.closes_at,
         challenge.type as challenge_type, challenge.poll_kind
  into event_row
  from public.user_events participant
  join public.daily_events event on event.id = participant.daily_event_id
  join public.challenges challenge on challenge.id = event.challenge_id
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
    when event_row.signup_day_grace is true then event_row.expires_at
    else coalesce(event_row.closes_at, event_row.expires_at)
  end;

  if event_row.status not in ('pending', 'buy_in_open') then raise exception 'Doji is no longer open'; end if;
  if event_row.activated_at is null or clock_timestamp() < event_row.activated_at then raise exception 'Doji is not live yet'; end if;
  if event_row.status = 'pending' and clock_timestamp() >= participant_deadline then
    raise exception 'Doji has closed';
  end if;
  if event_row.challenge_type <> 'poll' then raise exception 'This is not a poll challenge'; end if;
  select option.id, option.is_other into option_row
  from public.poll_options option
  where option.id = p_option_id and option.challenge_id = event_row.challenge_id;
  if not found then raise exception 'Invalid poll option'; end if;
  if coalesce(option_row.is_other, false) then
    if event_row.poll_kind = 'wyr' then raise exception 'Would You Rather has no Other option'; end if;
    if normalized_custom_text is null then raise exception 'Enter your answer for Other'; end if;
    if length(normalized_custom_text) > 200 then raise exception 'Poll answer is too long'; end if;
  else
    normalized_custom_text := null;
  end if;

  insert into public.poll_votes (
    user_id, challenge_id, option_id, custom_text, user_event_id, idempotency_key
  ) values (
    uid, event_row.challenge_id, p_option_id, normalized_custom_text,
    p_user_event_id, p_idempotency_key
  ) returning * into vote_row;

  update public.user_events
  set status = case when event_row.status = 'buy_in_open' then 'late' else 'completed' end,
      completed_at = clock_timestamp()
  where id = p_user_event_id;

  select post.id into community_post_id
  from public.posts post
  where post.daily_event_id = event_row.daily_event_id
    and post.is_community_poll = true
  limit 1;
  if community_post_id is null then raise exception 'Community poll post not found'; end if;

  perform public.enqueue_domain_event(
    'post:' || community_post_id::text, 'poll.vote.created', vote_row.id,
    jsonb_build_object(
      'voteId', vote_row.id,
      'postId', community_post_id,
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
    when event_row.signup_day_grace is true then event_row.expires_at
    else coalesce(event_row.closes_at, event_row.expires_at)
  end;

  if event_row.status not in ('pending', 'buy_in_open') then raise exception 'Doji is no longer open'; end if;
  if event_row.activated_at is null or clock_timestamp() < event_row.activated_at then raise exception 'Doji is not live yet'; end if;
  if event_row.status = 'pending' and clock_timestamp() >= participant_deadline then
    raise exception 'Doji has closed';
  end if;

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
