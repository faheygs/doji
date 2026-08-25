-- PostgREST authenticates the bearer token before this authenticated-only RPC
-- runs. Returning auth.uid() with the capability inputs removes a redundant Auth
-- server request from every Ably token renewal.
create or replace function public.get_realtime_token_capabilities(
  p_post_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  requested_count integer := coalesce(cardinality(p_post_ids), 0);
  is_admin boolean := false;
  authorized_post_ids jsonb := '[]'::jsonb;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if requested_count > 64 then
    raise exception 'Too many realtime post subscriptions' using errcode = '22023';
  end if;

  select coalesce(profile.is_admin, false)
  into is_admin
  from public.profiles profile
  where profile.id = uid;

  if requested_count > 0 then
    select coalesce(jsonb_agg(visible.id order by visible.id), '[]'::jsonb)
    into authorized_post_ids
    from (
      select distinct post_id as id
      from unnest(p_post_ids) post_id
      where post_id is not null
        and public.can_view_full_post(post_id, uid)
    ) visible;
  end if;

  return jsonb_build_object(
    'userId', uid,
    'isAdmin', coalesce(is_admin, false),
    'authorizedPostIds', authorized_post_ids
  );
end;
$$;

revoke all on function public.get_realtime_token_capabilities(uuid[])
  from public, anon;
grant execute on function public.get_realtime_token_capabilities(uuid[])
  to authenticated;

comment on function public.get_realtime_token_capabilities(uuid[]) is
  'Returns authenticated caller identity and bounded realtime capability inputs in one RPC.';
