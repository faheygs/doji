-- The member comment snapshot is SECURITY INVOKER. Reading public.reports
-- directly from it inherits the intentionally admin-only reports SELECT policy,
-- which made every ordinary member comment read fail with 403 after the
-- reporter-relative visibility filter was added. Keep the reports table private
-- and expose only the one viewer-relative boolean the snapshot needs.

create or replace function public.has_pending_own_comment_report(p_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and p_comment_id is not null
    and exists (
      select 1
      from public.reports report
      where report.reporter_id = auth.uid()
        and report.comment_id = p_comment_id
        and report.status = 'pending'
    );
$$;

revoke all on function public.has_pending_own_comment_report(uuid) from public, anon;
grant execute on function public.has_pending_own_comment_report(uuid) to authenticated;

create or replace function public.get_comment_thread_snapshot(
  p_post_id uuid,
  p_audience text default 'everyone',
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns setof jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select
    (to_jsonb(comment) - 'idempotency_key' - 'moderation_status') || jsonb_build_object(
      'profile', jsonb_build_object(
        'id', profile.id,
        'username', profile.username,
        'display_name', profile.display_name,
        'avatar_url', profile.avatar_url,
        'avatar_gradient', profile.avatar_gradient,
        'equipped_border_key', profile.equipped_border_key
      ),
      'my_like', exists (
        select 1 from public.comment_likes comment_like
        where comment_like.comment_id = comment.id and comment_like.user_id = auth.uid()
      )
    )
  from public.comments comment
  join public.profiles profile on profile.id = comment.user_id
  where comment.post_id = p_post_id
    and comment.moderation_status = 'visible'
    and not public.has_pending_own_comment_report(comment.id)
    and public.can_view_full_post(p_post_id, auth.uid())
    and p_audience in ('friends', 'everyone')
    and (p_before_created_at is null
      or (comment.created_at, comment.id) < (p_before_created_at, p_before_id))
    and not exists (
      select 1 from public.blocks block
      where (block.blocker_id = auth.uid() and block.blocked_id = comment.user_id)
         or (block.blocked_id = auth.uid() and block.blocker_id = comment.user_id)
    )
    and (
      p_audience = 'everyone'
      or comment.user_id = auth.uid()
      or exists (
        select 1 from public.friendships friendship
        where friendship.status = 'accepted'
          and ((friendship.requester_id = auth.uid() and friendship.addressee_id = comment.user_id)
            or (friendship.addressee_id = auth.uid() and friendship.requester_id = comment.user_id))
      )
    )
  order by comment.created_at desc, comment.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.get_comment_thread_snapshot(uuid, text, timestamptz, uuid, integer)
  from public, anon;
grant execute on function public.get_comment_thread_snapshot(uuid, text, timestamptz, uuid, integer)
  to authenticated;

comment on function public.has_pending_own_comment_report(uuid) is
  'Returns only whether the current member has an open report for one comment; never exposes report rows.';
comment on function public.get_comment_thread_snapshot(uuid, text, timestamptz, uuid, integer) is
  'Returns authorized visible comments while excluding pending reports for the current reporter.';
