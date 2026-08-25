-- A report must identify the owner of the content selected by the reporter.
-- Never trust a client-supplied reported_user_id independently from the target:
-- otherwise a modified client could report one person's content while asking an
-- administrator to ban a different account.

create or replace function public.submit_content_report(
  p_reported_user_id uuid,
  p_post_id uuid,
  p_comment_id uuid,
  p_poll_vote_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  authoritative_user_id uuid;
  report_row public.reports%rowtype;
  prior_result jsonb;
  final_result jsonb;
  content_target_count integer := pg_catalog.num_nonnulls(
    p_post_id, p_comment_id, p_poll_vote_id
  );
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if coalesce(length(p_idempotency_key), 0) < 16 then
    raise exception 'Invalid idempotency key';
  end if;
  if p_reason not in ('spam', 'inappropriate', 'harassment', 'other') then
    raise exception 'Invalid report reason';
  end if;
  if content_target_count > 1 then
    raise exception 'A report may reference only one content item';
  end if;

  select receipt.result into prior_result
  from public.command_receipts receipt
  where receipt.user_id = uid
    and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  if p_post_id is not null then
    select post.user_id into authoritative_user_id
    from public.posts post
    where post.id = p_post_id
      and public.can_view_full_post(post.id, uid);
  elsif p_comment_id is not null then
    select comment.user_id into authoritative_user_id
    from public.comments comment
    where comment.id = p_comment_id
      and public.can_view_full_post(comment.post_id, uid);
  elsif p_poll_vote_id is not null then
    select vote.user_id into authoritative_user_id
    from public.poll_votes vote
    join public.posts post
      on post.daily_event_id = vote.daily_event_id
     and post.is_community_poll is true
    where vote.id = p_poll_vote_id
      and public.can_view_full_post(post.id, uid)
    limit 1;
  else
    authoritative_user_id := p_reported_user_id;
    if not exists (
      select 1 from public.profiles profile
      where profile.id = authoritative_user_id
    ) then
      raise exception 'Account is not available';
    end if;
  end if;

  if authoritative_user_id is null then
    raise exception 'Content is not available';
  end if;
  if p_reported_user_id is distinct from authoritative_user_id then
    raise exception 'Reported account does not own this content';
  end if;
  if authoritative_user_id = uid then
    raise exception 'You cannot report your own content';
  end if;

  insert into public.reports (
    reporter_id, reported_user_id, post_id, comment_id, poll_vote_id, reason
  ) values (
    uid, authoritative_user_id, p_post_id, p_comment_id, p_poll_vote_id, p_reason
  ) returning * into report_row;

  final_result := to_jsonb(report_row);
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.submit_content_report(
  uuid, uuid, uuid, uuid, text, text
) from public, anon;
grant execute on function public.submit_content_report(
  uuid, uuid, uuid, uuid, text, text
) to authenticated;

comment on function public.submit_content_report(uuid, uuid, uuid, uuid, text, text) is
  'Creates one idempotent report after binding the reported account to the authoritative content owner.';
