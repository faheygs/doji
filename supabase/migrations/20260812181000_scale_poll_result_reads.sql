-- Everyone totals come from 128 fixed shards and previews use a covering
-- index, so result hydration remains bounded as participation grows.

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

  if p_audience = 'everyone' then
    with options as (
      select option.* from public.daily_events event
      join public.poll_options option on option.challenge_id = event.challenge_id
      where event.id = p_daily_event_id
    ), totals as (
      select shard.option_id, sum(shard.vote_count)::integer vote_count
      from public.poll_vote_count_shards shard
      where shard.daily_event_id = p_daily_event_id group by shard.option_id
    ), blocked as (
      select vote.option_id, count(*)::integer vote_count
      from public.poll_votes vote
      where vote.daily_event_id = p_daily_event_id and exists (
        select 1 from public.blocks block
        where (block.blocker_id = uid and block.blocked_id = vote.user_id)
           or (block.blocked_id = uid and block.blocker_id = vote.user_id)
      ) group by vote.option_id
    ), mine as (
      select vote.option_id from public.poll_votes vote
      where vote.daily_event_id = p_daily_event_id and vote.user_id = uid
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'option_id', option.id,
      'challenge_id', option.challenge_id,
      'option_text', option.text,
      'option_position', option.position,
      'option_is_other', option.is_other,
      'option_created_at', option.created_at,
      'vote_count', greatest(coalesce(total.vote_count, 0) - coalesce(blocked.vote_count, 0), 0),
      'is_my_vote', mine.option_id is not null,
      'preview_voters', coalesce(previews.voters, '[]'::jsonb)
    ) order by option.position), '[]'::jsonb)
    into result
    from options option
    left join totals total on total.option_id = option.id
    left join blocked on blocked.option_id = option.id
    left join mine on mine.option_id = option.id
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'vote_id', latest.id,
        'user_id', latest.user_id,
        'username', profile.username,
        'display_name', profile.display_name,
        'avatar_url', profile.avatar_url,
        'equipped_border_key', profile.equipped_border_key
      ) order by latest.created_at desc) voters
      from (
        select vote.id, vote.user_id, vote.created_at
        from public.poll_votes vote
        where vote.daily_event_id = p_daily_event_id and vote.option_id = option.id
          and not exists (
            select 1 from public.blocks block
            where (block.blocker_id = uid and block.blocked_id = vote.user_id)
               or (block.blocked_id = uid and block.blocker_id = vote.user_id)
          )
        order by vote.created_at desc limit 4
      ) latest join public.profiles profile on profile.id = latest.user_id
    ) previews on true;
    return result;
  end if;

  with friend_ids as (
    select uid as user_id
    union
    select case when friendship.requester_id = uid
      then friendship.addressee_id else friendship.requester_id end
    from public.friendships friendship
    where friendship.status = 'accepted'
      and (friendship.requester_id = uid or friendship.addressee_id = uid)
  ), visible_votes as (
    select vote.id, vote.option_id, vote.user_id, vote.created_at,
      row_number() over (partition by vote.option_id order by vote.created_at desc) preview_rank
    from public.poll_votes vote
    where vote.daily_event_id = p_daily_event_id
      and vote.user_id in (select friend.user_id from friend_ids friend)
      and not exists (
        select 1 from public.blocks block
        where (block.blocker_id = uid and block.blocked_id = vote.user_id)
           or (block.blocked_id = uid and block.blocker_id = vote.user_id)
      )
  ), totals as (
    select vote.option_id, count(*)::integer vote_count,
      bool_or(vote.user_id = uid) is_my_vote,
      coalesce(jsonb_agg(jsonb_build_object(
        'vote_id', vote.id,
        'user_id', vote.user_id,
        'username', profile.username,
        'display_name', profile.display_name,
        'avatar_url', profile.avatar_url,
        'equipped_border_key', profile.equipped_border_key
      ) order by vote.created_at desc) filter (where vote.preview_rank <= 4), '[]'::jsonb) preview_voters
    from visible_votes vote join public.profiles profile on profile.id = vote.user_id
    group by vote.option_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'option_id', option.id,
    'challenge_id', option.challenge_id,
    'option_text', option.text,
    'option_position', option.position,
    'option_is_other', option.is_other,
    'option_created_at', option.created_at,
    'vote_count', coalesce(total.vote_count, 0),
    'is_my_vote', coalesce(total.is_my_vote, false),
    'preview_voters', coalesce(total.preview_voters, '[]'::jsonb)
  ) order by option.position), '[]'::jsonb)
  into result
  from public.daily_events event
  join public.poll_options option on option.challenge_id = event.challenge_id
  left join totals total on total.option_id = option.id
  where event.id = p_daily_event_id;
  return result;
end;
$$;

revoke all on function public.get_poll_results_summary(uuid, text) from public, anon;
grant execute on function public.get_poll_results_summary(uuid, text) to authenticated;
