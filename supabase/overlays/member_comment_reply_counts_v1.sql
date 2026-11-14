-- Read-only projection upgrade. Install only after the qualified comment-pages v2 boundary.
begin;
set local lock_timeout = '2s';
do $$ begin
  if to_regprocedure('comment_read_private.project_row(public.comments,uuid,text)') is null
    or not exists(select 1 from pg_index where indexrelid =
      to_regclass('public.comments_thread_page_v2_idx') and indisvalid and indisready) then
    raise exception 'Qualified comment-pages v2 boundary required';
  end if;
end $$;

create or replace function comment_read_private.reply_count(
  c public.comments, viewer uuid, audience text
) returns bigint language plpgsql stable security definer set search_path = '' as $$
declare total bigint;
begin
  if c.parent_id is not null then return 0; end if;
  -- A hot root can own almost all replies. Plan each root with its actual IDs:
  -- a cached average-selectivity plan otherwise scans the hot thread for empty roots.
  -- All values stay bound; no caller-controlled SQL text is constructed.
  execute $query$
    select count(*) from public.comments reply
    where reply.post_id=$1 and reply.parent_id=$2 and reply.moderation_status='visible'
      and reply.id not in (select r.comment_id from public.reports r
        where r.reporter_id=$3 and r.status='pending' and r.comment_id is not null)
      and reply.user_id not in (
        select b.blocked_id from public.blocks b where b.blocker_id=$3
        union select b.blocker_id from public.blocks b where b.blocked_id=$3)
      and ($4='everyone' or reply.user_id=$3 or reply.user_id in (
        select f.addressee_id from public.friendships f where f.requester_id=$3 and f.status='accepted'
        union select f.requester_id from public.friendships f where f.addressee_id=$3 and f.status='accepted'))
  $query$ into total using c.post_id,c.id,viewer,audience;
  return total;
end $$;
revoke all on function comment_read_private.reply_count(public.comments,uuid,text)
  from public, anon, authenticated;

create or replace function comment_read_private.project_row(
  c public.comments, viewer uuid, audience text
) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',c.id,'post_id',c.post_id,'user_id',c.user_id,
    'parent_id',c.parent_id,'reply_to_comment_id',c.reply_to_comment_id,
    'body',c.body,'created_at',c.created_at,'updated_at',c.updated_at,
    'body_edited',c.body_edited,'like_count',c.like_count,
    'my_like',exists(select 1 from public.comment_likes l where l.comment_id=c.id and l.user_id=viewer),
    'has_replies',replies.total>0,'reply_count',replies.total,
    'profile',jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,
      'avatar_url',p.avatar_url,'avatar_gradient',p.avatar_gradient,'equipped_border_key',p.equipped_border_key))
  from public.profiles p cross join lateral (
    -- OFFSET fences flattening so the count is computed once for both fields.
    select comment_read_private.reply_count(c,viewer,audience) as total offset 0
  ) replies where p.id=c.user_id;
$$;
revoke all on function comment_read_private.project_row(public.comments,uuid,text)
  from public, anon, authenticated;
commit;
