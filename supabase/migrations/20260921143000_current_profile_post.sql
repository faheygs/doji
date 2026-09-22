-- A profile exposes at most the post from the authoritative current Doji.
-- When pre-live advances the active occurrence, the prior post immediately
-- disappears from profiles just as it disappears from the feed.

create index if not exists posts_current_profile_idx
  on public.posts (daily_event_id, user_id)
  where is_community_poll is not true and coalesce(is_demo, false) is false;

create or replace function public.get_post_detail(p_post_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select (to_jsonb(post) - 'idempotency_key') || jsonb_build_object(
    'profile', case when profile.id is null then null else jsonb_build_object(
      'id', profile.id, 'username', profile.username,
      'display_name', profile.display_name, 'avatar_url', profile.avatar_url,
      'avatar_gradient', profile.avatar_gradient,
      'equipped_border_key', profile.equipped_border_key,
      'equipped_title_key', profile.equipped_title_key
    ) end,
    'challenge', to_jsonb(challenge),
    'daily_event', to_jsonb(event) || jsonb_build_object('challenge', to_jsonb(challenge))
  )
  from public.posts post
  join public.daily_events event on event.id = post.daily_event_id
  join public.challenges challenge on challenge.id = event.challenge_id
  left join public.profiles profile on profile.id = post.user_id
  where post.id = p_post_id
    and post.daily_event_id = (
      select current_event.id
      from public.daily_events current_event
      where current_event.activated_at is not null or current_event.prelive_at is not null
      order by coalesce(current_event.activated_at, current_event.prelive_at) desc,
               current_event.created_at desc
      limit 1
    )
    and auth.uid() is not null
    and public.can_view_full_post(
      auth.uid(), post.user_event_id, post.daily_event_id,
      post.user_id, post.is_community_poll
    )
    and not exists (
      select 1 from public.blocks block
      where (block.blocker_id = auth.uid() and block.blocked_id = post.user_id)
         or (block.blocker_id = post.user_id and block.blocked_id = auth.uid())
    );
$$;

revoke all on function public.get_post_detail(uuid) from public, anon;
grant execute on function public.get_post_detail(uuid) to authenticated;

create or replace function public.get_current_profile_post(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  current_event_id uuid;
  current_post_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select event.id
  into current_event_id
  from public.daily_events event
  where event.activated_at is not null or event.prelive_at is not null
  order by coalesce(event.activated_at, event.prelive_at) desc, event.created_at desc
  limit 1;

  if current_event_id is null then
    return null;
  end if;

  select post.id
  into current_post_id
  from public.posts post
  join public.profiles profile on profile.id = post.user_id
  where post.daily_event_id = current_event_id
    and post.user_id = p_user_id
    and post.is_community_poll is not true
    and coalesce(post.is_demo, false) is false
    and coalesce(profile.is_banned, false) is false
    and coalesce(profile.is_demo_account, false) is false
  order by post.created_at desc, post.id desc
  limit 1;

  if current_post_id is null then
    return null;
  end if;

  return public.get_post_detail(current_post_id);
end;
$$;

revoke all on function public.get_current_profile_post(uuid) from public, anon;
grant execute on function public.get_current_profile_post(uuid) to authenticated;

comment on function public.get_current_profile_post(uuid) is
  'Returns the authorized post for one profile in the current authoritative Doji only.';

comment on function public.get_post_detail(uuid) is
  'Returns one authorized post only while it belongs to the authoritative current Doji.';
