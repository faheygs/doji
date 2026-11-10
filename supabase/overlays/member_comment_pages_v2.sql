-- Additive read boundary. Existing installed-client reads and all writes are unchanged.
begin;
set local lock_timeout = '2s';
do $$ begin
  if not exists(select 1 from pg_index where indexrelid =
    to_regclass('public.comments_thread_page_v2_idx') and indisvalid and indisready) then
    raise exception 'Install and verify the concurrent comment-page index first';
  end if;
  if pg_get_indexdef('public.comments_thread_page_v2_idx'::regclass) <>
    'CREATE INDEX comments_thread_page_v2_idx ON public.comments USING btree (post_id, parent_id, created_at DESC, id DESC) WHERE (moderation_status = ''visible''::text)' then
    raise exception 'Unexpected comment-page index definition';
  end if;
end $$;
create schema if not exists comment_read_private;
revoke all on schema comment_read_private from public, anon, authenticated;

create or replace function comment_read_private.row_visible(
  c public.comments, viewer uuid, audience text
) returns boolean language sql stable security definer set search_path = '' as $$
  select c.moderation_status = 'visible'
    and not public.has_pending_own_comment_report(c.id)
    and not exists(select 1 from public.blocks b
      where (b.blocker_id = viewer and b.blocked_id = c.user_id)
         or (b.blocked_id = viewer and b.blocker_id = c.user_id))
    and (audience = 'everyone' or c.user_id = viewer or exists(
      select 1 from public.friendships f where f.status = 'accepted'
      and ((f.requester_id = viewer and f.addressee_id = c.user_id)
        or (f.addressee_id = viewer and f.requester_id = c.user_id))));
$$;
revoke all on function comment_read_private.row_visible(public.comments,uuid,text)
  from public, anon, authenticated;

create or replace function comment_read_private.project_row(
  c public.comments, viewer uuid, audience text
) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',c.id,'post_id',c.post_id,'user_id',c.user_id,
    'parent_id',c.parent_id,'reply_to_comment_id',c.reply_to_comment_id,
    'body',c.body,'created_at',c.created_at,'updated_at',c.updated_at,
    'body_edited',c.body_edited,'like_count',c.like_count,
    'my_like',exists(select 1 from public.comment_likes l where l.comment_id=c.id and l.user_id=viewer),
    -- Existence is audience-safe and avoids counting an arbitrarily large reply thread.
    'has_replies',c.parent_id is null and exists(select 1 from public.comments reply
      where reply.post_id=c.post_id and reply.parent_id=c.id and reply.moderation_status='visible'
        and comment_read_private.row_visible(reply,viewer,audience)),
    'profile',jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,
      'avatar_url',p.avatar_url,'avatar_gradient',p.avatar_gradient,'equipped_border_key',p.equipped_border_key))
  from public.profiles p where p.id=c.user_id;
$$;
revoke all on function comment_read_private.project_row(public.comments,uuid,text)
  from public, anon, authenticated;

