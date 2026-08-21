-- Targeted engagement reconciliation must preserve the feed audience contract.
-- Everyone uses fixed counter shards; Friends scans only the bounded friend graph.

create or replace function public.get_post_engagement_snapshot_v2(
  p_post_id uuid,
  p_audience text default 'everyone'
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
  if uid is null then raise exception 'Authentication required'; end if;
  if p_audience not in ('friends', 'everyone') then raise exception 'Invalid audience'; end if;
  if not public.can_view_full_post(p_post_id, uid) then
    raise exception 'Post is not available';
  end if;

  with friend_ids as (
    select uid user_id
    union
    select case when friendship.requester_id = uid
      then friendship.addressee_id else friendship.requester_id end
    from public.friendships friendship
    where friendship.status = 'accepted'
      and (friendship.requester_id = uid or friendship.addressee_id = uid)
  ), blocked_ids as (
    select block.blocked_id user_id
    from public.blocks block where block.blocker_id = uid
    union
    select block.blocker_id
    from public.blocks block where block.blocked_id = uid
  ), raw_reaction_counts as (
    select shard.emoji, sum(shard.reaction_count)::integer count
    from public.post_reaction_count_shards shard
    where p_audience = 'everyone' and shard.post_id = p_post_id
    group by shard.emoji
    union all
    select reaction.emoji, count(*)::integer
    from public.reactions reaction
    where p_audience = 'friends' and reaction.post_id = p_post_id
      and reaction.user_id in (select friend.user_id from friend_ids friend)
      and reaction.user_id not in (select blocked.user_id from blocked_ids blocked)
    group by reaction.emoji
  ), blocked_reactions as (
    select reaction.emoji, count(*)::integer count
    from public.reactions reaction
    where p_audience = 'everyone' and reaction.post_id = p_post_id
      and reaction.user_id in (select blocked.user_id from blocked_ids blocked)
    group by reaction.emoji
  ), reaction_counts as (
    select raw.emoji,
      greatest(raw.count - coalesce(blocked.count, 0), 0)::integer count
    from raw_reaction_counts raw
    left join blocked_reactions blocked on blocked.emoji = raw.emoji
  ), reaction_summary as (
    select coalesce(sum(counts.count), 0)::integer total,
      coalesce(
        jsonb_object_agg(counts.emoji, counts.count) filter (where counts.count > 0),
        '{}'::jsonb
      ) breakdown
    from reaction_counts counts
  ), raw_comments as (
    select coalesce(sum(shard.comment_count), 0)::integer total
    from public.post_engagement_shards shard
    where p_audience = 'everyone' and shard.post_id = p_post_id
    union all
    select count(*)::integer
    from public.comments comment
    where p_audience = 'friends' and comment.post_id = p_post_id
      and comment.user_id in (select friend.user_id from friend_ids friend)
      and comment.user_id not in (select blocked.user_id from blocked_ids blocked)
  ), comment_summary as (
    select coalesce(sum(raw.total), 0)::integer total from raw_comments raw
  ), blocked_comments as (
    select count(*)::integer total
    from public.comments comment
    where p_audience = 'everyone' and comment.post_id = p_post_id
      and comment.user_id in (select blocked.user_id from blocked_ids blocked)
  ), my_reactions as (
    select coalesce(jsonb_agg(reaction.emoji order by reaction.created_at), '[]'::jsonb) emojis
    from public.reactions reaction
    where reaction.post_id = p_post_id and reaction.user_id = uid
  )
  select jsonb_build_object(
    'post_id', post.id,
    'reaction_count', reactions.total,
    'comment_count', greatest(comments.total - blocked.total, 0),
    'reaction_breakdown', reactions.breakdown,
    'my_reactions', mine.emojis
  )
  into result
  from public.posts post
  cross join reaction_summary reactions
  cross join comment_summary comments
  cross join blocked_comments blocked
  cross join my_reactions mine
  where post.id = p_post_id;

  return result;
end;
$$;

revoke all on function public.get_post_engagement_snapshot_v2(uuid, text)
  from public, anon;
grant execute on function public.get_post_engagement_snapshot_v2(uuid, text)
  to authenticated;

comment on function public.get_post_engagement_snapshot_v2(uuid, text) is
  'Authorized audience-scoped engagement snapshot: fixed shards for Everyone and bounded exact friend rows for Friends.';
