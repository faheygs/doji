-- One round trip for an authorized comment thread, including public author
-- presentation and the viewer's like state. This replaces the client-side
-- comments -> likes -> friend graph waterfall.

create or replace function public.get_comment_thread_snapshot(
  p_post_id uuid,
  p_audience text default 'everyone'
)
returns setof jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select
    (to_jsonb(c) - 'idempotency_key') || jsonb_build_object(
      'profile', jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'equipped_border_key', p.equipped_border_key
      ),
      'my_like', exists (
        select 1
        from public.comment_likes cl
        where cl.comment_id = c.id
          and cl.user_id = auth.uid()
      )
    )
  from public.comments c
  join public.profiles p on p.id = c.user_id
  where c.post_id = p_post_id
    and p_audience in ('friends', 'everyone')
    and not exists (
      select 1
      from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = c.user_id)
         or (b.blocked_id = auth.uid() and b.blocker_id = c.user_id)
    )
    and (
      p_audience = 'everyone'
      or c.user_id = auth.uid()
      or exists (
        select 1
        from public.friendships f
        where f.status = 'accepted'
          and (
            (f.requester_id = auth.uid() and f.addressee_id = c.user_id)
            or (f.addressee_id = auth.uid() and f.requester_id = c.user_id)
          )
      )
    )
  order by c.created_at asc;
$$;

revoke all on function public.get_comment_thread_snapshot(uuid, text) from public;
grant execute on function public.get_comment_thread_snapshot(uuid, text) to authenticated;
