-- Blocking controls direct social surfaces, not public competition standings.
-- The leaderboard also returns only the explicit public profile contract.
create or replace function public.get_leaderboard_snapshot(
  p_mode text default 'weekly',
  p_audience text default 'everyone',
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
  current_week date := date_trunc('week', now() at time zone 'America/Denver')::date;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_mode not in ('weekly', 'alltime') then raise exception 'Invalid leaderboard mode'; end if;
  if p_audience not in ('friends', 'everyone') then raise exception 'Invalid audience'; end if;

  with visible_profiles as (
    select profile.id, profile.username, profile.display_name, profile.avatar_url,
      profile.avatar_gradient, profile.bio, profile.current_streak,
      profile.longest_streak, profile.total_completions, profile.total_missed,
      profile.xp, profile.level, profile.reactions_received, profile.reactions_given,
      profile.accent_theme, profile.equipped_border_key, profile.equipped_title_key,
      profile.created_at, profile.updated_at
    from public.profiles profile
    where coalesce(profile.is_banned, false) = false
      and coalesce(profile.is_demo_account, false) = false
      and (
        p_audience = 'everyone' or profile.id = uid or exists (
          select 1 from public.friendships friendship
          where friendship.status = 'accepted'
            and ((friendship.requester_id = uid and friendship.addressee_id = profile.id)
              or (friendship.addressee_id = uid and friendship.requester_id = profile.id))
        )
      )
  ), ranked as (
    select profile.*,
      case when p_mode = 'weekly' then coalesce(weekly.xp, 0)
        else coalesce(profile.xp, 0) end::integer as board_xp
    from visible_profiles profile
    left join public.weekly_xp weekly
      on weekly.user_id = profile.id and weekly.week_start = current_week
    order by case when p_mode = 'weekly' then coalesce(weekly.xp, 0)
             else coalesce(profile.xp, 0) end desc, profile.id
    limit least(greatest(p_limit, 1), 100)
  ), positioned as (
    select row_number() over (order by board_xp desc, id)::integer as board_rank, *
    from ranked
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank', board_rank,
    'user_id', id,
    'xp', board_xp,
    'profile', jsonb_build_object(
      'id', id, 'username', username, 'display_name', display_name,
      'avatar_url', avatar_url, 'avatar_gradient', avatar_gradient, 'bio', bio,
      'current_streak', current_streak, 'longest_streak', longest_streak,
      'total_completions', total_completions, 'total_missed', total_missed,
      'xp', xp, 'level', level, 'reactions_received', reactions_received,
      'reactions_given', reactions_given, 'accent_theme', accent_theme,
      'equipped_border_key', equipped_border_key,
      'equipped_title_key', equipped_title_key,
      'created_at', created_at, 'updated_at', updated_at
    )
  ) order by board_rank), '[]'::jsonb)
  into result from positioned;
  return result;
end;
$$;

revoke all on function public.get_leaderboard_snapshot(text, text, integer)
  from public, anon;
grant execute on function public.get_leaderboard_snapshot(text, text, integer)
  to authenticated;

comment on function public.get_leaderboard_snapshot(text, text, integer) is
  'Public standings ignore blocks and expose only safe public profile fields.';
