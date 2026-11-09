-- Restore the reviewed username-only contract without deleting profile/history data.
create or replace function public.search_profiles(
  p_query text default '',
  p_limit integer default 20
)
returns setof jsonb language sql stable security definer set search_path = '' as $$
  with candidates as (
    select profile.*
    from public.profiles profile
    where auth.uid() is not null
      and profile.id <> auth.uid()
      and coalesce(profile.is_banned, false) = false
      and coalesce(profile.is_demo_account, false) = false
      and not exists (
        select 1 from public.blocks block
        where (block.blocker_id = auth.uid() and block.blocked_id = profile.id)
           or (block.blocked_id = auth.uid() and block.blocker_id = profile.id)
      )
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
    'id', profile.id, 'username', profile.username,
    'display_name', profile.display_name, 'avatar_url', profile.avatar_url,
    'avatar_gradient', profile.avatar_gradient,
    'equipped_border_key', profile.equipped_border_key,
    'friendship_status', case
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
  ) from candidates profile;
$$;
drop index if exists public.profiles_display_name_search_v1_idx;
