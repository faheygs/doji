-- Reactions and comment likes remain live in the Activity Center, but OS alerts
-- are grouped. A person's remove/re-add cycle never creates another alert.

create table if not exists public.notification_once_keys (
  delivery_key text primary key,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.notification_once_keys enable row level security;
revoke all on public.notification_once_keys from public, anon, authenticated;

create or replace function public.trg_reaction_push_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  is_community boolean;
  event_id uuid;
  actor_name text;
  bucket_at timestamptz := public.notification_group_bucket(clock_timestamp());
begin
  select post.user_id, coalesce(post.is_community_poll, false), post.daily_event_id
    into owner_id, is_community, event_id
  from public.posts post where post.id = new.post_id;

  select coalesce(nullif(trim(profile.display_name), ''), profile.username, 'Someone')
    into actor_name from public.profiles profile where profile.id = new.user_id;

  -- The bell refresh is immediate and never waits for the push aggregation window.
  insert into public.domain_event_outbox (
    topic, event_type, aggregate_id, payload, idempotency_key
  )
  select 'user:' || recipient.user_id::text || ':events',
    'notification.reaction.updated', new.post_id,
    jsonb_build_object(
      'version', 1, 'sendPush', false, 'targetUserId', recipient.user_id,
      'postId', new.post_id, 'dailyEventId', event_id
    ),
    'activity:reaction:first:' || new.post_id::text || ':' || new.user_id::text || ':' ||
      recipient.user_id::text
  from (
    select owner_id as user_id where not is_community and owner_id <> new.user_id
    union
    select case when friendship.requester_id = new.user_id
      then friendship.addressee_id else friendship.requester_id end
    from public.friendships friendship
    where is_community and friendship.status = 'accepted'
      and (friendship.requester_id = new.user_id or friendship.addressee_id = new.user_id)
  ) recipient
  where recipient.user_id is not null and recipient.user_id <> new.user_id
    and (not is_community or public.can_access_daily_event(event_id, recipient.user_id))
  on conflict (idempotency_key) do nothing;

  with recipients as (
    select owner_id as user_id where not is_community and owner_id <> new.user_id
    union
    select case when friendship.requester_id = new.user_id
      then friendship.addressee_id else friendship.requester_id end
    from public.friendships friendship
    where is_community and friendship.status = 'accepted'
      and (friendship.requester_id = new.user_id or friendship.addressee_id = new.user_id)
  ), eligible as (
    insert into public.notification_once_keys (delivery_key)
    select 'reaction:first:' || new.post_id::text || ':' || new.user_id::text || ':' ||
      recipient.user_id::text
    from recipients recipient
    where recipient.user_id is not null and recipient.user_id <> new.user_id
      and (not is_community or public.can_access_daily_event(event_id, recipient.user_id))
    on conflict (delivery_key) do nothing
    returning delivery_key
  )
  insert into public.domain_event_outbox (
    topic, event_type, aggregate_id, payload, idempotency_key, available_at
  )
  select 'user:' || recipient.user_id::text || ':events',
    'notification.reactions.grouped', new.post_id,
    jsonb_build_object(
      'version', 1, 'sendPush', true, 'targetUserId', recipient.user_id,
      'preferenceKey', 'reactions_on_my_post', 'title', 'New reactions',
      'body', coalesce(actor_name, 'Someone') || case when is_community
        then ' reacted to today''s Doji' else ' reacted to your post' end,
      'firstActor', coalesce(actor_name, 'Someone'), 'count', 1,
      'type', 'REACTION', 'postId', new.post_id, 'dailyEventId', event_id,
      'url', case when is_community then '/' else '/post/' || new.post_id::text end,
      'priority', 'normal', 'interruptionLevel', 'active',
      'threadId', 'post-reactions:' || new.post_id::text,
      'collapseId', 'post-reactions:' || new.post_id::text,
      'tag', 'post-reactions:' || new.post_id::text
    ),
    'push:reaction-group:' || new.post_id::text || ':' || recipient.user_id::text || ':' ||
      extract(epoch from bucket_at)::bigint::text,
    bucket_at + interval '60 seconds'
  from recipients recipient
  join eligible first_alert on first_alert.delivery_key =
    'reaction:first:' || new.post_id::text || ':' || new.user_id::text || ':' ||
      recipient.user_id::text
  on conflict (idempotency_key) do update
  set payload = public.increment_grouped_notification_payload(
    public.domain_event_outbox.payload,
    case when is_community then 'reacted to today''s Doji' else 'reacted to your post' end
  );

  return new;
end;
$$;

create or replace function public.trg_comment_like_push_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  comment_owner_id uuid;
  parent_post_id uuid;
  actor_name text;
  bucket_at timestamptz := public.notification_group_bucket(clock_timestamp());
  first_key text;
begin
  select comment.user_id, comment.post_id into comment_owner_id, parent_post_id
  from public.comments comment where comment.id = new.comment_id;
  if comment_owner_id is null or comment_owner_id = new.user_id then return new; end if;

  select coalesce(nullif(trim(profile.display_name), ''), profile.username, 'Someone')
    into actor_name from public.profiles profile where profile.id = new.user_id;

  perform public.enqueue_domain_event(
    'user:' || comment_owner_id::text || ':events',
    'notification.comment_like.updated', new.comment_id,
    jsonb_build_object(
      'version', 1, 'sendPush', false, 'targetUserId', comment_owner_id,
      'postId', parent_post_id, 'commentId', new.comment_id
    ),
    'activity:comment-like:first:' || new.comment_id::text || ':' || new.user_id::text || ':' ||
      comment_owner_id::text
  );

  first_key := 'comment-like:first:' || new.comment_id::text || ':' || new.user_id::text || ':' ||
    comment_owner_id::text;
  insert into public.notification_once_keys (delivery_key) values (first_key)
  on conflict (delivery_key) do nothing;
  if not found then return new; end if;

  insert into public.domain_event_outbox (
    topic, event_type, aggregate_id, payload, idempotency_key, available_at
  ) values (
    'user:' || comment_owner_id::text || ':events',
    'notification.comment_likes.grouped', new.comment_id,
    jsonb_build_object(
      'version', 1, 'sendPush', true, 'targetUserId', comment_owner_id,
      'preferenceKey', 'reactions_on_my_post', 'title', 'People liked your comment',
      'body', coalesce(actor_name, 'Someone') || ' liked your comment',
      'firstActor', coalesce(actor_name, 'Someone'), 'count', 1,
      'type', 'COMMENT_LIKE', 'postId', parent_post_id, 'commentId', new.comment_id,
      'url', '/post/' || parent_post_id::text, 'priority', 'normal',
      'interruptionLevel', 'active', 'threadId', 'comment-likes:' || new.comment_id::text,
      'collapseId', 'comment-likes:' || new.comment_id::text,
      'tag', 'comment-likes:' || new.comment_id::text
    ),
    'push:comment-like-group:' || new.comment_id::text || ':' || comment_owner_id::text || ':' ||
      extract(epoch from bucket_at)::bigint::text,
    bucket_at + interval '60 seconds'
  )
  on conflict (idempotency_key) do update
  set payload = public.increment_grouped_notification_payload(
    public.domain_event_outbox.payload, 'liked your comment'
  );
  return new;
end;
$$;

revoke all on function public.trg_reaction_push_notify() from public, anon, authenticated;
revoke all on function public.trg_comment_like_push_notify() from public, anon, authenticated;

drop trigger if exists reactions_push_notify on public.reactions;
create trigger reactions_push_notify after insert on public.reactions
for each row execute function public.trg_reaction_push_notify();
drop trigger if exists comment_likes_push_notify on public.comment_likes;
create trigger comment_likes_push_notify after insert on public.comment_likes
for each row execute function public.trg_comment_like_push_notify();
