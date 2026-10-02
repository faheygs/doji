-- Approved database-only repair. Apply indexes first; no grants, policies, commands or triggers change.
-- Production indexes must be built CONCURRENTLY outside this transaction (see runbook).
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$
begin
  if md5(pg_get_functiondef('public.sync_comment_mentions(uuid,text,uuid)'::regprocedure))
       <> '6f25f84770f02b015a940d83ae2b7436'
    or md5(pg_get_functiondef('public.get_notification_center_snapshot_without_post_context(timestamptz,integer)'::regprocedure))
       <> '056e238bcc2f1e3f8663bfca0c1de4ae' then
    raise exception 'Query baseline changed; review before applying';
  end if;
  if not exists(select 1 from pg_index where indexrelid=to_regclass('public.comments_author_created_idx') and indisvalid and indisready)
    or not exists(select 1 from pg_index where indexrelid=to_regclass('public.reactions_author_created_idx') and indisvalid and indisready) then
    raise exception 'Build and verify recipient indexes before replacing queries';
  end if;
  if pg_get_indexdef('public.comments_author_created_idx'::regclass)
       <> 'CREATE INDEX comments_author_created_idx ON public.comments USING btree (user_id, created_at DESC)'
    or pg_get_indexdef('public.reactions_author_created_idx'::regclass)
       <> 'CREATE INDEX reactions_author_created_idx ON public.reactions USING btree (user_id, created_at DESC)' then
    raise exception 'Recipient index definition mismatch';
  end if;
end; $$;

create or replace function public.sync_comment_mentions(
  p_comment_id uuid, p_body text, p_actor_id uuid
)
returns void language plpgsql security definer set search_path = ''
as $$
declare names text[]; eligible_ids uuid[] := '{}'::uuid[]; candidate_ids uuid[];
begin
  if not exists (select 1 from public.comments c
    where c.id = p_comment_id and c.user_id = p_actor_id) then
    raise exception 'Comment not found';
  end if;

  select array_agg(distinct lower(m[1])) into names
  from regexp_matches(p_body, '@([A-Za-z0-9_]{2,30})', 'g') as m;
  if cardinality(names) > 0 then
    -- Mentions can only name self or accepted friends. Resolve that bounded graph
    -- before checking names, using profile primary keys instead of a global scan.
    select array_agg(id) into candidate_ids from (
      select p_actor_id id
      union
      select case when f.requester_id = p_actor_id then f.addressee_id else f.requester_id end
      from public.friendships f where f.status = 'accepted'
        and (f.requester_id = p_actor_id or f.addressee_id = p_actor_id)
    ) candidates;
    select coalesce(array_agg(p.id), '{}'::uuid[]) into eligible_ids
    from public.profiles p where p.id = any(candidate_ids) and lower(p.username) = any(names);
  end if;

  -- Empty text must still remove old mentions on edit. Retain unchanged rows so
  -- their original creation/notification identity is not recreated.
  delete from public.comment_mentions m where m.comment_id = p_comment_id
    and not (m.mentioned_user_id = any(eligible_ids));
  insert into public.comment_mentions(comment_id, mentioned_user_id)
  select p_comment_id, id from unnest(eligible_ids) id
  on conflict(comment_id, mentioned_user_id) do nothing;
end;
$$;

