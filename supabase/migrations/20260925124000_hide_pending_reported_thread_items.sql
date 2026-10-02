-- Reporter-relative hiding applies to the exact reported item, not only posts.
-- Keep lower-severity comments and custom poll responses visible to everyone
-- else while excluding them from the reporter's authoritative snapshots.

create or replace function public.get_comment_thread_snapshot(
  p_post_id uuid,
  p_audience text default 'everyone',
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns setof jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select
    (to_jsonb(comment) - 'idempotency_key' - 'moderation_status') || jsonb_build_object(
      'profile', jsonb_build_object(
        'id', profile.id,
        'username', profile.username,
        'display_name', profile.display_name,
        'avatar_url', profile.avatar_url,
        'avatar_gradient', profile.avatar_gradient,
        'equipped_border_key', profile.equipped_border_key
      ),
      'my_like', exists (
        select 1 from public.comment_likes comment_like
        where comment_like.comment_id = comment.id and comment_like.user_id = auth.uid()
      )
    )
  from public.comments comment
  join public.profiles profile on profile.id = comment.user_id
  where comment.post_id = p_post_id
    and comment.moderation_status = 'visible'
    and not exists (
      select 1 from public.reports report
      where report.reporter_id = auth.uid()
        and report.comment_id = comment.id
        and report.status = 'pending'
    )
    and public.can_view_full_post(p_post_id, auth.uid())
    and p_audience in ('friends', 'everyone')
    and (p_before_created_at is null
      or (comment.created_at, comment.id) < (p_before_created_at, p_before_id))
    and not exists (
      select 1 from public.blocks block
      where (block.blocker_id = auth.uid() and block.blocked_id = comment.user_id)
         or (block.blocked_id = auth.uid() and block.blocker_id = comment.user_id)
    )
    and (
      p_audience = 'everyone'
      or comment.user_id = auth.uid()
      or exists (
        select 1 from public.friendships friendship
        where friendship.status = 'accepted'
          and ((friendship.requester_id = auth.uid() and friendship.addressee_id = comment.user_id)
            or (friendship.addressee_id = auth.uid() and friendship.requester_id = comment.user_id))
      )
    )
  order by comment.created_at desc, comment.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.get_comment_thread_snapshot(uuid, text, timestamptz, uuid, integer)
  from public, anon;
grant execute on function public.get_comment_thread_snapshot(uuid, text, timestamptz, uuid, integer)
  to authenticated;

create or replace function public.get_poll_snapshot_for_feed(
  p_daily_event_id uuid,
  p_audience text default 'friends'
)
returns table (
  option_id uuid,
  challenge_id uuid,
  option_text text,
  option_position integer,
  option_is_other boolean,
  option_created_at timestamptz,
  vote_id uuid,
  user_id uuid,
  custom_text text,
  vote_created_at timestamptz,
  username text,
  display_name text,
  avatar_url text,
  equipped_border_key text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_audience not in ('friends', 'everyone') then raise exception 'Invalid audience'; end if;
  if not public.can_access_daily_event(p_daily_event_id, uid) then return; end if;

  return query
  with event_context as (
    select event.challenge_id
    from public.daily_events event
    where event.id = p_daily_event_id
  ), visible_votes as (
    select vote.id, vote.option_id, vote.user_id, vote.custom_text, vote.created_at
    from public.poll_votes vote
    join public.user_events participant on participant.id = vote.user_event_id
    where participant.daily_event_id = p_daily_event_id
      and vote.moderation_status = 'visible'
      and not exists (
        select 1 from public.reports report
        where report.reporter_id = uid
          and report.poll_vote_id = vote.id
          and report.status = 'pending'
      )
      and not exists (
        select 1 from public.blocks block
        where (block.blocker_id = uid and block.blocked_id = vote.user_id)
           or (block.blocked_id = uid and block.blocker_id = vote.user_id)
      )
      and (
        p_audience = 'everyone' or vote.user_id = uid or exists (
          select 1 from public.friendships friendship
          where friendship.status = 'accepted'
            and ((friendship.requester_id = uid and friendship.addressee_id = vote.user_id)
              or (friendship.addressee_id = uid and friendship.requester_id = vote.user_id))
        )
      )
  )
  select option.id, option.challenge_id, option.text, option.position,
    option.is_other, option.created_at, vote.id, vote.user_id,
    vote.custom_text, vote.created_at, profile.username, profile.display_name,
    profile.avatar_url, profile.equipped_border_key
  from event_context event
  join public.poll_options option on option.challenge_id = event.challenge_id
  left join visible_votes vote on vote.option_id = option.id
  left join public.profiles profile on profile.id = vote.user_id
  order by option.position, vote.created_at;
end;
$$;

revoke all on function public.get_poll_snapshot_for_feed(uuid, text) from public, anon;
grant execute on function public.get_poll_snapshot_for_feed(uuid, text) to authenticated;

comment on function public.get_comment_thread_snapshot(uuid, text, timestamptz, uuid, integer) is
  'Returns authorized visible comments while excluding pending reports for the current reporter.';
comment on function public.get_poll_snapshot_for_feed(uuid, text) is
  'Returns authorized poll results while excluding pending custom-response reports for the current reporter.';
