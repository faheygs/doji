-- Profile presentation/stats changes matter to the account and its social
-- graph, not every connected device. Leaderboard changes remain a coalesced
-- signal consumed only while the leaderboard is focused.

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
    uid := case when tg_op = 'DELETE' then old.id else new.id end;
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
  elsif tg_table_name = 'weekly_xp' then
    uid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  else
    raise exception 'Unsupported table % for publish_public_profile_change', tg_table_name;
  end if;

  if presentation_changed or stats_changed then
    insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
    select distinct recipient.topic,
      case when presentation_changed then 'profile.presentation.updated'
           else 'profile.stats.updated' end,
      uid, jsonb_build_object('version', 1, 'userId', uid)
    from (
      select 'user:' || uid::text || ':events' topic
      union all
      select 'user:' || (case when friendship.requester_id = uid
        then friendship.addressee_id else friendship.requester_id end)::text || ':events'
      from public.friendships friendship
      where friendship.status = 'accepted'
        and (friendship.requester_id = uid or friendship.addressee_id = uid)
    ) recipient;
  end if;

  if tg_table_name = 'weekly_xp' or stats_changed then
    perform public.enqueue_domain_event('leaderboard:global', 'leaderboard.updated', uid,
      jsonb_build_object('version', 1), null);
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.publish_public_profile_change()
  from public, anon, authenticated;

create or replace function public.publish_user_event_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- The single doji.closed broadcast invalidates every client's occurrence.
  -- Do not create one private outbox row for every pending participant.
  if old.status = 'pending' and new.status = 'missed' then return new; end if;
  perform public.enqueue_domain_event(
    'user:' || new.user_id::text || ':events', 'user_event.updated', new.id,
    jsonb_build_object('version', 1, 'userEventId', new.id,
      'dailyEventId', new.daily_event_id, 'status', new.status), null
  );
  return new;
end;
$$;

revoke all on function public.publish_user_event_change()
  from public, anon, authenticated;

create or replace function public.publish_public_badge_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare uid uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
begin
  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  select distinct recipient.topic, 'badge.updated', uid,
    jsonb_build_object('version', 1, 'userId', uid)
  from (
    select 'user:' || uid::text || ':events' topic
    union all
    select 'user:' || (case when friendship.requester_id = uid
      then friendship.addressee_id else friendship.requester_id end)::text || ':events'
    from public.friendships friendship
    where friendship.status = 'accepted'
      and (friendship.requester_id = uid or friendship.addressee_id = uid)
  ) recipient;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.publish_public_badge_change()
  from public, anon, authenticated;
