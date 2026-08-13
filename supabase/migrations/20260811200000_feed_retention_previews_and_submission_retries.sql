-- Keep the current feed intact while the next Doji is merely prepared. The
-- legacy INSERT trigger deleted the current feed as soon as a future event was
-- scheduled. Retention now advances only when that future event is activated.
drop trigger if exists daily_event_purge_old_posts on public.daily_events;

create or replace function public.trg_purge_posts_when_event_activates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.posts post
  where post.daily_event_id in (
    select event.id
    from public.daily_events event
    where event.activated_at is not null
      and event.activated_at < new.activated_at
  );

  delete from public.posts post
  using public.user_events participant, public.daily_events event
  where post.user_event_id = participant.id
    and participant.daily_event_id = event.id
    and event.activated_at is not null
    and event.activated_at < new.activated_at;

  return new;
end;
$$;

drop trigger if exists daily_event_purge_posts_on_activation on public.daily_events;
create trigger daily_event_purge_posts_on_activation
  before update of activated_at on public.daily_events
  for each row
  when (old.activated_at is null and new.activated_at is not null)
  execute function public.trg_purge_posts_when_event_activates();

-- Repair the shared poll card for the most recently activated poll if the old
-- scheduling-time purge removed it. Prepared future poll cards are left alone.
insert into public.posts (
  user_event_id, user_id, type, daily_event_id, is_community_poll,
  is_late, visibility, selected_option_index
)
select null, null, 'poll_vote', event.id, true, false, 'public', null
from public.daily_events event
join public.challenges challenge on challenge.id = event.challenge_id
where challenge.type = 'poll'
  and event.id = (
    select latest.id
    from public.daily_events latest
    where latest.activated_at is not null
    order by latest.activated_at desc
    limit 1
  )
  and not exists (
    select 1 from public.posts post
    where post.daily_event_id = event.id and post.is_community_poll is true
  )
on conflict do nothing;

-- Completion is occurrence-specific. Late/buy-in completions unlock the exact
-- same occurrence and must not depend on a fixed timezone's calendar day.
create or replace function public.viewer_completed_today(p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_events participant
    join public.daily_events event on event.id = participant.daily_event_id
    where participant.user_id = p_viewer
      and participant.status in ('completed', 'late')
      and event.id = (
        select current_event.id
        from public.daily_events current_event
        where current_event.activated_at is not null
        order by current_event.activated_at desc
        limit 1
      )
  );
$$;

create or replace function public.author_completed_today(p_author uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_events participant
    join public.daily_events event on event.id = participant.daily_event_id
    where participant.user_id = p_author
      and participant.status in ('completed', 'late')
      and event.id = (
        select current_event.id
        from public.daily_events current_event
        where current_event.activated_at is not null
        order by current_event.activated_at desc
        limit 1
      )
  );
$$;

