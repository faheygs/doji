-- Repair two functions whose deferred SQL validation exposed errors only after
-- the coordinated production migration set was installed.

create or replace function public.sync_notification_center_state(
  p_cleared_at timestamptz,
  p_last_opened_at timestamptz,
  p_dismissals jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  server_now timestamptz := clock_timestamp();
  safe_cleared_at timestamptz;
  safe_opened_at timestamptz;
  state_row public.notification_center_state%rowtype;
  dismissal_count bigint;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_dismissals is null or jsonb_typeof(p_dismissals) <> 'object' then
    raise exception 'Invalid dismissals';
  end if;

  select count(*) into dismissal_count
  from pg_catalog.jsonb_object_keys(p_dismissals);
  if dismissal_count > 2000 then raise exception 'Too many dismissals'; end if;

  safe_cleared_at := case
    when p_cleared_at is null then null
    else least(p_cleared_at, server_now)
  end;
  safe_opened_at := case
    when p_last_opened_at is null then null
    else least(p_last_opened_at, server_now)
  end;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(uid::text || ':notification-center', 0)
  );

  insert into public.notification_center_state (user_id, cleared_at, last_opened_at, updated_at)
  values (uid, safe_cleared_at, safe_opened_at, server_now)
  on conflict (user_id) do update set
    cleared_at = case
      when public.notification_center_state.cleared_at is null then excluded.cleared_at
      when excluded.cleared_at is null then public.notification_center_state.cleared_at
      else greatest(public.notification_center_state.cleared_at, excluded.cleared_at)
    end,
    last_opened_at = case
      when public.notification_center_state.last_opened_at is null then excluded.last_opened_at
      when excluded.last_opened_at is null then public.notification_center_state.last_opened_at
      else greatest(public.notification_center_state.last_opened_at, excluded.last_opened_at)
    end,
    updated_at = server_now
  returning * into state_row;

  insert into public.notification_dismissals (user_id, notification_key, dismissed_at)
  select uid, entry.key, least(entry.value::timestamptz, server_now)
  from pg_catalog.jsonb_each_text(p_dismissals) entry
  where length(entry.key) between 1 and 500
  on conflict (user_id, notification_key) do update
  set dismissed_at = greatest(
    public.notification_dismissals.dismissed_at,
    excluded.dismissed_at
  );

  return to_jsonb(state_row) || jsonb_build_object('server_now', server_now);
end;
$$;

revoke all on function public.sync_notification_center_state(
  timestamptz, timestamptz, jsonb
) from public, anon;
grant execute on function public.sync_notification_center_state(
  timestamptz, timestamptz, jsonb
) to authenticated;

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
      end
      from public.friendships friendship
      where friendship.status = 'accepted'
        and (friendship.requester_id = uid or friendship.addressee_id = uid)
    ), visible as (
      select profile.id as user_id,
        case when p_mode = 'weekly' then coalesce(weekly.xp, 0)
          else coalesce(profile.xp, 0) end::integer as board_xp
      from candidate_ids candidate
      join public.profiles profile on profile.id = candidate.user_id
      left join public.weekly_xp weekly
        on weekly.user_id = profile.id and weekly.week_start = current_week
      where coalesce(profile.is_banned, false) = false
    ), ranked as (
      select row_number() over (order by board_xp desc, user_id)::integer board_rank,
        board_xp, user_id
      from visible
    ), selected as (
      select board_rank, board_xp, user_id
      from ranked
      order by board_rank
      limit cap
    ), selected_with_viewer as (
      select board_rank, board_xp, user_id from selected
      union all
      select viewer.board_rank, viewer.board_xp, viewer.user_id
      from ranked viewer
      where viewer.user_id = uid
        and not exists (select 1 from selected top where top.user_id = uid)
    )
    select coalesce(
      jsonb_agg(
        public.leaderboard_entry_json(row.board_rank, row.board_xp, profile)
        order by row.board_rank
      ),
      '[]'::jsonb
    ) into result
    from selected_with_viewer row
    join public.profiles profile on profile.id = row.user_id;
    return result;
  end if;

  if p_mode = 'alltime' then
    with top_candidates as (
      select profile.id as user_id, coalesce(profile.xp, 0)::integer board_xp
      from public.profiles profile
      where coalesce(profile.is_banned, false) = false
      order by profile.xp desc, profile.id
      limit cap
    ), top_rows as (
      select row_number() over (order by board_xp desc, user_id)::integer board_rank,
        board_xp, user_id
      from top_candidates
    ), viewer as (
      select (
        1 + (select count(*) from public.profiles competitor
          where coalesce(competitor.is_banned, false) = false
            and (competitor.xp > profile.xp
              or (competitor.xp = profile.xp and competitor.id < profile.id)))
      )::integer board_rank,
      coalesce(profile.xp, 0)::integer board_xp,
      profile.id as user_id
      from public.profiles profile
      where profile.id = uid and coalesce(profile.is_banned, false) = false
    ), selected as (
      select board_rank, board_xp, user_id from top_rows
      union all
      select viewer.board_rank, viewer.board_xp, viewer.user_id
      from viewer
      where not exists (select 1 from top_rows top where top.user_id = uid)
    )
    select coalesce(
      jsonb_agg(
        public.leaderboard_entry_json(row.board_rank, row.board_xp, profile)
        order by row.board_rank
      ),
      '[]'::jsonb
    ) into result
    from selected row
    join public.profiles profile on profile.id = row.user_id;
    return result;
  end if;

  with weekly_candidates as (
    select profile.id as user_id, coalesce(weekly.xp, 0)::integer board_xp
    from public.weekly_xp weekly
    join public.profiles profile on profile.id = weekly.user_id
    where weekly.week_start = current_week
      and coalesce(profile.is_banned, false) = false
    order by weekly.xp desc, weekly.user_id
    limit cap
  ), zero_candidates as (
    select profile.id as user_id, 0::integer board_xp
    from public.profiles profile
    where coalesce(profile.is_banned, false) = false
      and not exists (
        select 1 from public.weekly_xp weekly
        where weekly.week_start = current_week and weekly.user_id = profile.id
      )
    order by profile.id
    limit cap
  ), top_rows as (
    select row_number() over (order by board_xp desc, user_id)::integer board_rank,
      board_xp, user_id
    from (
      select user_id, board_xp from weekly_candidates
      union all
      select user_id, board_xp from zero_candidates
      order by board_xp desc, user_id
      limit cap
    ) candidates
  ), viewer_score as (
    select profile.id as user_id, coalesce(weekly.xp, 0)::integer board_xp
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
    viewer_score.user_id
    from viewer_score
  ), selected as (
    select board_rank, board_xp, user_id from top_rows
    union all
    select viewer.board_rank, viewer.board_xp, viewer.user_id
    from viewer
    where not exists (select 1 from top_rows top where top.user_id = uid)
  )
  select coalesce(
    jsonb_agg(
      public.leaderboard_entry_json(row.board_rank, row.board_xp, profile)
      order by row.board_rank
    ),
    '[]'::jsonb
  ) into result
  from selected row
  join public.profiles profile on profile.id = row.user_id;
  return result;
end;
$$;

revoke all on function public.get_leaderboard_snapshot(text, text, integer)
  from public, anon;
grant execute on function public.get_leaderboard_snapshot(text, text, integer)
  to authenticated;

comment on function public.get_leaderboard_snapshot(text, text, integer) is
  'Indexed global top window plus exact viewer rank; Friends remains accepted friends plus self.';
