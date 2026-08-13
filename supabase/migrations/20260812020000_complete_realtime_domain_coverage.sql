-- Complete the realtime event map and retire the remaining direct HTTP push
-- triggers. Every durable UI mutation now produces either a public domain
-- event or a private user event from the same database transaction.

-- ---------------------------------------------------------------------------
-- Profile, wallet, cosmetics, and leaderboard state
-- ---------------------------------------------------------------------------
create or replace function public.publish_public_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  presentation_changed boolean := false;
  stats_changed boolean := false;
begin
  if tg_table_name = 'profiles' then
    if tg_op = 'DELETE' then uid := old.id; else uid := new.id; end if;
  elsif tg_table_name = 'weekly_xp' then
    if tg_op = 'DELETE' then uid := old.user_id; else uid := new.user_id; end if;
  else
    raise exception 'Unsupported table % for publish_public_profile_change', tg_table_name;
  end if;

  if tg_table_name = 'profiles' then
    presentation_changed :=
      old.username is distinct from new.username
      or old.display_name is distinct from new.display_name
      or old.avatar_url is distinct from new.avatar_url
      or old.avatar_gradient is distinct from new.avatar_gradient
      or old.bio is distinct from new.bio
      or old.equipped_border_key is distinct from new.equipped_border_key
      or old.equipped_title_key is distinct from new.equipped_title_key
      or old.accent_theme is distinct from new.accent_theme;
    stats_changed :=
      old.current_streak is distinct from new.current_streak
      or old.longest_streak is distinct from new.longest_streak
      or old.total_completions is distinct from new.total_completions
      or old.total_missed is distinct from new.total_missed
      or old.xp is distinct from new.xp
      or old.level is distinct from new.level
      or old.reactions_received is distinct from new.reactions_received
      or old.reactions_given is distinct from new.reactions_given
      or old.is_admin is distinct from new.is_admin
      or old.is_banned is distinct from new.is_banned;
  end if;

  if tg_table_name = 'profiles' and presentation_changed then
    perform public.enqueue_domain_event(
      'profiles:global', 'profile.presentation.updated', uid,
      jsonb_build_object('version', 1, 'userId', uid), null
    );
  end if;

  if tg_table_name = 'profiles' and stats_changed then
    perform public.enqueue_domain_event(
      'profiles:global', 'profile.stats.updated', uid,
      jsonb_build_object('version', 1, 'userId', uid), null
    );
  end if;

  if tg_table_name = 'weekly_xp' or stats_changed then
    perform public.enqueue_domain_event(
      'leaderboard:global', 'leaderboard.updated', uid,
      jsonb_build_object('version', 1, 'userId', uid), null
    );
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.publish_public_profile_change()
  from public, anon, authenticated;

drop trigger if exists publish_profile_change on public.profiles;
create trigger publish_profile_change
after update of username, display_name, avatar_url, avatar_gradient, bio,
  current_streak, longest_streak, total_completions, total_missed, xp, level,
  reactions_received, reactions_given, equipped_border_key, equipped_title_key,
  accent_theme, is_admin, is_banned
on public.profiles
for each row execute function public.publish_public_profile_change();

create or replace function public.publish_private_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.enqueue_domain_event(
    'user:' || new.id::text || ':events',
    'account.profile.updated',
    new.id,
    jsonb_build_object('version', 1, 'userId', new.id),
    null
  );
  return new;
end;
$$;

revoke all on function public.publish_private_profile_change()
  from public, anon, authenticated;

drop trigger if exists publish_private_profile_change on public.profiles;
create trigger publish_private_profile_change
after update of sparks, streak_shields, app_theme, appearance_mode, timezone,
  onboarding_completed_at, notification_preferences
on public.profiles
for each row execute function public.publish_private_profile_change();

