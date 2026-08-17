-- Blocking hides social content both ways. A blocked viewer receives only an
-- explicit access state for the blocker's profile, never its public fields.
create or replace function public.get_public_profile_view(p_username text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  profile_row public.profiles%rowtype;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select profile.* into profile_row from public.profiles profile
  where profile.username = lower(trim(p_username)) limit 1;
  if not found then
    return jsonb_build_object('status', 'not_found', 'profile', null);
  end if;
  if exists (
    select 1 from public.blocks block
    where block.blocker_id = profile_row.id and block.blocked_id = uid
  ) then
    return jsonb_build_object('status', 'blocked_by_user', 'profile', null);
  end if;
  return jsonb_build_object('status', 'visible', 'profile', jsonb_build_object(
    'id', profile_row.id, 'username', profile_row.username,
    'display_name', profile_row.display_name, 'avatar_url', profile_row.avatar_url,
    'avatar_gradient', profile_row.avatar_gradient, 'bio', profile_row.bio,
    'current_streak', profile_row.current_streak,
    'longest_streak', profile_row.longest_streak,
    'total_completions', profile_row.total_completions,
    'total_missed', profile_row.total_missed, 'xp', profile_row.xp,
    'level', profile_row.level, 'reactions_received', profile_row.reactions_received,
    'reactions_given', profile_row.reactions_given,
    'accent_theme', profile_row.accent_theme,
    'equipped_border_key', profile_row.equipped_border_key,
    'equipped_title_key', profile_row.equipped_title_key,
    'is_admin', profile_row.is_admin, 'is_banned', profile_row.is_banned,
    'is_demo_account', profile_row.is_demo_account,
    'created_at', profile_row.created_at, 'updated_at', profile_row.updated_at
  ));
end;
$$;
revoke all on function public.get_public_profile_view(text) from public, anon;
grant execute on function public.get_public_profile_view(text) to authenticated;

-- Notify both sides so an already-open profile changes state immediately.
create or replace function public.publish_account_domain_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  row_id uuid;
  uid uuid;
  other_uid uuid;
  event_name text;
begin
  if tg_table_name = 'friendships' then
    row_id := coalesce(new.id, old.id);
    uid := coalesce(new.requester_id, old.requester_id);
    other_uid := coalesce(new.addressee_id, old.addressee_id);
    event_name := 'social.friendship.' || lower(tg_op);
  elsif tg_table_name = 'blocks' then
    row_id := coalesce(new.id, old.id);
    uid := coalesce(new.blocker_id, old.blocker_id);
    other_uid := coalesce(new.blocked_id, old.blocked_id);
    event_name := 'social.block.' || lower(tg_op);
  elsif tg_table_name = 'challenge_suggestions' then
    row_id := coalesce(new.id, old.id);
    uid := coalesce(new.user_id, old.user_id);
    event_name := 'notification.suggestion.' || lower(tg_op);
  elsif tg_table_name in ('user_badges', 'user_badge_progress') then
    uid := coalesce(new.user_id, old.user_id);
    row_id := uid;
    event_name := 'notification.badge.' || lower(tg_op);
  elsif tg_table_name = 'notification_center_state' then
    uid := coalesce(new.user_id, old.user_id);
    row_id := uid;
    event_name := 'notification.state.' || lower(tg_op);
  else
    uid := coalesce(new.user_id, old.user_id);
    row_id := uid;
    event_name := 'notification.dismissal.' || lower(tg_op);
  end if;
  if uid is not null then
    perform public.enqueue_domain_event(
      'user:' || uid::text || ':events', event_name, row_id,
      jsonb_build_object('version', 1, 'entityId', row_id), null
    );
  end if;
  if other_uid is not null and other_uid is distinct from uid then
    perform public.enqueue_domain_event(
      'user:' || other_uid::text || ':events', event_name, row_id,
      jsonb_build_object('version', 1, 'entityId', row_id), null
    );
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function public.publish_account_domain_change()
  from public, anon, authenticated;
