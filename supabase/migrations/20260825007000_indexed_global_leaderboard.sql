-- The previous Everyone snapshot materialized every visible profile before
-- applying LIMIT. At a large account count that turns every tab open into a
-- full scan and sort. Keep Friends bounded by the accepted-friend cap, but use
-- score indexes directly for global top rows and exact viewer rank.

create index if not exists profiles_leaderboard_xp_idx
  on public.profiles (xp desc, id)
  where coalesce(is_banned, false) = false;

create index if not exists weekly_xp_leaderboard_rank_idx
  on public.weekly_xp (week_start, xp desc, user_id);

create or replace function public.leaderboard_entry_json(
  p_rank integer,
  p_board_xp integer,
  p_profile public.profiles
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'rank', p_rank,
    'user_id', p_profile.id,
    'xp', p_board_xp,
    'profile', jsonb_build_object(
      'id', p_profile.id,
      'username', p_profile.username,
      'display_name', p_profile.display_name,
      'avatar_url', p_profile.avatar_url,
      'avatar_gradient', p_profile.avatar_gradient,
      'bio', p_profile.bio,
      'current_streak', p_profile.current_streak,
      'longest_streak', p_profile.longest_streak,
      'total_completions', p_profile.total_completions,
      'total_missed', p_profile.total_missed,
      'xp', p_profile.xp,
      'level', p_profile.level,
      'reactions_received', p_profile.reactions_received,
      'reactions_given', p_profile.reactions_given,
      'accent_theme', p_profile.accent_theme,
      'equipped_border_key', p_profile.equipped_border_key,
      'equipped_title_key', p_profile.equipped_title_key,
      'created_at', p_profile.created_at,
      'updated_at', p_profile.updated_at
    )
  );
$$;

revoke all on function public.leaderboard_entry_json(integer, integer, public.profiles)
  from public, anon, authenticated;

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
  cap integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  current_week date := date_trunc('week', now() at time zone 'America/Denver')::date;
  result jsonb;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_mode not in ('weekly', 'alltime') then raise exception 'Invalid leaderboard mode'; end if;
  if p_audience not in ('friends', 'everyone') then raise exception 'Invalid audience'; end if;

  if p_audience = 'friends' then
    with candidate_ids as (
      select uid as user_id
      union
      select case
        when friendship.requester_id = uid then friendship.addressee_id
        else friendship.requester_id
      end as user_id
      from public.friendships friendship
      where friendship.status = 'accepted'
        and (friendship.requester_id = uid or friendship.addressee_id = uid)
    ), visible as (
      select profile as profile,
        case when p_mode = 'weekly' then coalesce(weekly.xp, 0)
          else coalesce(profile.xp, 0) end::integer as board_xp
      from candidate_ids candidate
      join public.profiles profile on profile.id = candidate.user_id
      left join public.weekly_xp weekly
        on weekly.user_id = profile.id and weekly.week_start = current_week
      where coalesce(profile.is_banned, false) = false
    ), ranked as (
      select row_number() over (order by board_xp desc, (profile).id)::integer board_rank,
        board_xp, profile
      from visible
    ), selected as (
      select * from ranked order by board_rank limit cap
    ), selected_with_viewer as (
      select * from selected
      union all
      select * from ranked viewer
      where (viewer.profile).id = uid
        and not exists (select 1 from selected top where (top.profile).id = uid)
    )
    select coalesce(
      jsonb_agg(public.leaderboard_entry_json(board_rank, board_xp, profile)
        order by board_rank),
      '[]'::jsonb
    ) into result
    from selected_with_viewer;
    return result;
  end if;

  if p_mode = 'alltime' then
    with top_rows as (
      select row_number() over (order by profile.xp desc, profile.id)::integer board_rank,
        coalesce(profile.xp, 0)::integer board_xp, profile
      from (
        select candidate.*
        from public.profiles candidate
        where coalesce(candidate.is_banned, false) = false
        order by candidate.xp desc, candidate.id
        limit cap
      ) profile
    ), viewer as (
      select (
        1 + (select count(*) from public.profiles competitor
          where coalesce(competitor.is_banned, false) = false
            and (competitor.xp > profile.xp
              or (competitor.xp = profile.xp and competitor.id < profile.id)))
      )::integer board_rank,
      coalesce(profile.xp, 0)::integer board_xp,
      profile
      from public.profiles profile
      where profile.id = uid and coalesce(profile.is_banned, false) = false
    ), selected as (
      select * from top_rows
      union all
      select * from viewer
      where not exists (select 1 from top_rows top where (top.profile).id = uid)
    )
    select coalesce(
      jsonb_agg(public.leaderboard_entry_json(board_rank, board_xp, profile)
        order by board_rank),
      '[]'::jsonb
    ) into result
    from selected;
    return result;
  end if;

  with weekly_candidates as (
    select profile, coalesce(weekly.xp, 0)::integer board_xp
    from public.weekly_xp weekly
    join public.profiles profile on profile.id = weekly.user_id
    where weekly.week_start = current_week
      and coalesce(profile.is_banned, false) = false
    order by weekly.xp desc, weekly.user_id
    limit cap
  ), zero_candidates as (
    select profile, 0::integer board_xp
    from public.profiles profile
    where coalesce(profile.is_banned, false) = false
      and not exists (
        select 1 from public.weekly_xp weekly
        where weekly.week_start = current_week and weekly.user_id = profile.id
      )
    order by profile.id
    limit cap
  ), top_rows as (
    select row_number() over (order by board_xp desc, (profile).id)::integer board_rank,
      board_xp, profile
    from (
      select * from weekly_candidates
      union all
      select * from zero_candidates
      order by board_xp desc, (profile).id
      limit cap
    ) candidates
  ), viewer_score as (
    select profile, coalesce(weekly.xp, 0)::integer board_xp
    from public.profiles profile
    left join public.weekly_xp weekly
      on weekly.week_start = current_week and weekly.user_id = profile.id
    where profile.id = uid and coalesce(profile.is_banned, false) = false
  ), viewer as (
    select (
      1
      + (select count(*)
         from public.weekly_xp weekly
         join public.profiles competitor on competitor.id = weekly.user_id
         where weekly.week_start = current_week
           and coalesce(competitor.is_banned, false) = false
           and (weekly.xp > viewer_score.board_xp
             or (weekly.xp = viewer_score.board_xp and competitor.id < uid)))
      + (select count(*)
         from public.profiles competitor
         where coalesce(competitor.is_banned, false) = false
           and not exists (
             select 1 from public.weekly_xp weekly
             where weekly.week_start = current_week and weekly.user_id = competitor.id
           )
           and (0 > viewer_score.board_xp
             or (viewer_score.board_xp = 0 and competitor.id < uid)))
    )::integer board_rank,
    viewer_score.board_xp,
    viewer_score.profile
    from viewer_score
  ), selected as (
    select * from top_rows
    union all
    select * from viewer
    where not exists (select 1 from top_rows top where (top.profile).id = uid)
  )
  select coalesce(
    jsonb_agg(public.leaderboard_entry_json(board_rank, board_xp, profile)
      order by board_rank),
    '[]'::jsonb
  ) into result
  from selected;
  return result;
end;
$$;

revoke all on function public.get_leaderboard_snapshot(text, text, integer)
  from public, anon;
grant execute on function public.get_leaderboard_snapshot(text, text, integer)
  to authenticated;

comment on function public.get_leaderboard_snapshot(text, text, integer) is
  'Indexed global top window plus exact viewer rank; Friends remains accepted friends plus self.';
