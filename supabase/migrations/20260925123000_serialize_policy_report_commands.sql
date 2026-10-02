-- Concurrent retries of one report intent must wait for and replay the same
-- command receipt instead of briefly creating two reports and losing one to a
-- receipt conflict.

create or replace function public.submit_policy_report(
  p_reported_user_id uuid,
  p_post_id uuid,
  p_comment_id uuid,
  p_poll_vote_id uuid,
  p_target_kind text,
  p_reason text,
  p_reason_detail text,
  p_notes text,
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
  normalized_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  content_target_count integer := pg_catalog.num_nonnulls(p_post_id, p_comment_id, p_poll_vote_id);
  restricted_detail boolean := p_reason_detail in (
    'credible_threat', 'human_exploitation', 'nonconsensual_intimate_images',
    'sexual_exploitation', 'child_sexual_content'
  );
  high_priority boolean := restricted_detail or p_reason in ('self_harm', 'violence_hate_exploitation');
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if char_length(coalesce(p_idempotency_key, '')) not between 16 and 160 then
    raise exception 'Invalid idempotency key';
  end if;
  if p_target_kind not in ('post', 'comment', 'poll_response', 'profile_photo', 'account') then
    raise exception 'Invalid report target';
  end if;
  if content_target_count > 1
     or (p_target_kind = 'post' and p_post_id is null)
     or (p_target_kind = 'comment' and p_comment_id is null)
     or (p_target_kind = 'poll_response' and p_poll_vote_id is null)
     or (p_target_kind in ('profile_photo', 'account') and content_target_count <> 0)
     or (p_target_kind <> 'post' and p_post_id is not null)
     or (p_target_kind <> 'comment' and p_comment_id is not null)
     or (p_target_kind <> 'poll_response' and p_poll_vote_id is not null) then
    raise exception 'Report target does not match the selected content';
  end if;
  if not exists (
    select 1 from (values
      ('bullying_harassment', 'bullying'),
      ('bullying_harassment', 'unwanted_contact'),
      ('bullying_harassment', 'sexual_harassment'),
      ('bullying_harassment', 'threatening_private_content'),
      ('self_harm', 'suicide_self_harm'), ('self_harm', 'eating_disorder'),
      ('violence_hate_exploitation', 'credible_threat'),
      ('violence_hate_exploitation', 'graphic_violence'),
      ('violence_hate_exploitation', 'hate_speech'),
      ('violence_hate_exploitation', 'human_exploitation'),
      ('violence_hate_exploitation', 'animal_abuse'),
      ('restricted_goods', 'drugs'), ('restricted_goods', 'weapons'),
      ('restricted_goods', 'animals'), ('restricted_goods', 'gambling'),
      ('restricted_goods', 'alcohol_tobacco'),
      ('sexual_content', 'nonconsensual_intimate_images'),
      ('sexual_content', 'sexual_solicitation'),
      ('sexual_content', 'sexual_exploitation'),
      ('sexual_content', 'child_sexual_content'),
      ('sexual_content', 'adult_nudity_or_sexual_activity'),
      ('spam_scam', 'spam'), ('spam_scam', 'scam_fraud'),
      ('spam_scam', 'deceptive_business'),
      ('intellectual_property', 'copyright'),
      ('intellectual_property', 'trademark'),
      ('intellectual_property', 'counterfeit_goods'),
      ('privacy', 'personal_information'), ('privacy', 'doxxing'),
      ('privacy', 'image_used_without_permission'),
      ('impersonation', 'impersonating_me'),
      ('impersonation', 'impersonating_someone_else'),
      ('impersonation', 'impersonating_business'),
      ('other', 'other')
    ) allowed(reason, detail)
    where allowed.reason = p_reason and allowed.detail = p_reason_detail
  ) then raise exception 'Invalid report reason'; end if;
  if normalized_notes is not null and char_length(normalized_notes) not between 3 and 500 then
    raise exception 'Report details must be between 3 and 500 characters';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(uid::text || ':' || p_idempotency_key, 0)
  );
  select receipt.result into prior_result
  from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  if p_post_id is not null then
    select post.user_id into authoritative_user_id
    from public.posts post
    where post.id = p_post_id and public.can_view_full_post(post.id, uid);
  elsif p_comment_id is not null then
    select comment.user_id into authoritative_user_id
    from public.comments comment
    where comment.id = p_comment_id and public.can_view_full_post(comment.post_id, uid);
  elsif p_poll_vote_id is not null then
    select vote.user_id into authoritative_user_id
    from public.poll_votes vote
    join public.posts post on post.daily_event_id = vote.daily_event_id
      and post.is_community_poll is true
    where vote.id = p_poll_vote_id and public.can_view_full_post(post.id, uid)
    limit 1;
  else
    authoritative_user_id := p_reported_user_id;
    if not exists (select 1 from public.profiles profile where profile.id = authoritative_user_id) then
      raise exception 'Account is not available';
    end if;
    if p_target_kind = 'profile_photo' and not exists (
      select 1 from public.profiles profile
      where profile.id = authoritative_user_id and profile.avatar_url is not null
    ) then raise exception 'Profile photo is not available'; end if;
  end if;

  if authoritative_user_id is null then raise exception 'Content is not available'; end if;
  if p_reported_user_id is distinct from authoritative_user_id then
    raise exception 'Reported account does not own this content';
  end if;
  if authoritative_user_id = uid then raise exception 'You cannot report your own content'; end if;

  insert into public.reports (
    reporter_id, reported_user_id, post_id, comment_id, poll_vote_id,
    target_kind, reason, reason_detail, notes
  ) values (
    uid, authoritative_user_id, p_post_id, p_comment_id, p_poll_vote_id,
    p_target_kind, p_reason, p_reason_detail, normalized_notes
  ) returning * into report_row;

  insert into public.admin_report_triage (
    report_id, priority, queue, restricted_at, restricted_reason
  ) values (
    report_row.id,
    case when restricted_detail then 'critical' when high_priority then 'high' else 'normal' end,
    case when restricted_detail then 'restricted_safety' else 'moderation' end,
    case when restricted_detail then clock_timestamp() end,
    case when restricted_detail then p_reason_detail end
  ) on conflict (report_id) do nothing;

  final_result := to_jsonb(report_row);
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.submit_policy_report(
  uuid, uuid, uuid, uuid, text, text, text, text, text
) from public, anon;
grant execute on function public.submit_policy_report(
  uuid, uuid, uuid, uuid, text, text, text, text, text
) to authenticated;

comment on function public.submit_policy_report(uuid, uuid, uuid, uuid, text, text, text, text, text) is
  'Creates one serialized, idempotent target-specific report and routes critical leaves to atomic quarantine.';
