-- Reactions, streak bookkeeping, and badge counters do not change leaderboard
-- ordering. Avoid forcing a focused leaderboard to reconcile on every social
-- interaction; publish only when a field rendered or ranked by the board changes.

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
  leaderboard_changed boolean := false;
  fanout_type text;
begin
  if tg_table_name = 'profiles' then
    uid := case when tg_op = 'DELETE' then old.id else new.id end;
    presentation_changed := old.username is distinct from new.username
      or old.display_name is distinct from new.display_name
      or old.avatar_url is distinct from new.avatar_url
      or old.avatar_gradient is distinct from new.avatar_gradient
      or old.bio is distinct from new.bio
      or old.equipped_border_key is distinct from new.equipped_border_key
      or old.equipped_title_key is distinct from new.equipped_title_key
      or old.accent_theme is distinct from new.accent_theme;
    stats_changed := old.current_streak is distinct from new.current_streak
      or old.longest_streak is distinct from new.longest_streak
      or old.total_completions is distinct from new.total_completions
      or old.total_missed is distinct from new.total_missed
      or old.xp is distinct from new.xp
      or old.level is distinct from new.level
      or old.reactions_received is distinct from new.reactions_received
      or old.reactions_given is distinct from new.reactions_given
      or old.is_admin is distinct from new.is_admin
      or old.is_banned is distinct from new.is_banned;
    leaderboard_changed := presentation_changed
      or old.xp is distinct from new.xp
      or old.level is distinct from new.level
      or old.is_banned is distinct from new.is_banned;
  elsif tg_table_name = 'weekly_xp' then
    uid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
    leaderboard_changed := true;
  else
    raise exception 'Unsupported table % for publish_public_profile_change', tg_table_name;
  end if;

  if presentation_changed or stats_changed then
    fanout_type := case when presentation_changed
      then 'fanout.profile_presentation' else 'fanout.profile_stats' end;
    perform public.enqueue_friend_fanout(
      fanout_type, uid,
      jsonb_build_object(
        'actorUserId', uid, 'aggregateId', uid, 'realtimeOnly', true,
        'occurredAt', clock_timestamp()
      ),
      'fanout:profile:' || uid::text || ':' || gen_random_uuid()::text
    );
  end if;

  if leaderboard_changed then
    perform public.enqueue_domain_event(
      'leaderboard:global', 'leaderboard.updated', uid,
      jsonb_build_object('version', 1), null
    );
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.publish_public_profile_change()
  from public, anon, authenticated;

comment on function public.publish_public_profile_change() is
  'Fans profile changes to friends and emits leaderboard invalidation only for rendered/ranking fields.';
