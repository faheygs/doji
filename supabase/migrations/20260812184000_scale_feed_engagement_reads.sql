-- Feed hydration reads 128 counter shards for global engagement and exact rows
-- only for the viewer's bounded friend graph.

update public.posts post set daily_event_id = participant.daily_event_id
from public.user_events participant
where participant.id = post.user_event_id and post.daily_event_id is null;

create or replace function public.set_post_daily_event_id()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.daily_event_id is null and new.user_event_id is not null then
    select participant.daily_event_id into new.daily_event_id
    from public.user_events participant where participant.id = new.user_event_id;
  end if;
  return new;
end;
$$;

drop trigger if exists set_post_daily_event_id on public.posts;
create trigger set_post_daily_event_id before insert or update of user_event_id on public.posts
for each row execute function public.set_post_daily_event_id();

create index if not exists posts_event_created_id_idx
  on public.posts (daily_event_id, created_at desc, id desc)
  where coalesce(is_demo, false) = false;

create or replace function public.get_feed_page_snapshot_v2(
  p_daily_event_id uuid,
  p_audience text default 'friends',
  p_limit integer default 20,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); result jsonb;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_audience not in ('friends', 'everyone') then raise exception 'Invalid audience'; end if;
  if not public.can_access_daily_event(p_daily_event_id, uid) then return '[]'::jsonb; end if;

  with friend_ids as (
    select uid user_id union
    select case when f.requester_id = uid then f.addressee_id else f.requester_id end
    from public.friendships f where f.status = 'accepted'
      and (f.requester_id = uid or f.addressee_id = uid)
  ), blocked_ids as (
    select b.blocked_id user_id from public.blocks b where b.blocker_id = uid union
    select b.blocker_id from public.blocks b where b.blocked_id = uid
  ), normal_posts as (
    select post.id post_id, post.created_at post_created_at,
      to_jsonb(post) - 'idempotency_key' post_json,
      jsonb_build_object('id', profile.id, 'username', profile.username,
        'display_name', profile.display_name, 'avatar_url', profile.avatar_url,
        'avatar_gradient', profile.avatar_gradient,
        'equipped_border_key', profile.equipped_border_key,
        'equipped_title_key', profile.equipped_title_key) profile_json,
      to_jsonb(challenge) challenge_json,
      to_jsonb(event) || jsonb_build_object('challenge', to_jsonb(challenge)) event_json
    from public.posts post
    join public.daily_events event on event.id = post.daily_event_id
    join public.challenges challenge on challenge.id = event.challenge_id
    join public.profiles profile on profile.id = post.user_id
    where post.daily_event_id = p_daily_event_id
      and post.is_community_poll is not true and coalesce(post.is_demo, false) is false
      and post.user_id not in (select blocked.user_id from blocked_ids blocked)
      and (p_audience = 'everyone' or post.user_id in (select friend.user_id from friend_ids friend))
      and (p_before_created_at is null or (post.created_at, post.id) < (p_before_created_at, p_before_id))
    order by post.created_at desc, post.id desc
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  ), community_posts as (
    select post.id, post.created_at, to_jsonb(post) - 'idempotency_key', null::jsonb,
      to_jsonb(challenge),
      to_jsonb(event) || jsonb_build_object('challenge', to_jsonb(challenge))
    from public.posts post join public.daily_events event on event.id = post.daily_event_id
    join public.challenges challenge on challenge.id = event.challenge_id
    where post.daily_event_id = p_daily_event_id and post.is_community_poll is true
      and (p_before_created_at is null or (post.created_at, post.id) < (p_before_created_at, p_before_id))
      and ((p_audience = 'everyone' and exists (
        select 1 from public.poll_vote_count_shards shard
        where shard.daily_event_id = p_daily_event_id and shard.vote_count > 0
      )) or (p_audience = 'friends' and exists (
        select 1 from public.poll_votes vote
        where vote.daily_event_id = p_daily_event_id
          and vote.user_id in (select friend.user_id from friend_ids friend)
      ))) order by post.created_at desc, post.id desc limit 1
  ), candidates as (
    select * from normal_posts union all select * from community_posts
  ), paged as (
    select * from candidates order by post_created_at desc, post_id desc
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  ), raw_reaction_counts as (
    select shard.post_id, shard.emoji, sum(shard.reaction_count)::integer count
    from public.post_reaction_count_shards shard
    where p_audience = 'everyone' and shard.post_id in (select page.post_id from paged page)
    group by shard.post_id, shard.emoji
    union all
    select reaction.post_id, reaction.emoji, count(*)::integer
    from public.reactions reaction
    where p_audience = 'friends' and reaction.post_id in (select page.post_id from paged page)
      and reaction.user_id in (select friend.user_id from friend_ids friend)
      and reaction.user_id not in (select blocked.user_id from blocked_ids blocked)
    group by reaction.post_id, reaction.emoji
  ), blocked_reactions as (
    select reaction.post_id, reaction.emoji, count(*)::integer count
    from public.reactions reaction
    where p_audience = 'everyone' and reaction.post_id in (select page.post_id from paged page)
      and reaction.user_id in (select blocked.user_id from blocked_ids blocked)
    group by reaction.post_id, reaction.emoji
  ), reaction_counts as (
    select raw.post_id, raw.emoji,
      greatest(raw.count - coalesce(blocked.count, 0), 0)::integer count
    from raw_reaction_counts raw left join blocked_reactions blocked
      on blocked.post_id = raw.post_id and blocked.emoji = raw.emoji
  ), reaction_summary as (
    select counts.post_id, sum(counts.count)::integer total,
      jsonb_object_agg(counts.emoji, counts.count) breakdown
    from reaction_counts counts group by counts.post_id
  ), my_reactions as (
    select reaction.post_id, jsonb_agg(reaction.emoji) emojis
    from public.reactions reaction where reaction.user_id = uid
      and reaction.post_id in (select page.post_id from paged page)
    group by reaction.post_id
  ), raw_comments as (
    select shard.post_id, sum(shard.comment_count)::integer total
    from public.post_engagement_shards shard
    where p_audience = 'everyone' and shard.post_id in (select page.post_id from paged page)
    group by shard.post_id
    union all
    select comment.post_id, count(*)::integer
    from public.comments comment where p_audience = 'friends'
      and comment.post_id in (select page.post_id from paged page)
      and comment.user_id in (select friend.user_id from friend_ids friend)
      and comment.user_id not in (select blocked.user_id from blocked_ids blocked)
    group by comment.post_id
  ), blocked_comments as (
    select comment.post_id, count(*)::integer total from public.comments comment
    where p_audience = 'everyone' and comment.post_id in (select page.post_id from paged page)
      and comment.user_id in (select blocked.user_id from blocked_ids blocked)
    group by comment.post_id
  ), hydrated as (
    select page.post_json || jsonb_build_object(
      'profile', page.profile_json, 'challenge', page.challenge_json,
      'daily_event', page.event_json, 'reaction_count', coalesce(reactions.total, 0),
      'reaction_breakdown', coalesce(reactions.breakdown, '{}'::jsonb),
      'my_reactions', coalesce(mine.emojis, '[]'::jsonb),
      'comment_count', greatest(coalesce(comments.total, 0) - coalesce(blocked.total, 0), 0)
    ) post, page.post_created_at
    from paged page left join reaction_summary reactions on reactions.post_id = page.post_id
    left join my_reactions mine on mine.post_id = page.post_id
    left join raw_comments comments on comments.post_id = page.post_id
    left join blocked_comments blocked on blocked.post_id = page.post_id
  )
  select coalesce(jsonb_agg(post order by post_created_at desc), '[]'::jsonb)
  into result from hydrated;
  return result;
end;
$$;

revoke all on function public.get_feed_page_snapshot_v2(uuid, text, integer, timestamptz, uuid)
  from public, anon;
grant execute on function public.get_feed_page_snapshot_v2(uuid, text, integer, timestamptz, uuid)
  to authenticated;