create or replace function public.get_notification_center_snapshot_without_post_context(
  p_since timestamptz, p_limit integer default 200
)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := auth.uid(); result jsonb;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  with friends as materialized (
    select case when f.requester_id = uid then f.addressee_id else f.requester_id end user_id,
      f.accepted_at
    from public.friendships f where f.status = 'accepted' and f.accepted_at is not null
      and (f.requester_id = uid or f.addressee_id = uid)
  ), blocked as materialized (
    select case when b.blocker_id = uid then b.blocked_id else b.blocker_id end user_id
    from public.blocks b where b.blocker_id = uid or b.blocked_id = uid
  ), own_posts as materialized (
    select p.id from public.posts p where p.user_id = uid
  ), reaction_ids as materialized (
    select r.id from own_posts p join public.reactions r on r.post_id = p.id
    where r.created_at > p_since
    union
    select r.id from friends f join public.reactions r on r.user_id = f.user_id
      and r.created_at >= f.accepted_at and r.created_at > p_since
    join public.posts p on p.id = r.post_id where coalesce(p.is_community_poll, false)
  ), reaction_rows as (
    select r.*, jsonb_build_object(
      'username', actor.username, 'display_name', actor.display_name,
      'avatar_url', actor.avatar_url, 'equipped_border_key', actor.equipped_border_key
    ) actor, row_number() over (partition by r.post_id order by r.created_at desc) actor_rank
    from reaction_ids candidate join public.reactions r on r.id = candidate.id
    join public.profiles actor on actor.id = r.user_id
    where r.user_id <> uid and r.user_id not in (select user_id from blocked)
  ), participant_rows as (
    select event.daily_event_id, event.completed_at,
      jsonb_build_object('username', actor.username, 'display_name', actor.display_name,
        'avatar_url', actor.avatar_url, 'equipped_border_key', actor.equipped_border_key) actor,
      row_number() over (partition by event.daily_event_id order by event.completed_at desc) actor_rank
    from public.user_events event join friends friend on friend.user_id = event.user_id
      and event.completed_at >= friend.accepted_at
    join public.profiles actor on actor.id = event.user_id
    where event.user_id not in (select user_id from blocked)
      and event.status in ('completed', 'late') and event.completed_at > p_since
  ), comment_ids as materialized (
    -- UNION deduplicates overlapping audiences BEFORE hydrating profiles or JSON.
    select c.id from own_posts p join public.comments c on c.post_id = p.id
      where c.created_at > p_since
    union
    select c.id from public.comment_mentions m join public.comments c on c.id = m.comment_id
      where m.mentioned_user_id = uid and c.created_at > p_since
    union
    select c.id from public.comments parent join public.comments c on c.parent_id = parent.id
      where parent.user_id = uid and c.created_at > p_since
    union
    select c.id from friends f join public.comments c on c.user_id = f.user_id
      and c.created_at >= f.accepted_at and c.created_at > p_since
    join public.posts p on p.id = c.post_id where coalesce(p.is_community_poll, false)
  ), comment_rows as (
    select c.*, post.user_id post_owner_id, coalesce(post.is_community_poll, false) community,
      parent.user_id parent_owner_id,
      exists (select 1 from public.comment_mentions m
        where m.comment_id = c.id and m.mentioned_user_id = uid) mentions_me,
      exists (select 1 from friends friend
        where friend.user_id = c.user_id and c.created_at >= friend.accepted_at) friendship_existed,
      jsonb_build_object('username', actor.username, 'display_name', actor.display_name,
        'avatar_url', actor.avatar_url, 'equipped_border_key', actor.equipped_border_key) actor
    from comment_ids candidate join public.comments c on c.id = candidate.id
    join public.posts post on post.id = c.post_id
    join public.profiles actor on actor.id = c.user_id
    left join public.comments parent on parent.id = c.parent_id
    where c.user_id <> uid and c.user_id not in (select user_id from blocked)
  ), all_items as (
    select jsonb_build_object(
      'key', 'friend_request:' || f.id, 'kind', 'friend_request', 'sortAt', f.created_at,
      'friendship', to_jsonb(f) || jsonb_build_object('requester', jsonb_build_object(
        'id', actor.id, 'username', actor.username, 'display_name', actor.display_name,
        'avatar_url', actor.avatar_url, 'equipped_border_key', actor.equipped_border_key))) item
    from public.friendships f join public.profiles actor on actor.id = f.requester_id
    where f.addressee_id = uid and f.status = 'pending'
    union all
    select jsonb_build_object(
      'key', 'friend_accepted:' || f.id, 'kind', 'friend_accepted', 'sortAt', f.accepted_at,
      'friendship', to_jsonb(f) || jsonb_build_object('addressee', jsonb_build_object(
        'id', actor.id, 'username', actor.username, 'display_name', actor.display_name,
        'avatar_url', actor.avatar_url, 'equipped_border_key', actor.equipped_border_key)))
    from public.friendships f join public.profiles actor on actor.id = f.addressee_id
    where f.requester_id = uid and f.status = 'accepted' and f.accepted_at > p_since
    union all
    select jsonb_build_object(
      'key', 'friend_activity:' || p.daily_event_id, 'kind', 'friend_activity_group',
      'daily_event_id', p.daily_event_id, 'count', count(*)::integer,
      'actors', jsonb_agg(p.actor order by p.completed_at desc) filter (where p.actor_rank <= 8),
      'sortAt', max(p.completed_at)) from participant_rows p group by p.daily_event_id
    union all
    select jsonb_build_object(
      'key', 'reactions_post:' || r.post_id, 'kind', 'reactions_group', 'post_id', r.post_id,
      'count', count(*)::integer, 'emojis', to_jsonb(array_agg(distinct r.emoji)),
      'actors', jsonb_agg(r.actor order by r.created_at desc) filter (where r.actor_rank <= 8),
      'sortAt', max(r.created_at)) from reaction_rows r group by r.post_id
    union all
    select jsonb_build_object('key', 'mention:' || c.id, 'kind', 'mention',
      'post_id', c.post_id, 'comment_id', c.id, 'actor', c.actor, 'sortAt', c.created_at)
    from comment_rows c where c.mentions_me
    union all
    select jsonb_build_object('key', 'comment_reply:' || c.id, 'kind', 'comment_reply',
      'post_id', c.post_id, 'comment_id', c.id, 'actor', c.actor, 'sortAt', c.created_at)
    from comment_rows c where not c.mentions_me and c.parent_owner_id = uid
    union all
    select jsonb_build_object('key', 'comment:' || c.id, 'kind', 'comment',
      'post_id', c.post_id, 'comment_id', c.id, 'actor', c.actor, 'sortAt', c.created_at)
    from comment_rows c where not c.mentions_me and c.parent_owner_id is distinct from uid
      and (c.post_owner_id = uid or (c.community and c.friendship_existed))
    union all
    select jsonb_build_object('key', 'comment_like:' || likes.id, 'kind', 'comment_like',
      'post_id', comment.post_id, 'comment_id', comment.id, 'actor', jsonb_build_object(
        'username', actor.username, 'display_name', actor.display_name,
        'avatar_url', actor.avatar_url, 'equipped_border_key', actor.equipped_border_key),
      'sortAt', likes.created_at)
    from public.comment_likes likes join public.comments comment on comment.id = likes.comment_id
    join public.profiles actor on actor.id = likes.user_id
    where comment.user_id = uid and likes.user_id <> uid and likes.created_at > p_since
      and likes.user_id not in (select user_id from blocked)
    union all
    select jsonb_build_object('key', 'challenge:' || event.id, 'kind', 'challenge',
      'sortAt', daily.fires_at, 'userEvent', to_jsonb(event) || jsonb_build_object(
        'daily_event', to_jsonb(daily) || jsonb_build_object('challenge', to_jsonb(challenge)),
        'challenge', to_jsonb(challenge)))
    from public.user_events event join public.daily_events daily on daily.id = event.daily_event_id
    join public.challenges challenge on challenge.id = daily.challenge_id
    where event.user_id = uid and event.status = 'pending' and event.expires_at > now()
      and daily.fires_at > p_since
    union all
    select jsonb_build_object('key', 'badge_earned:' || progress.category_id || ':' || progress.current_tier,
      'kind', 'badge_earned', 'categoryId', progress.category_id, 'categoryName', category.name,
      'categoryEmoji', category.emoji, 'tier', progress.current_tier, 'sortAt', progress.unlocked_at)
    from public.user_badge_progress progress join public.badge_categories category on category.id = progress.category_id
    where progress.user_id = uid and progress.unlocked_at > p_since
    union all
    select jsonb_build_object('key', 'suggestion_result:' || suggestion.id, 'kind', 'suggestion_result',
      'suggestionId', suggestion.id, 'body', suggestion.body, 'status', suggestion.status,
      'sortAt', suggestion.reviewed_at)
    from public.challenge_suggestions suggestion where suggestion.user_id = uid
      and suggestion.status in ('approved', 'rejected') and suggestion.reviewed_at > p_since
  )
  select coalesce(jsonb_agg(item order by
    case when item->>'kind' = 'friend_request' then 0 else 1 end,
    (item->>'sortAt')::timestamptz desc), '[]'::jsonb) into result
  from (select item from all_items order by
    case when item->>'kind' = 'friend_request' then 0 else 1 end,
    (item->>'sortAt')::timestamptz desc limit least(greatest(p_limit, 1), 250)) bounded;
  return result;
end;
$$;
commit;
