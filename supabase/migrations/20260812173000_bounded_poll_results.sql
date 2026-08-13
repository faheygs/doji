-- Poll cards must stay constant-size as participation grows. The summary returns
-- one row per option plus four preview avatars; voter details are fetched only
-- when opened and are strictly paginated.

create or replace function public.get_poll_results_summary(
  p_daily_event_id uuid,
  p_audience text default 'friends'
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
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_audience not in ('friends', 'everyone') then raise exception 'Invalid audience'; end if;
  if not public.can_access_daily_event(p_daily_event_id, uid) then return '[]'::jsonb; end if;

  with visible_votes as (
    select vote.id, vote.option_id, vote.user_id, vote.custom_text, vote.created_at,
           row_number() over (partition by vote.option_id order by vote.created_at desc) as preview_rank
    from public.poll_votes vote
    join public.user_events participant on participant.id = vote.user_event_id
    where participant.daily_event_id = p_daily_event_id
      and (
        p_audience = 'everyone' or vote.user_id = uid or exists (
          select 1 from public.friendships friendship
          where friendship.status = 'accepted'
            and ((friendship.requester_id = uid and friendship.addressee_id = vote.user_id)
              or (friendship.addressee_id = uid and friendship.requester_id = vote.user_id))
        )
      )
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = uid and b.blocked_id = vote.user_id)
           or (b.blocked_id = uid and b.blocker_id = vote.user_id)
      )
  ), option_totals as (
    select vote.option_id,
           count(*)::integer as vote_count,
           bool_or(vote.user_id = uid) as is_my_vote,
           coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'vote_id', vote.id,
                 'user_id', vote.user_id,
                 'username', profile.username,
                 'display_name', profile.display_name,
                 'avatar_url', profile.avatar_url,
                 'equipped_border_key', profile.equipped_border_key
               ) order by vote.created_at desc
             ) filter (where vote.preview_rank <= 4),
             '[]'::jsonb
           ) as preview_voters
    from visible_votes vote
    join public.profiles profile on profile.id = vote.user_id
    group by vote.option_id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'option_id', option.id,
      'challenge_id', option.challenge_id,
      'option_text', option.text,
      'option_position', option.position,
      'option_is_other', option.is_other,
      'option_created_at', option.created_at,
      'vote_count', coalesce(total.vote_count, 0),
      'is_my_vote', coalesce(total.is_my_vote, false),
      'preview_voters', coalesce(total.preview_voters, '[]'::jsonb)
    ) order by option.position
  ), '[]'::jsonb)
  into result
  from public.daily_events event
  join public.poll_options option on option.challenge_id = event.challenge_id
  left join option_totals total on total.option_id = option.id
  where event.id = p_daily_event_id;

  return result;
end;
$$;

create or replace function public.get_poll_option_voters_page(
  p_daily_event_id uuid,
  p_option_id uuid,
  p_audience text default 'friends',
  p_limit integer default 40,
  p_offset integer default 0
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
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_audience not in ('friends', 'everyone') then raise exception 'Invalid audience'; end if;
  if not public.can_access_daily_event(p_daily_event_id, uid) then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(to_jsonb(page_rows) order by page_rows.created_at desc), '[]'::jsonb)
  into result
  from (
    select vote.id as vote_id, vote.user_id, vote.custom_text, vote.created_at,
           profile.username, profile.display_name, profile.avatar_url,
           profile.equipped_border_key,
           (select count(*)::integer from public.poll_vote_likes likes where likes.poll_vote_id = vote.id) as like_count,
           exists (
             select 1 from public.poll_vote_likes likes
             where likes.poll_vote_id = vote.id and likes.user_id = uid
           ) as my_like
    from public.poll_votes vote
    join public.user_events participant on participant.id = vote.user_event_id
    join public.profiles profile on profile.id = vote.user_id
    where participant.daily_event_id = p_daily_event_id
      and vote.option_id = p_option_id
      and (
        p_audience = 'everyone' or vote.user_id = uid or exists (
          select 1 from public.friendships friendship
          where friendship.status = 'accepted'
            and ((friendship.requester_id = uid and friendship.addressee_id = vote.user_id)
              or (friendship.addressee_id = uid and friendship.requester_id = vote.user_id))
        )
      )
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = uid and b.blocked_id = vote.user_id)
           or (b.blocked_id = uid and b.blocker_id = vote.user_id)
      )
    order by vote.created_at desc
    limit least(greatest(p_limit, 1), 50)
    offset greatest(p_offset, 0)
  ) page_rows;

  return result;
end;
$$;

revoke all on function public.get_poll_results_summary(uuid, text) from public, anon;
revoke all on function public.get_poll_option_voters_page(uuid, uuid, text, integer, integer) from public, anon;
grant execute on function public.get_poll_results_summary(uuid, text) to authenticated;
grant execute on function public.get_poll_option_voters_page(uuid, uuid, text, integer, integer) to authenticated;

create index if not exists poll_vote_likes_vote_user_idx
  on public.poll_vote_likes (poll_vote_id, user_id);
