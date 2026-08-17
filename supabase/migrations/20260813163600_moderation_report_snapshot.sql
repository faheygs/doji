-- Admin evidence reads bypass viewer-relative blocks, but return only the
-- content and public identity fields needed to review a report.
create or replace function public.get_pending_reports_snapshot(p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.is_admin is true
  ) then raise exception 'Admin access required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', report.id, 'reporter_id', report.reporter_id,
    'reported_user_id', report.reported_user_id, 'post_id', report.post_id,
    'comment_id', report.comment_id, 'poll_vote_id', report.poll_vote_id,
    'reason', report.reason, 'status', report.status, 'notes', report.notes,
    'created_at', report.created_at,
    'reporter', case when reporter.id is null then null else jsonb_build_object(
      'username', reporter.username, 'display_name', reporter.display_name,
      'avatar_url', reporter.avatar_url,
      'equipped_border_key', reporter.equipped_border_key
    ) end,
    'reported_user', case when reported.id is null then null else jsonb_build_object(
      'username', reported.username, 'display_name', reported.display_name,
      'avatar_url', reported.avatar_url,
      'equipped_border_key', reported.equipped_border_key
    ) end,
    'post', case when post.id is null then null else jsonb_build_object(
      'caption', post.caption, 'photo_url', post.photo_url
    ) end,
    'comment', case when comment.id is null then null else jsonb_build_object(
      'body', comment.body
    ) end,
    'poll_vote', case when vote.id is null then null else jsonb_build_object(
      'custom_text', vote.custom_text
    ) end
  ) order by report.created_at), '[]'::jsonb) into result
  from (
    select * from public.reports where status = 'pending'
    order by created_at limit least(greatest(p_limit, 1), 100)
  ) report
  left join public.profiles reporter on reporter.id = report.reporter_id
  left join public.profiles reported on reported.id = report.reported_user_id
  left join public.posts post on post.id = report.post_id
  left join public.comments comment on comment.id = report.comment_id
  left join public.poll_votes vote on vote.id = report.poll_vote_id;
  return result;
end;
$$;
revoke all on function public.get_pending_reports_snapshot(integer) from public, anon;
grant execute on function public.get_pending_reports_snapshot(integer) to authenticated;
