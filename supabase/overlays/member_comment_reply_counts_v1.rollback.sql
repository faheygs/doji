-- Restore the original v2 projection; retain comments, likes, receipts and the paging index.
begin;
set local lock_timeout = '2s';
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
drop function if exists comment_read_private.reply_count(public.comments,uuid,text);
commit;
