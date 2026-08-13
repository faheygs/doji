-- Rank directly in Postgres so weekly boards do not first download profiles,
-- then issue a second XP request, and accidentally rank only all-time leaders.

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
    select profile.*
    from public.profiles profile
    where coalesce(profile.is_banned, false) = false
      and coalesce(profile.is_demo_account, false) = false
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = uid and b.blocked_id = profile.id)
           or (b.blocked_id = uid and b.blocker_id = profile.id)
      )
      and (
        p_audience = 'everyone' or profile.id = uid or exists (
          select 1 from public.friendships friendship
          where friendship.status = 'accepted'
            and ((friendship.requester_id = uid and friendship.addressee_id = profile.id)
              or (friendship.addressee_id = uid and friendship.requester_id = profile.id))
        )
      )
  ), ranked as (
    select profile.id as user_id,
           case when p_mode = 'weekly' then coalesce(weekly.xp, 0) else coalesce(profile.xp, 0) end::integer as xp,
           profile
    from visible_profiles profile
    left join public.weekly_xp weekly
      on weekly.user_id = profile.id and weekly.week_start = current_week
    order by case when p_mode = 'weekly' then coalesce(weekly.xp, 0) else coalesce(profile.xp, 0) end desc,
             profile.id
    limit least(greatest(p_limit, 1), 100)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'rank', ranked_position,
      'user_id', user_id,
      'xp', xp,
      'profile', jsonb_build_object(
        'id', (profile).id,
        'username', (profile).username,
        'display_name', (profile).display_name,
        'avatar_url', (profile).avatar_url,
        'avatar_gradient', (profile).avatar_gradient,
        'bio', (profile).bio,
        'current_streak', (profile).current_streak,
        'longest_streak', (profile).longest_streak,
        'total_completions', (profile).total_completions,
        'total_missed', (profile).total_missed,
        'xp', (profile).xp,
        'level', (profile).level,
        'reactions_received', (profile).reactions_received,
        'reactions_given', (profile).reactions_given,
        'accent_theme', (profile).accent_theme,
        'equipped_border_key', (profile).equipped_border_key,
        'equipped_title_key', (profile).equipped_title_key,
        'is_admin', (profile).is_admin,
        'is_banned', (profile).is_banned,
        'is_demo_account', (profile).is_demo_account,
        'created_at', (profile).created_at,
        'updated_at', (profile).updated_at
      )
    ) order by ranked_position
  ), '[]'::jsonb)
  into result
  from (
    select row_number() over (order by xp desc, user_id)::integer as ranked_position, *
    from ranked
  ) ordered;

  return result;
end;
$$;

revoke all on function public.get_leaderboard_snapshot(text, text, integer) from public, anon;
grant execute on function public.get_leaderboard_snapshot(text, text, integer) to authenticated;

create index if not exists weekly_xp_week_xp_user_idx
  on public.weekly_xp (week_start, xp desc, user_id);
create index if not exists profiles_public_xp_idx
  on public.profiles (xp desc, id)
  where coalesce(is_banned, false) = false and coalesce(is_demo_account, false) = false;
