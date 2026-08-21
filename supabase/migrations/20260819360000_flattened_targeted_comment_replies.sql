-- Instagram-style replies: users can answer any visible comment, while every
-- reply remains grouped one level beneath the original top-level comment.

alter table public.comments
  add column if not exists reply_to_comment_id uuid
  references public.comments(id) on delete set null;

update public.comments
set reply_to_comment_id = parent_id
where parent_id is not null and reply_to_comment_id is null;

create index if not exists comments_reply_target_idx
  on public.comments (reply_to_comment_id, created_at desc)
  where reply_to_comment_id is not null;

create or replace function public.comments_enforce_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is null then
    new.reply_to_comment_id := null;
    return new;
  end if;

  new.reply_to_comment_id := coalesce(new.reply_to_comment_id, new.parent_id);

  if not exists (
    select 1 from public.comments root
    where root.id = new.parent_id
      and root.post_id = new.post_id
      and root.parent_id is null
  ) then
    raise exception 'Invalid root comment';
  end if;

  if not exists (
    select 1 from public.comments target
    where target.id = new.reply_to_comment_id
      and target.post_id = new.post_id
      and (target.id = new.parent_id or target.parent_id = new.parent_id)
  ) then
    raise exception 'Invalid reply target';
  end if;

  return new;
end;
$$;

create or replace function public.submit_comment(
  p_post_id uuid,
  p_body text,
  p_parent_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  comment_row public.comments%rowtype;
  root_id uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then
    raise exception 'Invalid idempotency key';
  end if;
  if length(trim(p_body)) < 1 or length(trim(p_body)) > 2000 then
    raise exception 'Comment must be between 1 and 2000 characters';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_idempotency_key, 0));

  select * into comment_row
  from public.comments
  where idempotency_key = p_idempotency_key and user_id = uid;
  if found then return to_jsonb(comment_row); end if;

  if not exists (
    select 1 from public.posts post
    where post.id = p_post_id and not post.comments_disabled
  ) then
    raise exception 'Comments are not available';
  end if;

  if p_parent_id is not null then
    select coalesce(target.parent_id, target.id)
      into root_id
    from public.comments target
    where target.id = p_parent_id and target.post_id = p_post_id;
    if root_id is null then raise exception 'Reply target not found'; end if;
  end if;

  insert into public.comments (
    post_id, user_id, body, parent_id, reply_to_comment_id, idempotency_key
  ) values (
    p_post_id, uid, trim(p_body), root_id, p_parent_id, p_idempotency_key
  ) returning * into comment_row;

  perform public.sync_comment_mentions(comment_row.id, comment_row.body, uid);
  return to_jsonb(comment_row);
end;
$$;

revoke all on function public.submit_comment(uuid, text, uuid, text)
  from public, anon;
grant execute on function public.submit_comment(uuid, text, uuid, text)
  to authenticated;

create or replace function public.trg_comment_push_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid; is_community boolean; comments_disabled boolean;
  daily_id uuid; actor_name text; reply_target_author_id uuid;
begin
  select post.user_id, coalesce(post.is_community_poll, false),
         coalesce(post.comments_disabled, false), post.daily_event_id
    into owner_id, is_community, comments_disabled, daily_id
  from public.posts post where post.id = new.post_id;
  if comments_disabled then return new; end if;

  select coalesce(nullif(trim(profile.display_name), ''), profile.username, 'Someone')
    into actor_name from public.profiles profile where profile.id = new.user_id;

  if new.reply_to_comment_id is not null then
    select target.user_id into reply_target_author_id
    from public.comments target where target.id = new.reply_to_comment_id;
  end if;

  if is_community then
    perform public.enqueue_friend_fanout(
      'fanout.community_comment', new.id,
      jsonb_build_object(
        'actorUserId', new.user_id, 'actorName', actor_name,
        'aggregateId', new.id, 'postId', new.post_id,
        'dailyEventId', daily_id, 'parentAuthorId', reply_target_author_id,
        'occurredAt', coalesce(new.created_at, clock_timestamp())
      ),
      'fanout-request:community-comment:' || new.id::text
    );
  elsif owner_id is not null and owner_id <> new.user_id
        and owner_id is distinct from reply_target_author_id then
    insert into public.domain_event_outbox (
      topic, event_type, aggregate_id, payload, idempotency_key
    ) values (
      'user:' || owner_id::text || ':events', 'notification.comment.created', new.id,
      jsonb_build_object(
        'version', 1, 'sendPush', true, 'targetUserId', owner_id,
        'preferenceKey', 'comment', 'title', 'New comment',
        'body', actor_name || ' commented on your post', 'type', 'COMMENT',
        'postId', new.post_id, 'url', '/post/' || new.post_id::text
      ),
      'push:comment:' || new.id::text || ':' || owner_id::text
    ) on conflict (idempotency_key) do nothing;
  end if;

  if reply_target_author_id is not null and reply_target_author_id <> new.user_id then
    insert into public.domain_event_outbox (
      topic, event_type, aggregate_id, payload, idempotency_key
    ) values (
      'user:' || reply_target_author_id::text || ':events',
      'notification.comment_reply.created', new.id,
      jsonb_build_object(
        'version', 1, 'sendPush', true, 'targetUserId', reply_target_author_id,
        'preferenceKey', 'comment_reply', 'title', 'New reply',
        'body', actor_name || ' replied to your comment', 'type', 'COMMENT_REPLY',
        'postId', new.post_id, 'commentId', new.id, 'dailyEventId', daily_id,
        'url', case when is_community then '/' else '/post/' || new.post_id::text end
      ),
      'push:comment-reply:' || new.id::text || ':' || reply_target_author_id::text
    ) on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.trg_comment_push_notify()
  from public, anon, authenticated;

