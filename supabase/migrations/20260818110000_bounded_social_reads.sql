-- Bound every interactive social read and move relationship joins into one
-- indexed server query. A large friend graph or viral comment thread must not
-- become an unbounded handset response or an N+1 request waterfall.

create index if not exists profiles_username_prefix_idx
  on public.profiles (username text_pattern_ops);

create or replace function public.search_profiles(
  p_query text default '',
  p_limit integer default 20
)
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (select auth.uid() id), candidates as (
    select profile.*
    from public.profiles profile, viewer
    where profile.id <> viewer.id
      and coalesce(profile.is_banned, false) = false
      and coalesce(profile.is_demo_account, false) = false
      and (
        nullif(lower(trim(p_query)), '') is null
        or profile.username like lower(trim(p_query)) || '%'
      )
    order by
      case when nullif(lower(trim(p_query)), '') is null then profile.created_at end desc,
      profile.username
    limit least(greatest(coalesce(p_limit, 20), 1), 30)
  )
  select jsonb_build_object(
    'id', profile.id,
    'username', profile.username,
    'display_name', profile.display_name,
    'avatar_url', profile.avatar_url,
    'avatar_gradient', profile.avatar_gradient,
    'bio', profile.bio,
    'current_streak', profile.current_streak,
    'longest_streak', profile.longest_streak,
    'total_completions', profile.total_completions,
    'total_missed', profile.total_missed,
    'xp', profile.xp,
    'level', profile.level,
    'reactions_received', profile.reactions_received,
    'reactions_given', profile.reactions_given,
    'accent_theme', profile.accent_theme,
    'equipped_border_key', profile.equipped_border_key,
    'equipped_title_key', profile.equipped_title_key,
    'created_at', profile.created_at,
    'updated_at', profile.updated_at,
    'friendship_status', case
      when exists (
        select 1 from public.blocks block
        where (block.blocker_id = auth.uid() and block.blocked_id = profile.id)
           or (block.blocked_id = auth.uid() and block.blocker_id = profile.id)
      ) then 'blocked'
      when exists (
        select 1 from public.friendships friendship
        where friendship.status = 'accepted'
          and ((friendship.requester_id = auth.uid() and friendship.addressee_id = profile.id)
            or (friendship.addressee_id = auth.uid() and friendship.requester_id = profile.id))
      ) then 'friends'
      when exists (
        select 1 from public.friendships friendship
        where friendship.status = 'pending'
          and friendship.requester_id = auth.uid() and friendship.addressee_id = profile.id
      ) then 'pending_out'
      when exists (
        select 1 from public.friendships friendship
        where friendship.status = 'pending'
          and friendship.addressee_id = auth.uid() and friendship.requester_id = profile.id
      ) then 'pending_in'
      else 'none'
    end
  )
  from candidates profile;
$$;

create or replace function public.search_mentionable_profiles(
  p_query text default '',
  p_limit integer default 8
)
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', profile.id,
    'username', profile.username,
    'display_name', profile.display_name,
    'avatar_url', profile.avatar_url,
    'avatar_gradient', profile.avatar_gradient,
    'equipped_border_key', profile.equipped_border_key
  )
  from public.profiles profile
  where (
      profile.id = auth.uid()
      or exists (
        select 1 from public.friendships friendship
        where friendship.status = 'accepted'
          and ((friendship.requester_id = auth.uid() and friendship.addressee_id = profile.id)
            or (friendship.addressee_id = auth.uid() and friendship.requester_id = profile.id))
      )
    )
    and not exists (
      select 1 from public.blocks block
      where (block.blocker_id = auth.uid() and block.blocked_id = profile.id)
         or (block.blocked_id = auth.uid() and block.blocker_id = profile.id)
    )
    and (
      nullif(lower(trim(p_query)), '') is null
      or profile.username like lower(trim(p_query)) || '%'
    )
  order by profile.username
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;

drop function if exists public.get_comment_thread_snapshot(uuid, text);
create function public.get_comment_thread_snapshot(
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
    (to_jsonb(comment) - 'idempotency_key') || jsonb_build_object(
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

revoke all on function public.search_profiles(text, integer) from public, anon;
revoke all on function public.search_mentionable_profiles(text, integer) from public, anon;
revoke all on function public.get_comment_thread_snapshot(uuid, text, timestamptz, uuid, integer)
  from public, anon;
grant execute on function public.search_profiles(text, integer) to authenticated;
grant execute on function public.search_mentionable_profiles(text, integer) to authenticated;
grant execute on function public.get_comment_thread_snapshot(uuid, text, timestamptz, uuid, integer)
  to authenticated;
