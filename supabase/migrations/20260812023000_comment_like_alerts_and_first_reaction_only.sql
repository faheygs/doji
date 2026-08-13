-- Social notification contracts:
-- 1. A person may have at most one active reaction per post.
-- 2. Changing the selected reaction updates that row and does not alert again.
-- 3. Removing and later re-adding a reaction also does not alert again.
-- 4. The first heart from a person on a comment alerts the comment author.

-- Collapse any legacy multi-reaction rows before enforcing the invariant.
with ranked as (
  select
    reaction.id,
    row_number() over (
      partition by reaction.post_id, reaction.user_id
      order by reaction.created_at desc, reaction.id desc
    ) as keep_rank
  from public.reactions reaction
)
delete from public.reactions reaction
using ranked
where reaction.id = ranked.id and ranked.keep_rank > 1;

create unique index if not exists reactions_one_per_user_post
  on public.reactions (post_id, user_id);

create or replace function public.toggle_post_reaction(
  p_post_id uuid,
  p_emoji text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  existing_id uuid;
  existing_emoji text;
  is_active boolean;
  total integer;
  prior_result jsonb;
  final_result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;
  if p_emoji not in ('fire', 'like', 'dislike', 'laugh', 'wow', 'heart') then
    raise exception 'Invalid reaction';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_post_id::text || ':' || uid::text, 0));

  select receipt.result into prior_result
  from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  select reaction.id, reaction.emoji
    into existing_id, existing_emoji
  from public.reactions reaction
  where reaction.post_id = p_post_id and reaction.user_id = uid
  limit 1;

  if existing_id is null then
    insert into public.reactions (post_id, user_id, emoji)
    values (p_post_id, uid, p_emoji);
    is_active := true;
  elsif existing_emoji = p_emoji then
    delete from public.reactions where id = existing_id;
    is_active := false;
  else
    update public.reactions set emoji = p_emoji where id = existing_id;
    is_active := true;
  end if;

  select count(*)::integer into total
  from public.reactions reaction
  where reaction.post_id = p_post_id;

  final_result := jsonb_build_object(
    'post_id', p_post_id,
    'emoji', p_emoji,
    'active', is_active,
    'count', total
  );
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.toggle_post_reaction(uuid, text, text) from public, anon;
grant execute on function public.toggle_post_reaction(uuid, text, text) to authenticated;

-- The outbox key is based on the actor/post/recipient relationship instead of
-- the mutable reaction row ID. It therefore represents the first reaction only.
create or replace function public.trg_reaction_push_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  is_community boolean;
  daily_event_id uuid;
  actor_name text;
begin
  select post.user_id, coalesce(post.is_community_poll, false), post.daily_event_id
    into owner_id, is_community, daily_event_id
  from public.posts post where post.id = new.post_id;

  select coalesce(nullif(profile.display_name, ''), profile.username, 'Someone')
    into actor_name from public.profiles profile where profile.id = new.user_id;

  insert into public.domain_event_outbox (
    topic, event_type, aggregate_id, payload, idempotency_key
  )
  select
    'user:' || recipient.user_id::text || ':events',
    'notification.reaction.created',
    new.id,
    jsonb_build_object(
      'version', 1,
      'sendPush', true,
      'targetUserId', recipient.user_id,
      'preferenceKey', 'reactions_on_my_post',
      'title', 'New reaction',
      'body', case when is_community
        then coalesce(actor_name, 'Someone') || ' reacted to today''s Doji'
        else coalesce(actor_name, 'Someone') || ' reacted to your post' end,
      'type', 'REACTION',
      'postId', new.post_id,
      'dailyEventId', daily_event_id,
      'url', case when is_community then '/' else '/post/' || new.post_id::text end
    ),
    'push:reaction:first:' || new.post_id::text || ':' || new.user_id::text || ':' ||
      recipient.user_id::text
  from (
    select owner_id as user_id
    where not is_community and owner_id is not null and owner_id <> new.user_id
    union
    select case when friendship.requester_id = new.user_id
                then friendship.addressee_id else friendship.requester_id end as user_id
    from public.friendships friendship
    where is_community
      and friendship.status = 'accepted'
      and (friendship.requester_id = new.user_id or friendship.addressee_id = new.user_id)
  ) recipient
  where recipient.user_id is not null
    and recipient.user_id <> new.user_id
    and (not is_community or public.can_access_daily_event(daily_event_id, recipient.user_id))
  on conflict (idempotency_key) do nothing;

  return new;
end;
$$;

revoke all on function public.trg_reaction_push_notify() from public, anon, authenticated;

drop trigger if exists reactions_push_notify on public.reactions;
create trigger reactions_push_notify
  after insert on public.reactions
  for each row execute function public.trg_reaction_push_notify();

create or replace function public.trg_comment_like_push_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  comment_owner_id uuid;
  post_id uuid;
  actor_name text;
begin
  select comment.user_id, comment.post_id
    into comment_owner_id, post_id
  from public.comments comment
  where comment.id = new.comment_id;

  if comment_owner_id is null or comment_owner_id = new.user_id then
    return new;
  end if;

  select coalesce(nullif(profile.display_name, ''), profile.username, 'Someone')
    into actor_name
  from public.profiles profile
  where profile.id = new.user_id;

  perform public.enqueue_domain_event(
    'user:' || comment_owner_id::text || ':events',
    'notification.comment_like.created',
    new.id,
    jsonb_build_object(
      'version', 1,
      'sendPush', true,
      'targetUserId', comment_owner_id,
      'preferenceKey', 'reactions_on_my_post',
      'title', 'New comment like',
      'body', coalesce(actor_name, 'Someone') || ' liked your comment',
      'type', 'COMMENT_LIKE',
      'postId', post_id,
      'commentId', new.comment_id,
      'url', '/post/' || post_id::text
    ),
    'push:comment-like:first:' || new.comment_id::text || ':' || new.user_id::text || ':' ||
      comment_owner_id::text
  );

  return new;
end;
$$;

revoke all on function public.trg_comment_like_push_notify()
  from public, anon, authenticated;

drop trigger if exists comment_likes_push_notify on public.comment_likes;
create trigger comment_likes_push_notify
  after insert on public.comment_likes
  for each row execute function public.trg_comment_like_push_notify();
