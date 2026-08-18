-- Public profile output is an allowlist. Private account state must never be
-- copied into an authenticated caller's JSON response.
create or replace function public.get_public_profile_view(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  profile_row public.profiles%rowtype;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select profile.* into profile_row
  from public.profiles profile
  where profile.username = lower(trim(p_username))
    and coalesce(profile.is_banned, false) = false
    and coalesce(profile.is_demo_account, false) = false
  limit 1;
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
    'id', profile_row.id,
    'username', profile_row.username,
    'display_name', profile_row.display_name,
    'avatar_url', profile_row.avatar_url,
    'avatar_gradient', profile_row.avatar_gradient,
    'bio', profile_row.bio,
    'current_streak', profile_row.current_streak,
    'longest_streak', profile_row.longest_streak,
    'total_completions', profile_row.total_completions,
    'total_missed', profile_row.total_missed,
    'xp', profile_row.xp,
    'level', profile_row.level,
    'reactions_received', public.profile_reactions_received(profile_row.id),
    'reactions_given', profile_row.reactions_given,
    'accent_theme', profile_row.accent_theme,
    'equipped_border_key', profile_row.equipped_border_key,
    'equipped_title_key', profile_row.equipped_title_key,
    'created_at', profile_row.created_at,
    'updated_at', profile_row.updated_at
  ));
end;
$$;

revoke all on function public.get_public_profile_view(text) from public, anon;
grant execute on function public.get_public_profile_view(text) to authenticated;

comment on function public.get_public_profile_view(text) is
  'Blocked-state envelope with an explicit safe public profile allowlist.';