-- Locked clients receive only safe post shells. Answer text, poll choices,
-- media URLs, reactions, and comments never leave the database until the
-- viewer has completed the same Doji occurrence.
create or replace function public.get_locked_feed_previews(
  p_daily_event_ids uuid[],
  p_audience text default 'friends',
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer_id uuid := auth.uid();
  result jsonb;
begin
  if viewer_id is null then raise exception 'Authentication required'; end if;
  if p_audience not in ('friends', 'everyone') then raise exception 'Invalid feed audience'; end if;
  if coalesce(array_length(p_daily_event_ids, 1), 0) = 0 then return '[]'::jsonb; end if;

  with candidate_shells as (
    select jsonb_build_object(
      'id', post.id,
      'user_event_id', post.user_event_id,
      'user_id', post.user_id,
      'type', post.type,
      'is_community_poll', false,
      'daily_event_id', participant.daily_event_id,
      'caption', null,
      'photo_url', null,
      'front_photo_url', null,
      'video_url', null,
      'is_late', post.is_late,
      'selected_option_index', null,
      'reaction_count', 0,
      'comment_count', 0,
      'comments_disabled', true,
      'is_demo', false,
      'visibility', post.visibility,
      'created_at', post.created_at,
      'profile', jsonb_build_object(
        'id', profile.id,
        'username', profile.username,
        'display_name', profile.display_name,
        'avatar_url', profile.avatar_url,
        'avatar_gradient', profile.avatar_gradient,
        'equipped_border_key', profile.equipped_border_key,
        'equipped_title_key', profile.equipped_title_key
      ),
      'challenge', to_jsonb(challenge),
      'daily_event', to_jsonb(event) || jsonb_build_object('challenge', to_jsonb(challenge))
    ) as shell,
    post.created_at as shell_created_at
    from public.posts post
    join public.user_events participant on participant.id = post.user_event_id
    join public.daily_events event on event.id = participant.daily_event_id
    join public.challenges challenge on challenge.id = event.challenge_id
    join public.profiles profile on profile.id = post.user_id
    where participant.daily_event_id = any(p_daily_event_ids)
      and post.is_community_poll is not true
      and coalesce(post.is_demo, false) is false
      and not exists (
        select 1 from public.friendships blocked
        where blocked.status = 'blocked'
          and ((blocked.requester_id = viewer_id and blocked.addressee_id = post.user_id)
            or (blocked.addressee_id = viewer_id and blocked.requester_id = post.user_id))
      )
      and (
        p_audience = 'everyone'
        or post.user_id = viewer_id
        or exists (
          select 1 from public.friendships friendship
          where friendship.status = 'accepted'
            and ((friendship.requester_id = viewer_id and friendship.addressee_id = post.user_id)
              or (friendship.addressee_id = viewer_id and friendship.requester_id = post.user_id))
        )
      )
    union all
    select jsonb_build_object(
      'id', post.id,
      'user_event_id', null,
      'user_id', null,
      'type', 'poll_vote',
      'is_community_poll', true,
      'daily_event_id', event.id,
      'caption', null,
      'photo_url', null,
      'front_photo_url', null,
      'video_url', null,
      'is_late', false,
      'selected_option_index', null,
      'reaction_count', 0,
      'comment_count', 0,
      'comments_disabled', true,
      'is_demo', false,
      'visibility', 'public',
      'created_at', post.created_at,
      'profile', null,
      'challenge', to_jsonb(challenge),
      'daily_event', to_jsonb(event) || jsonb_build_object('challenge', to_jsonb(challenge))
    ) as shell,
    post.created_at as shell_created_at
    from public.posts post
    join public.daily_events event on event.id = post.daily_event_id
    join public.challenges challenge on challenge.id = event.challenge_id
    where post.daily_event_id = any(p_daily_event_ids)
      and post.is_community_poll is true
      and exists (
        select 1
        from public.poll_votes vote
        join public.user_events participant on participant.id = vote.user_event_id
        where participant.daily_event_id = event.id
          and (
            p_audience = 'everyone'
            or vote.user_id = viewer_id
            or exists (
              select 1 from public.friendships friendship
              where friendship.status = 'accepted'
                and ((friendship.requester_id = viewer_id and friendship.addressee_id = vote.user_id)
                  or (friendship.addressee_id = viewer_id and friendship.requester_id = vote.user_id))
            )
          )
      )
  ), paged_shells as (
    select candidate.shell, candidate.shell_created_at
    from candidate_shells candidate
    order by candidate.shell_created_at desc
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select coalesce(jsonb_agg(shell order by shell_created_at desc), '[]'::jsonb)
  into result
  from paged_shells;

  return result;
end;
$$;

revoke all on function public.get_locked_feed_previews(uuid[], text, integer, integer)
  from public, anon;
grant execute on function public.get_locked_feed_previews(uuid[], text, integer, integer)
  to authenticated;

-- A retry after a committed response may arrive with a new client command ID
-- (for example after an app restart). The occurrence's unique vote/post is the
-- durable idempotency boundary, so return it instead of reporting a false miss.
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

  if event_row.status not in ('pending', 'buy_in_open') then raise exception 'Doji is no longer open'; end if;
  if event_row.activated_at is null or clock_timestamp() < event_row.activated_at then raise exception 'Doji is not live yet'; end if;
  if clock_timestamp() >= coalesce(event_row.closes_at, event_row.expires_at) then raise exception 'Doji has closed'; end if;
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

  if event_row.status not in ('pending', 'buy_in_open') then raise exception 'Doji is no longer open'; end if;
  if event_row.activated_at is null or clock_timestamp() < event_row.activated_at then raise exception 'Doji is not live yet'; end if;
  if clock_timestamp() >= coalesce(event_row.closes_at, event_row.expires_at) then raise exception 'Doji has closed'; end if;

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
