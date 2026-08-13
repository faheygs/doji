-- One round trip for the community poll card. Options, scoped votes, and safe
-- voter presentation fields are read from the same Postgres snapshot so the
-- client cannot render partial/contradictory results while realtime is busy.

create or replace function public.get_poll_snapshot_for_feed(
  p_daily_event_id uuid,
  p_audience text default 'friends'
)
returns table (
  option_id uuid,
  challenge_id uuid,
  option_text text,
  option_position integer,
  option_is_other boolean,
  option_created_at timestamptz,
  vote_id uuid,
  user_id uuid,
  custom_text text,
  vote_created_at timestamptz,
  username text,
  display_name text,
  avatar_url text,
  equipped_border_key text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_audience not in ('friends', 'everyone') then raise exception 'Invalid audience'; end if;
  if not public.can_access_daily_event(p_daily_event_id, uid) then return; end if;

  return query
  with event_context as (
    select event.challenge_id
    from public.daily_events event
    where event.id = p_daily_event_id
  ),
  visible_votes as (
    select vote.id,
           vote.option_id,
           vote.user_id,
           vote.custom_text,
           vote.created_at
    from public.poll_votes vote
    join public.user_events participant on participant.id = vote.user_event_id
    where participant.daily_event_id = p_daily_event_id
      and (
        p_audience = 'everyone'
        or vote.user_id = uid
        or exists (
          select 1
          from public.friendships friendship
          where friendship.status = 'accepted'
            and (
              (friendship.requester_id = uid and friendship.addressee_id = vote.user_id)
              or (friendship.addressee_id = uid and friendship.requester_id = vote.user_id)
            )
        )
      )
  )
  select option.id,
         option.challenge_id,
         option.text,
         option.position,
         option.is_other,
         option.created_at,
         vote.id,
         vote.user_id,
         vote.custom_text,
         vote.created_at,
         profile.username,
         profile.display_name,
         profile.avatar_url,
         profile.equipped_border_key
  from event_context event
  join public.poll_options option on option.challenge_id = event.challenge_id
  left join visible_votes vote on vote.option_id = option.id
  left join public.profiles profile on profile.id = vote.user_id
  order by option.position, vote.created_at;
end;
$$;

revoke all on function public.get_poll_snapshot_for_feed(uuid, text) from public, anon;
grant execute on function public.get_poll_snapshot_for_feed(uuid, text) to authenticated;

create index if not exists poll_votes_user_event_option_created_idx
  on public.poll_votes (user_event_id, option_id, created_at);

-- A complete feed page (post, safe profile, challenge, scoped counts, and the
-- viewer's reaction) in one read. This replaces the client's former fan-out of
-- friends, posts, community poll, reactions, and comments requests.
create or replace function public.get_feed_page_snapshot(
  p_daily_event_id uuid,
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
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_audience not in ('friends', 'everyone') then raise exception 'Invalid audience'; end if;
  if not public.can_access_daily_event(p_daily_event_id, uid) then return '[]'::jsonb; end if;

  with friend_ids as (
    select uid as user_id
    union
    select case
      when friendship.requester_id = uid then friendship.addressee_id
      else friendship.requester_id
    end
    from public.friendships friendship
    where friendship.status = 'accepted'
      and (friendship.requester_id = uid or friendship.addressee_id = uid)
  ),
  blocked_ids as (
    select block.blocked_id as user_id
    from public.blocks block
    where block.blocker_id = uid
    union
    select block.blocker_id
    from public.blocks block
    where block.blocked_id = uid
  ),
  candidate_posts as (
    select post.id as post_id,
           post.created_at as post_created_at,
           to_jsonb(post) - 'idempotency_key' as post_json,
           jsonb_build_object(
             'id', profile.id,
             'username', profile.username,
             'display_name', profile.display_name,
             'avatar_url', profile.avatar_url,
             'avatar_gradient', profile.avatar_gradient,
             'equipped_border_key', profile.equipped_border_key,
             'equipped_title_key', profile.equipped_title_key
           ) as profile_json,
           to_jsonb(challenge) as challenge_json,
           to_jsonb(event) || jsonb_build_object('challenge', to_jsonb(challenge)) as event_json
    from public.posts post
    join public.user_events participant on participant.id = post.user_event_id
    join public.daily_events event on event.id = participant.daily_event_id
    join public.challenges challenge on challenge.id = event.challenge_id
    join public.profiles profile on profile.id = post.user_id
    where participant.daily_event_id = p_daily_event_id
      and post.is_community_poll is not true
      and coalesce(post.is_demo, false) is false
      and post.user_id not in (select blocked.user_id from blocked_ids blocked)
      and (p_audience = 'everyone' or post.user_id in (select friend.user_id from friend_ids friend))

    union all

    select post.id,
           post.created_at,
           to_jsonb(post) - 'idempotency_key',
           null::jsonb,
           to_jsonb(challenge),
           to_jsonb(event) || jsonb_build_object('challenge', to_jsonb(challenge))
    from public.posts post
    join public.daily_events event on event.id = post.daily_event_id
    join public.challenges challenge on challenge.id = event.challenge_id
    where post.daily_event_id = p_daily_event_id
      and post.is_community_poll is true
      and exists (
        select 1
        from public.poll_votes vote
        join public.user_events participant on participant.id = vote.user_event_id
        where participant.daily_event_id = p_daily_event_id
          and (p_audience = 'everyone' or vote.user_id in (select friend.user_id from friend_ids friend))
      )
  ),
  paged as (
    select *
    from candidate_posts
    order by post_created_at desc
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    offset greatest(coalesce(p_offset, 0), 0)
  ),
  visible_reactions as (
    select reaction.post_id, reaction.user_id, reaction.emoji
    from public.reactions reaction
    where reaction.post_id in (select page.post_id from paged page)
      and reaction.user_id not in (select blocked.user_id from blocked_ids blocked)
      and (p_audience = 'everyone' or reaction.user_id in (select friend.user_id from friend_ids friend))
  ),
  reaction_counts as (
    select reaction.post_id, reaction.emoji, count(*)::integer as count
    from visible_reactions reaction
    group by reaction.post_id, reaction.emoji
  ),
  reaction_summary as (
    select counts.post_id,
           sum(counts.count)::integer as total,
           jsonb_object_agg(counts.emoji, counts.count) as breakdown
    from reaction_counts counts
    group by counts.post_id
  ),
  my_reactions as (
    select reaction.post_id, jsonb_agg(reaction.emoji) as emojis
    from visible_reactions reaction
    where reaction.user_id = uid
    group by reaction.post_id
  ),
  comment_summary as (
    select comment.post_id, count(*)::integer as total
    from public.comments comment
    where comment.post_id in (select page.post_id from paged page)
      and comment.user_id not in (select blocked.user_id from blocked_ids blocked)
      and (p_audience = 'everyone' or comment.user_id in (select friend.user_id from friend_ids friend))
    group by comment.post_id
  ),
  hydrated as (
    select page.post_json || jsonb_build_object(
      'profile', page.profile_json,
      'challenge', page.challenge_json,
      'daily_event', page.event_json,
      'reaction_count', coalesce(reactions.total, 0),
      'reaction_breakdown', coalesce(reactions.breakdown, '{}'::jsonb),
      'my_reactions', coalesce(mine.emojis, '[]'::jsonb),
      'comment_count', coalesce(comments.total, 0)
    ) as post,
    page.post_created_at
    from paged page
    left join reaction_summary reactions on reactions.post_id = page.post_id
    left join my_reactions mine on mine.post_id = page.post_id
    left join comment_summary comments on comments.post_id = page.post_id
  )
  select coalesce(jsonb_agg(post order by post_created_at desc), '[]'::jsonb)
  into result
  from hydrated;

  return result;
end;
$$;

revoke all on function public.get_feed_page_snapshot(uuid, text, integer, integer)
  from public, anon;
grant execute on function public.get_feed_page_snapshot(uuid, text, integer, integer)
  to authenticated;

create index if not exists reactions_post_user_emoji_idx
  on public.reactions (post_id, user_id, emoji);
create index if not exists comments_post_user_created_idx
  on public.comments (post_id, user_id, created_at);