create or replace function public.get_comment_page_v2(
  p_post_id uuid, p_audience text default 'everyone', p_parent_id uuid default null,
  p_cursor_created_at timestamptz default null, p_cursor_id uuid default null,
  p_direction text default 'next', p_limit integer default 50
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  viewer uuid := auth.uid();
  page_limit integer := least(greatest(coalesce(p_limit,50),1),50);
  forward_desc boolean := p_parent_id is null;
  scan_desc boolean;
  predicate text;
  query text;
  items jsonb;
  first_row jsonb;
  last_row jsonb;
  has_before boolean := false;
  has_after boolean := false;
begin
  if viewer is null or not coalesce(public.can_view_full_post(p_post_id,viewer),false) then
    raise exception 'Post is not available' using errcode='42501';
  end if;
  if p_audience is null or p_audience not in ('everyone','friends') or p_direction is null
    or p_direction not in ('next','previous') or
    (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise exception 'Invalid comment-page request' using errcode='22023';
  end if;
  if p_parent_id is not null and not exists(select 1 from public.comments c
    where c.id=p_parent_id and c.post_id=p_post_id and c.parent_id is null
      and comment_read_private.row_visible(c,viewer,p_audience)) then
    raise exception 'Thread is not available' using errcode='42501';
  end if;
  scan_desc := case when p_direction='next' then forward_desc else not forward_desc end;
  -- Only fixed fragments enter SQL text; all request values remain bound parameters.
  predicate := 'c.post_id=$1 and ' || case when p_parent_id is null then 'c.parent_id is null' else 'c.parent_id=$2' end ||
    ' and c.moderation_status=''visible'' and comment_read_private.row_visible(c,$3,$4)';
  query := 'select coalesce(jsonb_agg(comment_read_private.project_row(page,$3,$4) order by page.created_at ' ||
    case when forward_desc then 'desc' else 'asc' end || ',page.id ' ||
    case when forward_desc then 'desc' else 'asc' end || '),''[]''::jsonb) from
    (select c.* from public.comments c where ' || predicate ||
    case when p_cursor_id is null then '' else ' and (c.created_at,c.id) ' ||
      case when scan_desc then '<' else '>' end || ' ($5,$6)' end ||
    ' order by c.created_at ' || case when scan_desc then 'desc' else 'asc' end ||
    ',c.id ' || case when scan_desc then 'desc' else 'asc' end || ' limit $7) page';
  execute query into items using p_post_id,p_parent_id,viewer,p_audience,p_cursor_created_at,p_cursor_id,page_limit;
  first_row := items->0;
  last_row := items->-1;
  if first_row is not null then
    execute 'select exists(select 1 from public.comments c where ' || predicate ||
      ' and (c.created_at,c.id) ' || case when forward_desc then '>' else '<' end || ' ($5,$6))'
      into has_before using p_post_id,p_parent_id,viewer,p_audience,
        (first_row->>'created_at')::timestamptz,(first_row->>'id')::uuid;
    execute 'select exists(select 1 from public.comments c where ' || predicate ||
      ' and (c.created_at,c.id) ' || case when forward_desc then '<' else '>' end || ' ($5,$6))'
      into has_after using p_post_id,p_parent_id,viewer,p_audience,
        (last_row->>'created_at')::timestamptz,(last_row->>'id')::uuid;
  end if;
  return jsonb_build_object('items',items,
    'previous',case when has_before then jsonb_build_object('createdAt',first_row->>'created_at','id',first_row->>'id') end,
    'next',case when has_after then jsonb_build_object('createdAt',last_row->>'created_at','id',last_row->>'id') end);
end;
$$;
revoke all on function public.get_comment_page_v2(uuid,text,uuid,timestamptz,uuid,text,integer)
  from public, anon, authenticated;
grant execute on function public.get_comment_page_v2(uuid,text,uuid,timestamptz,uuid,text,integer) to authenticated;

-- Reconcile only already retained identities. New head rows cannot move a scrolled viewport.
create or replace function public.get_comment_rows_v2(
  p_post_id uuid, p_ids uuid[], p_audience text default 'everyone'
) returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare viewer uuid := auth.uid();
begin
  if viewer is null or not coalesce(public.can_view_full_post(p_post_id,viewer),false) then
    raise exception 'Post is not available' using errcode='42501';
  end if;
  if p_audience is null or p_audience not in ('everyone','friends') or p_ids is null
    or cardinality(p_ids)>50 then
    raise exception 'Invalid comment refresh' using errcode='22023';
  end if;
  return query select comment_read_private.project_row(c,viewer,p_audience)
    from public.comments c where c.post_id=p_post_id and c.id=any(p_ids)
      and comment_read_private.row_visible(c,viewer,p_audience)
      and (c.parent_id is null or exists(select 1 from public.comments parent
        where parent.id=c.parent_id and parent.post_id=c.post_id and parent.parent_id is null
          and comment_read_private.row_visible(parent,viewer,p_audience)));
end;
$$;
revoke all on function public.get_comment_rows_v2(uuid,uuid[],text) from public, anon, authenticated;
grant execute on function public.get_comment_rows_v2(uuid,uuid[],text) to authenticated;
commit;
