-- Idempotency keys are scoped to the authenticated command owner.  A retry may
-- return only the caller's own completion; a key collision must never disclose
-- another user's post or vote.

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
  if coalesce(length(p_idempotency_key), 0) < 16 then
    raise exception 'Invalid idempotency key';
  end if;

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
  where vote.user_id = uid
    and (vote.user_event_id = p_user_event_id
      or vote.idempotency_key = p_idempotency_key)
  order by (vote.user_event_id = p_user_event_id) desc
  limit 1;
  if found then return to_jsonb(vote_row); end if;

  participant_deadline := case
    when event_row.signup_day_grace is true then event_row.expires_at
    else coalesce(event_row.closes_at, event_row.expires_at)
  end;

  if event_row.status not in ('pending', 'buy_in_open') then
    raise exception 'Doji is no longer open';
  end if;
  if event_row.activated_at is null or clock_timestamp() < event_row.activated_at then
    raise exception 'Doji is not live yet';
  end if;
  if event_row.status = 'pending' and clock_timestamp() >= participant_deadline then
    raise exception 'Doji has closed';
  end if;
  if event_row.challenge_type <> 'poll' then
    raise exception 'This is not a poll challenge';
  end if;

  select option.id, option.is_other into option_row
  from public.poll_options option
  where option.id = p_option_id and option.challenge_id = event_row.challenge_id;
  if not found then raise exception 'Invalid poll option'; end if;

  if coalesce(option_row.is_other, false) then
    if event_row.poll_kind = 'wyr' then
      raise exception 'Would You Rather has no Other option';
    end if;
    if normalized_custom_text is null then
      raise exception 'Enter your answer for Other';
    end if;
    if length(normalized_custom_text) > 200 then
      raise exception 'Poll answer is too long';
    end if;
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
  where id = p_user_event_id and user_id = uid;

  select post.id into community_post_id
  from public.posts post
  where post.daily_event_id = event_row.daily_event_id
    and post.is_community_poll = true
  limit 1;
  if community_post_id is null then
    raise exception 'Community poll post not found';
  end if;

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
  if coalesce(length(p_idempotency_key), 0) < 16 then
    raise exception 'Invalid idempotency key';
  end if;

  select participant.*, event.activated_at, event.closes_at,
         challenge.type as challenge_type,
         challenge.requires_photo, challenge.requires_video, challenge.requires_text
  into event_row
  from public.user_events participant
  join public.daily_events event on event.id = participant.daily_event_id
  join public.challenges challenge on challenge.id = event.challenge_id
  where participant.id = p_user_event_id and participant.user_id = uid
  for update of participant;
  if not found then raise exception 'Doji not found'; end if;

  select * into post_row
  from public.posts post
  where post.user_id = uid
    and (post.user_event_id = p_user_event_id
      or post.idempotency_key = p_idempotency_key)
  order by (post.user_event_id = p_user_event_id) desc
  limit 1;
  if found then return to_jsonb(post_row); end if;

  if exists (
    select 1 from (values
      ('photo'::text, p_photo_url),
      ('front'::text, p_front_photo_url),
      ('video'::text, p_video_url)
    ) supplied(slot, media_url)
    where supplied.media_url is not null
      and not exists (
        select 1
        from public.media_upload_intents intent
        where intent.user_id = uid
          and intent.user_event_id = p_user_event_id
          and intent.idempotency_key = p_idempotency_key
          and intent.slot = supplied.slot
          and supplied.media_url like
            '%/storage/v1/object/public/' || intent.bucket_id || '/' || intent.object_path || '%'
      )
  ) then
    raise exception 'Invalid media upload';
  end if;

  if event_row.challenge_type = 'poll' then
    raise exception 'Poll challenges must use the poll vote command';
  end if;
  if p_post_type not in ('photo', 'task_complete') then
    raise exception 'Invalid post type';
  end if;
  if (event_row.challenge_type = 'photo' and p_post_type <> 'photo')
     or (event_row.challenge_type in ('task', 'format') and p_post_type <> 'task_complete') then
    raise exception 'Post type does not match this challenge';
  end if;
  if coalesce(event_row.requires_photo, false) and p_photo_url is null then
    raise exception 'A photo is required';
  end if;
  if coalesce(event_row.requires_video, false) and p_video_url is null then
    raise exception 'A video is required';
  end if;
  if coalesce(event_row.requires_text, false) and nullif(trim(p_caption), '') is null then
    raise exception 'A response is required';
  end if;
  if length(coalesce(p_caption, '')) > 1000 then
    raise exception 'Response is too long';
  end if;
  if p_visibility not in ('friends', 'public') then
    raise exception 'Invalid post visibility';
  end if;

  participant_deadline := case
    when event_row.signup_day_grace is true then event_row.expires_at
    else coalesce(event_row.closes_at, event_row.expires_at)
  end;
  if event_row.status not in ('pending', 'buy_in_open') then
    raise exception 'Doji is no longer open';
  end if;
  if event_row.activated_at is null or clock_timestamp() < event_row.activated_at then
    raise exception 'Doji is not live yet';
  end if;
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
  where id = p_user_event_id and user_id = uid;

  update public.media_upload_intents
  set committed_at = clock_timestamp()
  where user_id = uid
    and user_event_id = p_user_event_id
    and idempotency_key = p_idempotency_key;

  return to_jsonb(post_row);
end;
$$;

revoke all on function public.complete_doji_with_post(uuid, text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.complete_doji_with_post(uuid, text, text, text, text, text, text, text)
  to authenticated;
