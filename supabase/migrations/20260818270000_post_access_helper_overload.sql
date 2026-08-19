-- Private convenience overload for atomic post commands. It derives the
-- policy inputs from the post row, then delegates to the canonical helper.
create or replace function public.can_view_full_post(
  p_post_id uuid,
  p_viewer uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select public.can_view_full_post(
      p_viewer,
      post.user_event_id,
      post.daily_event_id,
      post.user_id,
      coalesce(post.is_community_poll, false)
    )
    from public.posts post
    where post.id = p_post_id
  ), false);
$$;

revoke all on function public.can_view_full_post(uuid, uuid)
  from public, anon, authenticated;
