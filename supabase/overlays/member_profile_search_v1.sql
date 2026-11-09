-- Public display names contain first/last names; no private identity fields enter search.
create index if not exists profiles_display_name_search_v1_idx
  on public.profiles using gin (to_tsvector('simple', coalesce(display_name, '')));

create or replace function public.search_profiles(
  p_query text default '', p_limit integer default 20
)
returns setof jsonb language sql stable security definer set search_path = '' as $$
  with input as (
    select left(lower(regexp_replace(btrim(coalesce(p_query, '')), '\s+', ' ', 'g')), 101) as q
  ), search as (
    select q,
      (select string_agg(quote_literal(token) || ':*', ' & ')
       from unnest(tsvector_to_array(to_tsvector('simple', q))) token)::tsquery as names,
      replace(replace(replace(q, chr(92), chr(92)||chr(92)), '%', chr(92)||'%'),
        '_', chr(92)||'_') || '%' as username_prefix
    from input
  ), candidates as (
    select profile.*, search.q as normalized_query,
      case when profile.username = search.q then 0
           when lower(profile.display_name) = search.q then 1
           when profile.username like search.username_prefix then 2 else 3 end as match_rank
    from public.profiles profile cross join search
    where auth.uid() is not null and profile.id <> auth.uid()
      and coalesce(profile.is_banned, false) = false
      and coalesce(profile.is_demo_account, false) = false
      and not exists (
        select 1 from public.blocks block
        where (block.blocker_id = auth.uid() and block.blocked_id = profile.id)
           or (block.blocked_id = auth.uid() and block.blocker_id = profile.id)
      )
      and (search.q = '' or char_length(search.q) between 2 and 100)
      and (search.q = '' or profile.username like search.username_prefix
        or to_tsvector('simple', coalesce(profile.display_name, '')) @@ search.names)
    order by match_rank,
      case when search.q = '' then profile.created_at end desc, profile.username, profile.id
    limit least(greatest(coalesce(p_limit, 20), 1), 30)
  )
  select jsonb_build_object(
    'id', profile.id, 'username', profile.username,
    'display_name', profile.display_name, 'avatar_url', profile.avatar_url,
    'avatar_gradient', profile.avatar_gradient,
    'equipped_border_key', profile.equipped_border_key,
    'friendship_status', case
      when exists (
        select 1 from public.friendships friendship where friendship.status = 'accepted'
          and ((friendship.requester_id = auth.uid() and friendship.addressee_id = profile.id)
            or (friendship.addressee_id = auth.uid() and friendship.requester_id = profile.id))
      ) then 'friends'
      when exists (
        select 1 from public.friendships friendship where friendship.status = 'pending'
          and friendship.requester_id = auth.uid() and friendship.addressee_id = profile.id
      ) then 'pending_out'
      when exists (
        select 1 from public.friendships friendship where friendship.status = 'pending'
          and friendship.addressee_id = auth.uid() and friendship.requester_id = profile.id
      ) then 'pending_in'
      else 'none'
    end
  ) from candidates profile order by profile.match_rank,
    case when profile.normalized_query = '' then profile.created_at end desc,
    profile.username, profile.id;
$$;
