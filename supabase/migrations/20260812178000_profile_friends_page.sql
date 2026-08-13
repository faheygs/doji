create or replace function public.list_profile_friends_page(
  p_profile_user_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  friend_id uuid,
  username text,
  display_name text,
  avatar_url text,
  avatar_gradient text[],
  equipped_border_key text
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (profile.id)
    profile.id,
    profile.username,
    profile.display_name,
    profile.avatar_url,
    profile.avatar_gradient,
    profile.equipped_border_key
  from public.friendships friendship
  join public.profiles profile on profile.id = case
    when friendship.requester_id = p_profile_user_id then friendship.addressee_id
    else friendship.requester_id
  end
  where friendship.status = 'accepted'
    and (friendship.requester_id = p_profile_user_id or friendship.addressee_id = p_profile_user_id)
  order by profile.id, lower(profile.display_name), lower(profile.username)
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.list_profile_friends_page(uuid, integer, integer) from public, anon;
grant execute on function public.list_profile_friends_page(uuid, integer, integer) to authenticated;
