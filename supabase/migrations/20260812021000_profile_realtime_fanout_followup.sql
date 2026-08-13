-- Immutable follow-up for profile/cosmetic fanout refinements made after the
-- initial coverage migration was installed.

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

drop trigger if exists publish_private_profile_change on public.profiles;
create trigger publish_private_profile_change
after update of sparks, streak_shields, app_theme, appearance_mode, timezone,
  onboarding_completed_at, notification_preferences
on public.profiles
for each row execute function public.publish_private_profile_change();

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

do $$
begin
  if exists (
    select 1 from pg_publication_tables publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'profiles'
  ) then
    alter publication supabase_realtime drop table public.profiles;
  end if;
end;
$$;