-- Keep the established bounded bell snapshot, but replace the legacy
-- root-author reply item with one addressed to the exact reply target.
create or replace function public.get_notification_center_snapshot(
  p_since timestamptz,
  p_limit integer default 200
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with base_raw as (
    select value item, ordinality position
    from jsonb_array_elements(
      public.get_notification_center_snapshot_without_post_context(p_since, p_limit)
    ) with ordinality
  ), base_context as (
    select raw.position,
      case when post.id is not null then
        raw.item || jsonb_build_object(
          'is_shared_post', coalesce(post.is_community_poll, false)
        ) else raw.item end item
    from base_raw raw
    left join public.posts post on post.id = nullif(raw.item ->> 'post_id', '')::uuid
    left join public.comments comment on comment.id = nullif(raw.item ->> 'comment_id', '')::uuid
    left join public.comments target on target.id = comment.reply_to_comment_id
    where not (
      raw.item ->> 'kind' = 'comment_reply'
      and target.id is not null
      and target.user_id is distinct from auth.uid()
    )
    and not (
      raw.item ->> 'kind' = 'mention'
      and target.id is not null
      and target.user_id = auth.uid()
    )
  ), exact_replies as (
    select 1000000 + row_number() over (order by comment.created_at desc) position,
      jsonb_build_object(
        'key', 'comment_reply:' || comment.id,
        'kind', 'comment_reply',
        'post_id', comment.post_id,
        'comment_id', comment.id,
        'is_shared_post', coalesce(post.is_community_poll, false),
        'actor', jsonb_build_object(
          'username', actor.username,
          'display_name', actor.display_name,
          'avatar_url', actor.avatar_url,
          'equipped_border_key', actor.equipped_border_key
        ),
        'sortAt', comment.created_at
      ) item
    from public.comments comment
    join public.comments target on target.id = comment.reply_to_comment_id
    join public.posts post on post.id = comment.post_id
    join public.profiles actor on actor.id = comment.user_id
    where target.user_id = auth.uid()
      and comment.user_id <> auth.uid()
      and comment.created_at > p_since
      and not exists (
        select 1 from public.blocks block
        where (block.blocker_id = auth.uid() and block.blocked_id = comment.user_id)
           or (block.blocked_id = auth.uid() and block.blocker_id = comment.user_id)
      )
  ), combined as (
    select * from base_context
    union all
    select * from exact_replies
  ), deduplicated as (
    select item, position,
      row_number() over (
        partition by item ->> 'key'
        order by position
      ) duplicate_rank
    from combined
  ), bounded as (
    select item
    from deduplicated
    where duplicate_rank = 1
    order by
      case when item ->> 'kind' = 'friend_request' then 0 else 1 end,
      (item ->> 'sortAt')::timestamptz desc
    limit least(greatest(coalesce(p_limit, 200), 1), 250)
  )
  select coalesce(jsonb_agg(item order by
    case when item ->> 'kind' = 'friend_request' then 0 else 1 end,
    (item ->> 'sortAt')::timestamptz desc), '[]'::jsonb)
  from bounded;
$$;

revoke all on function public.get_notification_center_snapshot(timestamptz, integer)
  from public, anon;
grant execute on function public.get_notification_center_snapshot(timestamptz, integer)
  to authenticated;
