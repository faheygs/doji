-- Hierarchical member reporting with explicit evidence targets.
-- Installed clients keep the legacy submit_content_report command; new clients
-- use submit_policy_report so account behavior and profile-photo evidence are
-- no longer conflated.

alter table public.reports
  add column if not exists target_kind text,
  add column if not exists reason_detail text;

update public.reports
set target_kind = case
  when post_id is not null then 'post'
  when comment_id is not null then 'comment'
  when poll_vote_id is not null then 'poll_response'
  else 'profile_photo'
end
where target_kind is null;

alter table public.reports
  alter column target_kind set not null,
  alter column target_kind drop default,
  drop constraint if exists reports_target_kind_check,
  add constraint reports_target_kind_check
    check (target_kind in ('post', 'comment', 'poll_response', 'profile_photo', 'account')),
  drop constraint if exists reports_reason_check,
  add constraint reports_reason_check check (reason in (
    'spam', 'inappropriate', 'harassment', 'other',
    'bullying_harassment', 'self_harm', 'violence_hate_exploitation',
    'restricted_goods', 'sexual_content', 'spam_scam',
    'intellectual_property', 'privacy', 'impersonation'
  )),
  drop constraint if exists reports_reason_detail_check,
  add constraint reports_reason_detail_check check (
    reason_detail is null or reason_detail in (
      'bullying', 'unwanted_contact', 'sexual_harassment', 'threatening_private_content',
      'suicide_self_harm', 'eating_disorder', 'credible_threat', 'graphic_violence',
      'hate_speech', 'human_exploitation', 'animal_abuse', 'drugs', 'weapons',
      'animals', 'gambling', 'alcohol_tobacco', 'nonconsensual_intimate_images',
      'sexual_solicitation', 'sexual_exploitation', 'child_sexual_content',
      'adult_nudity_or_sexual_activity', 'spam', 'scam_fraud', 'deceptive_business',
      'copyright', 'trademark', 'counterfeit_goods', 'personal_information',
      'doxxing', 'image_used_without_permission', 'impersonating_me',
      'impersonating_someone_else', 'impersonating_business', 'other'
    )
  ),
  drop constraint if exists reports_notes_length_check,
  add constraint reports_notes_length_check
    check (notes is null or char_length(notes) between 3 and 500);

create or replace function public.assign_report_target_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.post_id is not null then
    new.target_kind := 'post';
  elsif new.comment_id is not null then
    new.target_kind := 'comment';
  elsif new.poll_vote_id is not null then
    new.target_kind := 'poll_response';
  elsif new.target_kind is null then
    -- Compatibility for installed clients: the former targetless report flow
    -- represented the visible profile photo.
    new.target_kind := 'profile_photo';
  end if;
  return new;
end;
$$;

revoke all on function public.assign_report_target_kind() from public, anon, authenticated;
drop trigger if exists assign_report_target_kind on public.reports;
create trigger assign_report_target_kind
before insert or update of post_id, comment_id, poll_vote_id, target_kind on public.reports
for each row execute function public.assign_report_target_kind();

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
  'Creates one idempotent, target-specific policy report and routes urgent safety details to restricted review.';