create or replace function public.publish_shop_ownership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  item_key text := case when tg_op = 'DELETE' then old.item_key else new.item_key end;
begin
  perform public.enqueue_domain_event(
    'user:' || uid::text || ':events',
    'shop.ownership.' || lower(tg_op),
    uid,
    jsonb_build_object('version', 1, 'userId', uid, 'itemKey', item_key),
    null
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.publish_shop_ownership_change()
  from public, anon, authenticated;

drop trigger if exists publish_shop_ownership_change on public.user_shop_items;
create trigger publish_shop_ownership_change
after insert or delete on public.user_shop_items
for each row execute function public.publish_shop_ownership_change();

-- ---------------------------------------------------------------------------
-- User occurrence state and public badge progress
-- ---------------------------------------------------------------------------
create or replace function public.publish_user_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.enqueue_domain_event(
    'user:' || new.user_id::text || ':events',
    'user_event.updated',
    new.id,
    jsonb_build_object(
      'version', 1,
      'userEventId', new.id,
      'dailyEventId', new.daily_event_id,
      'status', new.status
    ),
    null
  );
  return new;
end;
$$;

revoke all on function public.publish_user_event_change()
  from public, anon, authenticated;

drop trigger if exists publish_user_event_change on public.user_events;
create trigger publish_user_event_change
after update of status, expires_at, completed_at, buy_in_at on public.user_events
for each row execute function public.publish_user_event_change();

create or replace function public.publish_public_badge_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
begin
  perform public.enqueue_domain_event(
    'profiles:global',
    'badge.updated',
    uid,
    jsonb_build_object('version', 1, 'userId', uid),
    null
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.publish_public_badge_change()
  from public, anon, authenticated;

drop trigger if exists publish_public_user_badge_change on public.user_badges;
create trigger publish_public_user_badge_change
after insert or update or delete on public.user_badges
for each row execute function public.publish_public_badge_change();

drop trigger if exists publish_public_badge_progress_change on public.user_badge_progress;
create trigger publish_public_badge_progress_change
after insert or update or delete on public.user_badge_progress
for each row execute function public.publish_public_badge_change();

-- ---------------------------------------------------------------------------
-- Exactly-once account pushes through the transactional outbox
-- ---------------------------------------------------------------------------
drop trigger if exists friendships_request_push on public.friendships;
drop trigger if exists friendships_accepted_push on public.friendships;
drop trigger if exists posts_friend_push on public.posts;
drop trigger if exists posts_friend_post_push on public.posts;
drop trigger if exists user_badges_push on public.user_badges;
drop trigger if exists user_badge_progress_push on public.user_badge_progress;
drop trigger if exists comment_mentions_push on public.comment_mentions;
drop trigger if exists suggestion_review_push on public.challenge_suggestions;

-- The legacy direct pg_net helper is no longer part of the delivery path and
-- must not remain callable as a SECURITY DEFINER RPC.
revoke all on function public.doji_notify_user_push(uuid, text, text, jsonb, text)
  from public, anon, authenticated;

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
      'version', 1, 'sendPush', true, 'targetUserId', recipient.user_id,
      'preferenceKey', 'reactions_on_my_post', 'title', 'New reaction',
      'body', case when is_community
        then coalesce(actor_name, 'Someone') || ' reacted to today''s Doji'
        else coalesce(actor_name, 'Someone') || ' reacted to your post' end,
      'type', 'REACTION', 'postId', new.post_id, 'dailyEventId', daily_event_id,
      'url', case when is_community then '/' else '/post/' || new.post_id::text end
    ),
    'push:reaction:' || new.id::text || ':' || recipient.user_id::text
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

-- Comment alerts are recipient-aware. Normal posts notify the owner; shared
-- community polls notify accepted friends of the commenter; direct replies
-- notify the parent author instead of generating a duplicate generic alert.
create or replace function public.trg_comment_push_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  is_community boolean;
  comments_disabled boolean;
  daily_event_id uuid;
  actor_name text;
  parent_author_id uuid;
begin
  select post.user_id, coalesce(post.is_community_poll, false),
         coalesce(post.comments_disabled, false), post.daily_event_id
    into owner_id, is_community, comments_disabled, daily_event_id
  from public.posts post where post.id = new.post_id;
  if comments_disabled then return new; end if;

  select coalesce(nullif(profile.display_name, ''), profile.username, 'Someone')
    into actor_name from public.profiles profile where profile.id = new.user_id;
  if new.parent_id is not null then
    select parent.user_id into parent_author_id
    from public.comments parent where parent.id = new.parent_id;
  end if;

  insert into public.domain_event_outbox (
    topic, event_type, aggregate_id, payload, idempotency_key
  )
  select
    'user:' || recipient.user_id::text || ':events',
    'notification.comment.created',
    new.id,
    jsonb_build_object(
      'version', 1, 'sendPush', true, 'targetUserId', recipient.user_id,
      'preferenceKey', 'comment', 'title', 'New comment',
      'body', case when is_community
        then coalesce(actor_name, 'Someone') || ' commented on today''s Doji'
        else coalesce(actor_name, 'Someone') || ' commented on your post' end,
      'type', 'COMMENT', 'postId', new.post_id, 'dailyEventId', daily_event_id,
      'url', case when is_community then '/' else '/post/' || new.post_id::text end
    ),
    'push:comment:' || new.id::text || ':' || recipient.user_id::text
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
    and recipient.user_id is distinct from parent_author_id
    and (not is_community or public.can_access_daily_event(daily_event_id, recipient.user_id))
  on conflict (idempotency_key) do nothing;

  if parent_author_id is not null and parent_author_id <> new.user_id then
    insert into public.domain_event_outbox (
      topic, event_type, aggregate_id, payload, idempotency_key
    ) values (
      'user:' || parent_author_id::text || ':events',
      'notification.comment_reply.created',
      new.id,
      jsonb_build_object(
        'version', 1, 'sendPush', true, 'targetUserId', parent_author_id,
        'preferenceKey', 'comment_reply', 'title', 'New reply',
        'body', coalesce(actor_name, 'Someone') || ' replied to your comment',
        'type', 'COMMENT_REPLY', 'postId', new.post_id, 'commentId', new.id,
        'dailyEventId', daily_event_id,
        'url', case when is_community then '/' else '/post/' || new.post_id::text end
      ),
      'push:comment-reply:' || new.id::text || ':' || parent_author_id::text
    ) on conflict (idempotency_key) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.trg_comment_push_notify() from public, anon, authenticated;

create or replace function public.trg_friendship_request_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_name text;
begin
  if new.status is distinct from 'pending' then return new; end if;
  select coalesce(nullif(profile.display_name, ''), profile.username, 'Someone')
    into actor_name from public.profiles profile where profile.id = new.requester_id;

  perform public.enqueue_domain_event(
    'user:' || new.addressee_id::text || ':events',
    'notification.friend_request.created',
    new.id,
    jsonb_build_object(
      'version', 1, 'sendPush', true, 'targetUserId', new.addressee_id,
      'preferenceKey', 'friend_request', 'title', 'Friend request',
      'body', coalesce(actor_name, 'Someone') || ' sent you a friend request',
      'type', 'FRIEND_REQUEST', 'friendshipId', new.id,
      'url', '/(app)/friends'
    ),
    'push:friend-request:' || new.id::text || ':' || new.addressee_id::text
  );
  return new;
end;
$$;

create or replace function public.trg_friendship_accepted_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_name text;
begin
  if old.status is distinct from 'pending' or new.status is distinct from 'accepted' then
    return new;
  end if;
  select coalesce(nullif(profile.display_name, ''), profile.username, 'Someone')
    into actor_name from public.profiles profile where profile.id = new.addressee_id;

  perform public.enqueue_domain_event(
    'user:' || new.requester_id::text || ':events',
    'notification.friend_accepted.created',
    new.id,
    jsonb_build_object(
      'version', 1, 'sendPush', true, 'targetUserId', new.requester_id,
      'preferenceKey', 'friend_accepted', 'title', 'You are now friends',
      'body', coalesce(actor_name, 'Someone') || ' accepted your friend request',
      'type', 'FRIEND_ACCEPTED', 'friendshipId', new.id,
      'url', '/(app)/friends'
    ),
    'push:friend-accepted:' || new.id::text || ':' || new.requester_id::text
  );
  return new;
end;
$$;

revoke all on function public.trg_friendship_request_push() from public, anon, authenticated;
revoke all on function public.trg_friendship_accepted_push() from public, anon, authenticated;

create trigger friendships_request_push
after insert on public.friendships
for each row execute function public.trg_friendship_request_push();

create trigger friendships_accepted_push
after update of status on public.friendships
for each row execute function public.trg_friendship_accepted_push();

create or replace function public.trg_comment_mention_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_id uuid;
  actor_id uuid;
  actor_name text;
  parent_author_id uuid;
  post_owner_id uuid;
  is_community boolean;
  already_alerted boolean := false;
begin
  select comment.post_id, comment.user_id, parent.user_id, post.user_id,
         coalesce(post.is_community_poll, false),
         coalesce(nullif(profile.display_name, ''), profile.username, 'Someone')
    into post_id, actor_id, parent_author_id, post_owner_id, is_community, actor_name
  from public.comments comment
  join public.posts post on post.id = comment.post_id
  join public.profiles profile on profile.id = comment.user_id
  left join public.comments parent on parent.id = comment.parent_id
  where comment.id = new.comment_id;

  if actor_id is null or new.mentioned_user_id = actor_id then return new; end if;

  already_alerted := new.mentioned_user_id = parent_author_id
    or (not is_community and new.mentioned_user_id = post_owner_id)
    or (is_community and exists (
      select 1 from public.friendships friendship
      where friendship.status = 'accepted'
        and (
          (friendship.requester_id = actor_id and friendship.addressee_id = new.mentioned_user_id)
          or (friendship.addressee_id = actor_id and friendship.requester_id = new.mentioned_user_id)
        )
    ));
  if already_alerted then return new; end if;

  perform public.enqueue_domain_event(
    'user:' || new.mentioned_user_id::text || ':events',
    'notification.mention.created',
    new.id,
    jsonb_build_object(
      'version', 1, 'sendPush', true, 'targetUserId', new.mentioned_user_id,
      'preferenceKey', 'mention', 'title', 'You were mentioned',
      'body', coalesce(actor_name, 'Someone') || ' mentioned you in a comment',
      'type', 'MENTION', 'postId', post_id, 'commentId', new.comment_id,
      'url', '/post/' || post_id::text
    ),
    'push:mention:' || new.id::text || ':' || new.mentioned_user_id::text
  );
  return new;
end;
$$;

revoke all on function public.trg_comment_mention_push() from public, anon, authenticated;

create trigger comment_mentions_push
after insert on public.comment_mentions
for each row execute function public.trg_comment_mention_push();

create or replace function public.trg_suggestion_review_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  title text;
  body text;
  push_type text;
begin
  if old.status is not distinct from new.status
     or new.status not in ('approved', 'rejected') then return new; end if;
  if new.status = 'approved' then
    title := 'Challenge approved'; body := 'Your challenge suggestion was approved';
    push_type := 'SUGGESTION_APPROVED';
  else
    title := 'Challenge declined'; body := 'Your challenge suggestion was not selected this time';
    push_type := 'SUGGESTION_REJECTED';
  end if;

  perform public.enqueue_domain_event(
    'user:' || new.user_id::text || ':events',
    'notification.suggestion.reviewed',
    new.id,
    jsonb_build_object(
      'version', 1, 'sendPush', true, 'targetUserId', new.user_id,
      'preferenceKey', 'suggestion', 'title', title, 'body', body,
      'type', push_type, 'suggestionId', new.id,
      'url', '/(app)/suggest-challenge'
    ),
    'push:suggestion-review:' || new.id::text || ':' || new.status
  );
  return new;
end;
$$;

revoke all on function public.trg_suggestion_review_push() from public, anon, authenticated;

create trigger suggestion_review_push
after update of status on public.challenge_suggestions
for each row execute function public.trg_suggestion_review_push();

create or replace function public.trg_badge_tier_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  category_name text;
  category_emoji text;
begin
  if tg_op = 'UPDATE' and old.current_tier is not distinct from new.current_tier then
    return new;
  end if;
  select category.name, category.emoji into category_name, category_emoji
  from public.badge_categories category where category.id = new.category_id;

  perform public.enqueue_domain_event(
    'user:' || new.user_id::text || ':events',
    'notification.badge.unlocked',
    new.user_id,
    jsonb_build_object(
      'version', 1, 'sendPush', true, 'targetUserId', new.user_id,
      'preferenceKey', 'badges', 'title', 'Badge unlocked',
      'body', trim(concat_ws(' ', category_emoji, coalesce(category_name, 'New badge'),
        initcap(new.current_tier::text))),
      'type', 'BADGE_EARNED', 'categoryId', new.category_id,
      'tier', new.current_tier, 'url', '/(app)/profile'
    ),
    'push:badge-tier:' || new.user_id::text || ':' || new.category_id || ':' || new.current_tier
  );
  return new;
end;
$$;

revoke all on function public.trg_badge_tier_push() from public, anon, authenticated;

create trigger user_badge_progress_push
after insert or update of current_tier on public.user_badge_progress
for each row execute function public.trg_badge_tier_push();

-- Direct Postgres-change sockets are a secondary commit signal. Add every
-- account/social table that can be actively displayed, without failing if a
-- previous migration already added it.
do $$
declare
  table_name text;
begin
  -- Profile rows contain private account fields. Cosmetic/profile realtime is
  -- carried by ID-only Ably events, never raw Postgres-change payloads.
  if exists (
    select 1 from pg_publication_tables publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'profiles'
  ) then
    alter publication supabase_realtime drop table public.profiles;
  end if;

  foreach table_name in array array[
    'blocks', 'comment_mentions', 'notification_center_state',
    'notification_dismissals', 'challenge_suggestions', 'reports',
    'poll_vote_likes'
  ]
  loop
    if to_regclass('public.' || table_name) is not null
       and not exists (
         select 1 from pg_publication_tables publication_table
         where publication_table.pubname = 'supabase_realtime'
           and publication_table.schemaname = 'public'
           and publication_table.tablename = table_name
       ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
