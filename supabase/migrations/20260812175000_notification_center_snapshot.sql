-- One bounded activity-center read. The previous handset implementation first
-- discovered post/friend IDs, then fanned out across every activity table.

create or replace function public.get_notification_center_snapshot(
  p_since timestamptz,
  p_limit integer default 200
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

  with friends as (
    select case when f.requester_id = uid then f.addressee_id else f.requester_id end as user_id
    from public.friendships f
    where f.status = 'accepted' and (f.requester_id = uid or f.addressee_id = uid)
  ), blocked as (
    select case when b.blocker_id = uid then b.blocked_id else b.blocker_id end as user_id
    from public.blocks b
    where b.blocker_id = uid or b.blocked_id = uid
  ), reaction_rows as (
    select r.*, jsonb_build_object(
      'username', actor.username, 'display_name', actor.display_name,
      'avatar_url', actor.avatar_url, 'equipped_border_key', actor.equipped_border_key
    ) actor,
    row_number() over (partition by r.post_id order by r.created_at desc) actor_rank
    from public.reactions r
    join public.posts post on post.id = r.post_id
    join public.profiles actor on actor.id = r.user_id
    where r.user_id <> uid and r.created_at > p_since
      and r.user_id not in (select user_id from blocked)
      and (post.user_id = uid or (coalesce(post.is_community_poll, false) and r.user_id in (select user_id from friends)))
  ), comment_rows as (
    select c.*, post.user_id as post_owner_id, coalesce(post.is_community_poll, false) community,
      parent.user_id as parent_owner_id,
      exists (select 1 from public.comment_mentions mention where mention.comment_id = c.id and mention.mentioned_user_id = uid) mentions_me,
      jsonb_build_object(
        'username', actor.username, 'display_name', actor.display_name,
        'avatar_url', actor.avatar_url, 'equipped_border_key', actor.equipped_border_key
      ) actor
    from public.comments c
    join public.posts post on post.id = c.post_id
    join public.profiles actor on actor.id = c.user_id
    left join public.comments parent on parent.id = c.parent_id
    where c.user_id <> uid and c.created_at > p_since
      and c.user_id not in (select user_id from blocked)
  ), all_items as (
    select jsonb_build_object(
      'key', 'friend_request:' || f.id, 'kind', 'friend_request', 'sortAt', f.created_at,
      'friendship', to_jsonb(f) || jsonb_build_object('requester', jsonb_build_object(
        'id', actor.id, 'username', actor.username, 'display_name', actor.display_name,
        'avatar_url', actor.avatar_url, 'equipped_border_key', actor.equipped_border_key
      ))
    ) item
    from public.friendships f join public.profiles actor on actor.id = f.requester_id
    where f.addressee_id = uid and f.status = 'pending'

    union all
    select jsonb_build_object(
      'key', 'friend_accepted:' || f.id, 'kind', 'friend_accepted', 'sortAt', f.accepted_at,
      'friendship', to_jsonb(f) || jsonb_build_object('addressee', jsonb_build_object(
        'id', actor.id, 'username', actor.username, 'display_name', actor.display_name,
        'avatar_url', actor.avatar_url, 'equipped_border_key', actor.equipped_border_key
      ))
    )
    from public.friendships f join public.profiles actor on actor.id = f.addressee_id
    where f.requester_id = uid and f.status = 'accepted' and f.accepted_at > p_since

    union all
    select jsonb_build_object(
      'key', 'reactions_post:' || r.post_id, 'kind', 'reactions_group', 'post_id', r.post_id,
      'count', count(*)::integer, 'emojis', to_jsonb(array_agg(distinct r.emoji)),
      'actors', jsonb_agg(r.actor order by r.created_at desc) filter (where r.actor_rank <= 8),
      'sortAt', max(r.created_at)
    )
    from reaction_rows r group by r.post_id

    union all
    select jsonb_build_object(
      'key', 'mention:' || c.id, 'kind', 'mention', 'post_id', c.post_id,
      'comment_id', c.id, 'actor', c.actor, 'sortAt', c.created_at
    ) from comment_rows c where c.mentions_me

    union all
    select jsonb_build_object(
      'key', 'comment_reply:' || c.id, 'kind', 'comment_reply', 'post_id', c.post_id,
      'comment_id', c.id, 'actor', c.actor, 'sortAt', c.created_at
    ) from comment_rows c where not c.mentions_me and c.parent_owner_id = uid

    union all
    select jsonb_build_object(
      'key', 'comment:' || c.id, 'kind', 'comment', 'post_id', c.post_id,
      'comment_id', c.id, 'actor', c.actor, 'sortAt', c.created_at
    ) from comment_rows c
    where not c.mentions_me and c.parent_owner_id is distinct from uid
      and (c.post_owner_id = uid or (c.community and c.user_id in (select user_id from friends)))

    union all
    select jsonb_build_object(
      'key', 'comment_like:' || likes.id, 'kind', 'comment_like', 'post_id', comment.post_id,
      'comment_id', comment.id, 'actor', jsonb_build_object(
        'username', actor.username, 'display_name', actor.display_name,
        'avatar_url', actor.avatar_url, 'equipped_border_key', actor.equipped_border_key
      ), 'sortAt', likes.created_at
    )
    from public.comment_likes likes
    join public.comments comment on comment.id = likes.comment_id
    join public.profiles actor on actor.id = likes.user_id
    where comment.user_id = uid and likes.user_id <> uid and likes.created_at > p_since
      and likes.user_id not in (select user_id from blocked)

    union all
    select jsonb_build_object(
      'key', 'challenge:' || event.id, 'kind', 'challenge', 'sortAt', daily.fires_at,
      'userEvent', to_jsonb(event) || jsonb_build_object(
        'daily_event', to_jsonb(daily) || jsonb_build_object('challenge', to_jsonb(challenge)),
        'challenge', to_jsonb(challenge)
      )
    )
    from public.user_events event
    join public.daily_events daily on daily.id = event.daily_event_id
    join public.challenges challenge on challenge.id = daily.challenge_id
    where event.user_id = uid and event.status = 'pending' and event.expires_at > now()
      and daily.fires_at > p_since

    union all
    select jsonb_build_object(
      'key', 'badge_earned:' || progress.category_id || ':' || progress.current_tier,
      'kind', 'badge_earned', 'categoryId', progress.category_id,
      'categoryName', category.name, 'categoryEmoji', category.emoji,
      'tier', progress.current_tier, 'sortAt', progress.unlocked_at
    )
    from public.user_badge_progress progress
    join public.badge_categories category on category.id = progress.category_id
    where progress.user_id = uid and progress.unlocked_at > p_since

    union all
    select jsonb_build_object(
      'key', 'suggestion_result:' || suggestion.id, 'kind', 'suggestion_result',
      'suggestionId', suggestion.id, 'body', suggestion.body, 'status', suggestion.status,
      'sortAt', suggestion.reviewed_at
    )
    from public.challenge_suggestions suggestion
    where suggestion.user_id = uid and suggestion.status in ('approved', 'rejected')
      and suggestion.reviewed_at > p_since

    union all
    select jsonb_build_object(
      'key', 'poll_vote:' || vote.id, 'kind', 'poll_vote', 'actor', jsonb_build_object(
        'username', actor.username, 'display_name', actor.display_name,
        'avatar_url', actor.avatar_url, 'equipped_border_key', actor.equipped_border_key
      ), 'sortAt', vote.created_at
    )
    from public.poll_votes vote join public.profiles actor on actor.id = vote.user_id
    where vote.user_id in (select user_id from friends) and vote.created_at > p_since
      and vote.user_id not in (select user_id from blocked)
  )
  select coalesce(jsonb_agg(item order by
    case when item->>'kind' = 'friend_request' then 0 else 1 end,
    (item->>'sortAt')::timestamptz desc
  ), '[]'::jsonb)
  into result
  from (
    select item from all_items
    order by case when item->>'kind' = 'friend_request' then 0 else 1 end,
             (item->>'sortAt')::timestamptz desc
    limit least(greatest(p_limit, 1), 250)
  ) bounded;

  return result;
end;
$$;

revoke all on function public.get_notification_center_snapshot(timestamptz, integer) from public, anon;
grant execute on function public.get_notification_center_snapshot(timestamptz, integer) to authenticated;

create index if not exists reactions_created_post_user_idx on public.reactions (created_at desc, post_id, user_id);
create index if not exists comments_created_post_user_idx on public.comments (created_at desc, post_id, user_id);
create index if not exists comment_likes_created_comment_user_idx on public.comment_likes (created_at desc, comment_id, user_id);
create index if not exists friendships_requester_status_accepted_idx on public.friendships (requester_id, status, accepted_at desc);
create index if not exists friendships_addressee_status_created_idx on public.friendships (addressee_id, status, created_at desc);
create index if not exists poll_votes_user_created_idx on public.poll_votes (user_id, created_at desc);
create index if not exists suggestion_user_reviewed_idx on public.challenge_suggestions (user_id, reviewed_at desc) where status in ('approved', 'rejected');
create index if not exists badge_progress_user_unlocked_idx on public.user_badge_progress (user_id, unlocked_at desc);