-- Return the precise target and preserved report taxonomy to the operator.
create or replace function public.get_admin_report_case(p_report_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then raise exception 'Administrator MFA required'; end if;
  if not public.admin_user_has_permission('moderation.read') then raise exception 'Moderation access required'; end if;

  select jsonb_build_object(
    'id', report.id, 'target_kind', report.target_kind,
    'reason', report.reason, 'reason_detail', report.reason_detail,
    'status', report.status, 'notes', report.notes, 'created_at', report.created_at,
    'deadline_at', report.created_at + interval '24 hours',
    'priority', coalesce(triage.priority, case when report.created_at <= clock_timestamp() - interval '20 hours' then 'high' else 'normal' end),
    'assigned_to', triage.assigned_to, 'assigned_at', triage.assigned_at,
    'owner', case when owner.id is null then null else jsonb_build_object('id', owner.id, 'username', owner.username, 'display_name', owner.display_name) end,
    'reporter', case when reporter.id is null then null else jsonb_build_object('id', reporter.id, 'username', reporter.username, 'display_name', reporter.display_name) end,
    'reported_user', case when reported.id is null then null else jsonb_build_object('id', reported.id, 'username', reported.username, 'display_name', reported.display_name, 'is_banned', reported.is_banned) end,
    'evidence', case
      when report.target_kind = 'post' then jsonb_build_object(
        'kind', 'post', 'content_id', report.post_id, 'exists', post.id is not null,
        'caption', post.caption, 'has_media', post.photo_url is not null,
        'media_bucket', case when post.photo_url is null then null else 'post-media' end,
        'media_path', public.public_storage_object_path(post.photo_url, 'post-media'))
      when report.target_kind = 'comment' then jsonb_build_object(
        'kind', 'comment', 'content_id', report.comment_id, 'exists', comment.id is not null, 'body', comment.body)
      when report.target_kind = 'poll_response' then jsonb_build_object(
        'kind', 'poll_response', 'content_id', report.poll_vote_id, 'exists', vote.id is not null, 'custom_text', vote.custom_text)
      when report.target_kind = 'profile_photo' then jsonb_build_object(
        'kind', 'profile_photo', 'content_id', report.reported_user_id,
        'exists', reported.id is not null, 'has_profile_photo', reported.avatar_url is not null,
        'profile_photo_url', reported.avatar_url)
      else jsonb_build_object(
        'kind', 'account', 'content_id', report.reported_user_id, 'exists', reported.id is not null)
    end,
    'history', coalesce((select jsonb_agg(jsonb_build_object(
      'id', entry.id, 'occurred_at', entry.occurred_at, 'actor_role', entry.actor_role,
      'action', entry.action, 'reason', entry.reason
    ) order by entry.occurred_at desc, entry.id desc) from (
      select audit.* from public.admin_audit_log audit
      where audit.entity_type = 'report' and audit.entity_id = report.id::text
      order by audit.occurred_at desc, audit.id desc limit 50
    ) entry), '[]'::jsonb)
  ) into result
  from public.reports report
  left join public.admin_report_triage triage on triage.report_id = report.id
  left join public.profiles owner on owner.id = triage.assigned_to
  left join public.profiles reporter on reporter.id = report.reporter_id
  left join public.profiles reported on reported.id = report.reported_user_id
  left join public.posts post on post.id = report.post_id
  left join public.comments comment on comment.id = report.comment_id
  left join public.poll_votes vote on vote.id = report.poll_vote_id
  where report.id = p_report_id;

  if result is null then raise exception 'Report not found'; end if;
  insert into public.admin_audit_log (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (auth.uid(), public.admin_current_operator_role(), 'report.evidence_viewed', 'report', p_report_id::text,
    jsonb_build_object('evidenceKind', result #>> '{evidence,kind}'));
  return result;
end;
$$;

revoke all on function public.get_admin_report_case(uuid) from public, anon;
grant execute on function public.get_admin_report_case(uuid) to authenticated;

-- Preserve the audited v2 command while correcting its legacy inference for
-- targetless reports. The wrapper's account repair is atomic with the legacy
-- command, so an account report can never remove the member's avatar.
alter function public.admin_decide_report_v2(uuid, text, text, text, text, text, text)
  rename to admin_decide_report_v2_legacy_20260924;

revoke all on function public.admin_decide_report_v2_legacy_20260924(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;

create or replace function public.admin_decide_report_v2(
  p_report_id uuid,
  p_action text,
  p_policy_code text,
  p_severity text,
  p_reason text,
  p_user_notice text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  report_target text;
  prior_avatar text;
  result jsonb;
  decision_id uuid;
begin
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Administrator MFA required';
  end if;
  if not public.admin_user_has_permission('moderation.write') then
    raise exception 'Moderation write access required';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 10 and 1000
     or char_length(btrim(coalesce(p_user_notice, ''))) not between 10 and 1000 then
    raise exception 'Decision rationale and member notice must be between 10 and 1000 characters';
  end if;
  select report.target_kind, profile.avatar_url
  into report_target, prior_avatar
  from public.reports report
  left join public.profiles profile on profile.id = report.reported_user_id
  where report.id = p_report_id;

  if report_target = 'account' and p_action in ('remove_content', 'remove_profile_photo') then
    raise exception 'Account reports require no-violation or restricted review';
  end if;

  result := public.admin_decide_report_v2_legacy_20260924(
    p_report_id, p_action, p_policy_code, p_severity,
    p_reason, p_user_notice, p_idempotency_key
  );

  if report_target = 'account' then
    decision_id := nullif(result ->> 'decision_id', '')::uuid;
    update public.profiles profile set avatar_url = prior_avatar
    where profile.id = (select report.reported_user_id from public.reports report where report.id = p_report_id)
      and profile.avatar_url is distinct from prior_avatar;
    update public.moderation_decisions
    set content_kind = 'account', content_id = null, original_payload = '{}'::jsonb
    where id = decision_id;
    update public.admin_audit_log
    set metadata = jsonb_set(metadata, '{contentKind}', '"account"'::jsonb, true)
    where request_id = p_idempotency_key and entity_type = 'report' and entity_id = p_report_id::text;
  end if;
  return result;
end;
$$;

revoke all on function public.admin_decide_report_v2(uuid, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.admin_decide_report_v2(uuid, text, text, text, text, text, text)
  to authenticated;
