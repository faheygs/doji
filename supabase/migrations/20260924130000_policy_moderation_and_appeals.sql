-- Policy-based Trust & Safety enforcement.
--
-- Moderation is deliberately reversible: consumer content is hidden by a
-- server-owned state transition, never destroyed by the review command. A
-- decision produces a user notice, routine first enforcement produces a
-- warning, and eligible decisions can be appealed exactly once. Restricted
-- safety cases are quarantined without closing the report.

alter table public.posts
  add column if not exists moderation_status text not null default 'visible'
    check (moderation_status in ('visible', 'quarantined', 'removed'));
alter table public.comments
  add column if not exists moderation_status text not null default 'visible'
    check (moderation_status in ('visible', 'quarantined', 'removed'));
alter table public.poll_votes
  add column if not exists moderation_status text not null default 'visible'
    check (moderation_status in ('visible', 'quarantined', 'removed'));

create index if not exists posts_visible_event_created_idx
  on public.posts (daily_event_id, created_at desc, id desc)
  where moderation_status = 'visible' and coalesce(is_demo, false) = false;
create index if not exists comments_visible_post_created_idx
  on public.comments (post_id, created_at desc, id desc)
  where moderation_status = 'visible';
create index if not exists poll_votes_visible_event_created_idx
  on public.poll_votes (daily_event_id, created_at desc, id desc)
  where moderation_status = 'visible';

alter table public.admin_report_triage
  add column if not exists queue text not null default 'moderation'
    check (queue in ('moderation', 'restricted_safety')),
  add column if not exists restricted_at timestamptz,
  add column if not exists restricted_reason text;

create table if not exists public.moderation_decisions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete restrict,
  affected_user_id uuid not null references public.profiles(id) on delete restrict,
  content_kind text not null
    check (content_kind in ('post', 'comment', 'poll_response', 'profile_photo', 'account')),
  content_id uuid,
  action text not null
    check (action in ('no_violation', 'quarantine', 'remove_content', 'remove_profile_photo')),
  policy_code text not null check (policy_code in (
    'no_violation', 'sexual_content', 'child_safety',
    'nonconsensual_intimate_imagery', 'harassment_bullying', 'hate',
    'violence_threats', 'impersonation', 'spam_scam',
    'intellectual_property', 'privacy', 'other'
  )),
  severity text not null check (severity in ('none', 'level_1', 'level_2', 'level_3')),
  rationale text not null check (char_length(rationale) between 10 and 1000),
  user_notice text not null check (char_length(user_notice) between 10 and 1000),
  appeal_eligible boolean not null default true,
  state text not null default 'active' check (state in ('active', 'reversed', 'superseded')),
  original_payload jsonb not null default '{}'::jsonb,
  decided_by uuid not null references public.profiles(id) on delete restrict,
  decided_at timestamptz not null default clock_timestamp(),
  reversed_by uuid references public.profiles(id) on delete restrict,
  reversed_at timestamptz,
  reversal_reason text,
  constraint moderation_decisions_payload_object check (jsonb_typeof(original_payload) = 'object')
);

create unique index if not exists moderation_decisions_active_report_idx
  on public.moderation_decisions (report_id)
  where state = 'active';
create index if not exists moderation_decisions_user_created_idx
  on public.moderation_decisions (affected_user_id, decided_at desc, id desc);

create table if not exists public.moderation_account_actions (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.moderation_decisions(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('warning', 'temporary_restriction', 'permanent_ban')),
  starts_at timestamptz not null default clock_timestamp(),
  ends_at timestamptz,
  state text not null default 'active' check (state in ('active', 'expired', 'reversed')),
  created_at timestamptz not null default clock_timestamp(),
  constraint moderation_account_action_end check (ends_at is null or ends_at > starts_at)
);

create index if not exists moderation_account_actions_user_state_idx
  on public.moderation_account_actions (user_id, state, created_at desc);

create table if not exists public.moderation_notices (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.moderation_decisions(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  kind text not null check (kind in ('decision', 'appeal_received', 'appeal_upheld', 'appeal_reversed')),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz
);

create index if not exists moderation_notices_user_created_idx
  on public.moderation_notices (user_id, created_at desc, id desc);

create table if not exists public.moderation_appeals (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null unique references public.moderation_decisions(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  statement text not null check (char_length(statement) between 20 and 2000),
  status text not null default 'pending' check (status in ('pending', 'upheld', 'reversed')),
  submitted_at timestamptz not null default clock_timestamp(),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_reason text
);

create index if not exists moderation_appeals_status_created_idx
  on public.moderation_appeals (status, submitted_at, id);

alter table public.moderation_decisions enable row level security;
alter table public.moderation_account_actions enable row level security;
alter table public.moderation_notices enable row level security;
alter table public.moderation_appeals enable row level security;
revoke all on table public.moderation_decisions from public, anon, authenticated;
revoke all on table public.moderation_account_actions from public, anon, authenticated;
revoke all on table public.moderation_notices from public, anon, authenticated;
revoke all on table public.moderation_appeals from public, anon, authenticated;

-- Direct selects must never leak hidden content. Security-definer snapshots are
-- also patched below because table owners can bypass RLS.
drop policy if exists moderation_visible_posts on public.posts;
create policy moderation_visible_posts on public.posts as restrictive
  for select to authenticated using (moderation_status = 'visible');
drop policy if exists moderation_visible_comments on public.comments;
create policy moderation_visible_comments on public.comments as restrictive
  for select to authenticated using (moderation_status = 'visible');
drop policy if exists moderation_visible_poll_votes on public.poll_votes;
create policy moderation_visible_poll_votes on public.poll_votes as restrictive
  for select to authenticated using (moderation_status = 'visible');

create or replace function public.can_view_full_post(
  p_post_id uuid,
  p_viewer uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select post.moderation_status = 'visible' and public.can_view_full_post(
      p_viewer,
      post.user_event_id,
      post.daily_event_id,
      post.user_id,
      coalesce(post.is_community_poll, false)
    )
    from public.posts post
    where post.id = p_post_id
  ), false);
$$;

revoke all on function public.can_view_full_post(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.get_my_moderation_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then
    jsonb_build_object('notices', '[]'::jsonb, 'decisions', '[]'::jsonb)
  else jsonb_build_object(
    'notices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', notice.id,
        'decision_id', notice.decision_id,
        'kind', notice.kind,
        'title', notice.title,
        'body', notice.body,
        'created_at', notice.created_at,
        'read_at', notice.read_at
      ) order by notice.created_at desc, notice.id desc)
      from (
        select * from public.moderation_notices
        where user_id = auth.uid()
        order by created_at desc, id desc
        limit 50
      ) notice
    ), '[]'::jsonb),
    'decisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', decision.id,
        'content_kind', decision.content_kind,
        'action', decision.action,
        'policy_code', decision.policy_code,
        'severity', decision.severity,
        'user_notice', decision.user_notice,
        'appeal_eligible', decision.appeal_eligible,
        'state', decision.state,
        'decided_at', decision.decided_at,
        'appeal', case when appeal.id is null then null else jsonb_build_object(
          'id', appeal.id,
          'status', appeal.status,
          'statement', appeal.statement,
          'submitted_at', appeal.submitted_at,
          'reviewed_at', appeal.reviewed_at,
          'review_reason', appeal.review_reason
        ) end
      ) order by decision.decided_at desc, decision.id desc)
      from (
        select * from public.moderation_decisions
        where affected_user_id = auth.uid()
        order by decided_at desc, id desc
        limit 50
      ) decision
      left join public.moderation_appeals appeal on appeal.decision_id = decision.id
    ), '[]'::jsonb)
  ) end;
$$;

revoke all on function public.get_my_moderation_status() from public, anon;
grant execute on function public.get_my_moderation_status() to authenticated;

create or replace function public.mark_moderation_notice_read(p_notice_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare read_time timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.moderation_notices
  set read_at = coalesce(read_at, clock_timestamp())
  where id = p_notice_id and user_id = auth.uid()
  returning read_at into read_time;
  if read_time is null then raise exception 'Notice not found'; end if;
  return read_time;
end;
$$;

revoke all on function public.mark_moderation_notice_read(uuid) from public, anon;
grant execute on function public.mark_moderation_notice_read(uuid) to authenticated;

create or replace function public.submit_moderation_appeal(
  p_decision_id uuid,
  p_statement text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  normalized_statement text := btrim(coalesce(p_statement, ''));
  decision_row public.moderation_decisions%rowtype;
  appeal_row public.moderation_appeals%rowtype;
  prior_result jsonb;
  final_result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if char_length(coalesce(p_idempotency_key, '')) not between 16 and 160 then
    raise exception 'Invalid idempotency key';
  end if;
  if char_length(normalized_statement) not between 20 and 2000 then
    raise exception 'Appeal must be between 20 and 2000 characters';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_decision_id::text, 0));
  select receipt.result into prior_result
  from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  select * into decision_row
  from public.moderation_decisions decision
  where decision.id = p_decision_id and decision.affected_user_id = uid
  for update;
  if not found then raise exception 'Decision not found'; end if;
  if decision_row.state <> 'active' or decision_row.appeal_eligible is not true then
    raise exception 'This decision is not eligible for appeal';
  end if;

  insert into public.moderation_appeals (decision_id, user_id, statement)
  values (p_decision_id, uid, normalized_statement)
  on conflict (decision_id) do nothing
  returning * into appeal_row;
  if not found then raise exception 'An appeal has already been submitted'; end if;

  insert into public.moderation_notices (decision_id, user_id, kind, title, body)
  values (
    p_decision_id, uid, 'appeal_received', 'Appeal received',
    'Your appeal is in review. A different authorized reviewer will decide it.'
  );

  perform public.enqueue_domain_event(
    'moderation:global', 'moderation.appeal.submitted', appeal_row.id,
    jsonb_build_object('version', 1, 'appealId', appeal_row.id), null
  );
  perform public.enqueue_domain_event(
    'user:' || uid::text || ':events', 'moderation.status.changed', p_decision_id,
    jsonb_build_object('version', 1, 'decisionId', p_decision_id), null
  );

  final_result := jsonb_build_object(
    'appeal_id', appeal_row.id,
    'decision_id', appeal_row.decision_id,
    'status', appeal_row.status,
    'submitted_at', appeal_row.submitted_at
  );
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.submit_moderation_appeal(uuid, text, text) from public, anon;
grant execute on function public.submit_moderation_appeal(uuid, text, text) to authenticated;

create or replace function public.get_admin_report_case_v2(p_report_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  base jsonb;
  triage_row public.admin_report_triage%rowtype;
  current_decision jsonb;
begin
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Administrator MFA required';
  end if;
  if not public.admin_user_has_permission('moderation.read') then
    raise exception 'Moderation access required';
  end if;

  select * into triage_row
  from public.admin_report_triage triage
  where triage.report_id = p_report_id;
  if triage_row.queue = 'restricted_safety'
     and not public.admin_user_has_permission('legal.read') then
    raise exception 'Restricted safety authorization required';
  end if;

  base := public.get_admin_report_case(p_report_id);

  select jsonb_build_object(
    'id', decision.id,
    'action', decision.action,
    'policy_code', decision.policy_code,
    'severity', decision.severity,
    'rationale', decision.rationale,
    'user_notice', decision.user_notice,
    'appeal_eligible', decision.appeal_eligible,
    'state', decision.state,
    'decided_at', decision.decided_at,
    'appeal', case when appeal.id is null then null else jsonb_build_object(
      'id', appeal.id,
      'status', appeal.status,
      'statement', appeal.statement,
      'submitted_at', appeal.submitted_at,
      'reviewed_at', appeal.reviewed_at,
      'review_reason', appeal.review_reason
    ) end
  ) into current_decision
  from public.moderation_decisions decision
  left join public.moderation_appeals appeal on appeal.decision_id = decision.id
  where decision.report_id = p_report_id
  order by decision.decided_at desc
  limit 1;

  return base || jsonb_build_object(
    'workflow_version', 2,
    'queue', coalesce(triage_row.queue, 'moderation'),
    'restricted_at', triage_row.restricted_at,
    'restricted_reason', triage_row.restricted_reason,
    'current_decision', current_decision,
    'policy_catalog', jsonb_build_array(
      jsonb_build_object('code', 'sexual_content', 'label', 'Sexual content'),
      jsonb_build_object('code', 'child_safety', 'label', 'Child safety'),
      jsonb_build_object('code', 'nonconsensual_intimate_imagery', 'label', 'Non-consensual intimate imagery'),
      jsonb_build_object('code', 'harassment_bullying', 'label', 'Harassment or bullying'),
      jsonb_build_object('code', 'hate', 'label', 'Hate'),
      jsonb_build_object('code', 'violence_threats', 'label', 'Violence or threats'),
      jsonb_build_object('code', 'impersonation', 'label', 'Impersonation'),
      jsonb_build_object('code', 'spam_scam', 'label', 'Spam or scam'),
      jsonb_build_object('code', 'intellectual_property', 'label', 'Intellectual property'),
      jsonb_build_object('code', 'privacy', 'label', 'Privacy'),
      jsonb_build_object('code', 'other', 'label', 'Other policy violation')
    )
  );
end;
$$;

revoke all on function public.get_admin_report_case_v2(uuid) from public, anon;
grant execute on function public.get_admin_report_case_v2(uuid) to authenticated;

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
  uid uuid := auth.uid();
  report_row public.reports%rowtype;
  decision_row public.moderation_decisions%rowtype;
  prior_result jsonb;
  final_result jsonb;
  normalized_reason text := btrim(coalesce(p_reason, ''));
  normalized_notice text := btrim(coalesce(p_user_notice, ''));
  actor_role text;
  content_kind text;
  content_id uuid;
  original_payload jsonb := '{}'::jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Administrator MFA required';
  end if;
  if not public.admin_user_has_permission('moderation.write') then
    raise exception 'Moderation write access required';
  end if;
  if char_length(coalesce(p_idempotency_key, '')) not between 16 and 160 then
    raise exception 'Invalid idempotency key';
  end if;
  if p_action not in ('no_violation', 'remove_content', 'remove_profile_photo', 'escalate_restricted') then
    raise exception 'Invalid moderation action';
  end if;
  if p_policy_code not in (
    'no_violation', 'sexual_content', 'child_safety',
    'nonconsensual_intimate_imagery', 'harassment_bullying', 'hate',
    'violence_threats', 'impersonation', 'spam_scam',
    'intellectual_property', 'privacy', 'other'
  ) then raise exception 'Choose a valid policy area'; end if;
  if p_severity not in ('none', 'level_1', 'level_2', 'level_3') then
    raise exception 'Choose a valid severity';
  end if;
  if char_length(normalized_reason) not between 10 and 1000 then
    raise exception 'Enter an internal rationale between 10 and 1000 characters';
  end if;
  if char_length(normalized_notice) not between 10 and 1000 then
    raise exception 'Enter a user notice between 10 and 1000 characters';
  end if;
  if p_action = 'no_violation' and (p_policy_code <> 'no_violation' or p_severity <> 'none') then
    raise exception 'No violation must use the no-violation policy and no severity';
  end if;
  if p_action <> 'no_violation' and p_policy_code = 'no_violation' then
    raise exception 'Choose the policy that was violated';
  end if;
  if p_action in ('remove_content', 'remove_profile_photo') and p_severity not in ('level_1', 'level_2') then
    raise exception 'Level 3 cases must be quarantined and escalated for restricted review';
  end if;
  if p_action = 'escalate_restricted' and p_severity not in ('level_2', 'level_3') then
    raise exception 'Restricted escalation is for serious or emergency cases';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_report_id::text, 0));
  select receipt.result into prior_result
  from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  select * into report_row
  from public.reports report
  where report.id = p_report_id
  for update;
  if not found then raise exception 'Report not found'; end if;
  if report_row.status <> 'pending' then raise exception 'Report is already closed'; end if;
  if report_row.reported_user_id is null then raise exception 'Reported account is unavailable'; end if;
  actor_role := public.admin_current_operator_role();

  insert into public.admin_report_triage (report_id)
  values (p_report_id)
  on conflict (report_id) do nothing;
  if exists (
    select 1 from public.admin_report_triage triage
    where triage.report_id = p_report_id
      and triage.assigned_to is not null
      and triage.assigned_to <> uid
      and actor_role <> 'super_admin'
  ) then raise exception 'This report is assigned to another operator'; end if;

  if report_row.post_id is not null then
    content_kind := 'post'; content_id := report_row.post_id;
    select jsonb_build_object('moderation_status', post.moderation_status)
    into original_payload from public.posts post where post.id = content_id;
  elsif report_row.comment_id is not null then
    content_kind := 'comment'; content_id := report_row.comment_id;
    select jsonb_build_object('moderation_status', comment.moderation_status)
    into original_payload from public.comments comment where comment.id = content_id;
  elsif report_row.poll_vote_id is not null then
    content_kind := 'poll_response'; content_id := report_row.poll_vote_id;
    select jsonb_build_object('moderation_status', vote.moderation_status)
    into original_payload from public.poll_votes vote where vote.id = content_id;
  else
    content_kind := 'profile_photo'; content_id := report_row.reported_user_id;
    select jsonb_build_object('avatar_url', profile.avatar_url)
    into original_payload from public.profiles profile where profile.id = content_id;
  end if;
  original_payload := coalesce(original_payload, '{}'::jsonb);

  if content_kind = 'profile_photo'
     and nullif(original_payload ->> 'avatar_url', '') is null then
    select prior.original_payload into original_payload
    from public.moderation_decisions prior
    where prior.report_id = p_report_id
      and prior.state = 'active'
      and prior.action = 'quarantine'
    order by prior.decided_at desc
    limit 1;
    original_payload := coalesce(original_payload, jsonb_build_object('avatar_url', null));
  end if;

  -- A quarantine decision is superseded when the restricted reviewer records a
  -- final outcome. No other active decision may be silently overwritten.
  update public.moderation_decisions
  set state = 'superseded'
  where report_id = p_report_id and state = 'active' and action = 'quarantine';
  if exists (
    select 1 from public.moderation_decisions
    where report_id = p_report_id and state = 'active'
  ) then raise exception 'This report already has an active decision'; end if;

  if p_action = 'escalate_restricted' then
    if content_kind = 'post' then
      update public.posts set moderation_status = 'quarantined' where id = content_id;
    elsif content_kind = 'comment' then
      update public.comments set moderation_status = 'quarantined' where id = content_id;
    elsif content_kind = 'poll_response' then
      update public.poll_votes set moderation_status = 'quarantined' where id = content_id;
    else
      -- Profile-photo evidence is preserved in original_payload and hidden now.
      update public.profiles set avatar_url = null where id = report_row.reported_user_id;
    end if;

    update public.admin_report_triage
    set queue = 'restricted_safety', priority = 'critical',
        restricted_at = coalesce(restricted_at, clock_timestamp()),
        restricted_reason = normalized_reason,
        assigned_to = null, assigned_at = null,
        updated_at = clock_timestamp()
    where report_id = p_report_id;
  elsif p_action = 'remove_content' then
    if content_kind = 'post' then
      update public.posts set moderation_status = 'removed' where id = content_id;
    elsif content_kind = 'comment' then
      update public.comments set moderation_status = 'removed' where id = content_id;
    elsif content_kind = 'poll_response' then
      update public.poll_votes set moderation_status = 'removed' where id = content_id;
    else
      raise exception 'This report has no removable post, comment, or poll response';
    end if;
  elsif p_action = 'remove_profile_photo' then
    if content_kind <> 'profile_photo' then raise exception 'This is not a profile-photo report'; end if;
    update public.profiles set avatar_url = null where id = report_row.reported_user_id;
  else
    -- A no-violation result restores only this report's prior quarantine.
    if content_kind = 'post' then
      update public.posts set moderation_status = 'visible'
      where id = content_id and moderation_status = 'quarantined';
    elsif content_kind = 'comment' then
      update public.comments set moderation_status = 'visible'
      where id = content_id and moderation_status = 'quarantined';
    elsif content_kind = 'poll_response' then
      update public.poll_votes set moderation_status = 'visible'
      where id = content_id and moderation_status = 'quarantined';
    elsif original_payload ? 'avatar_url' then
      update public.profiles set avatar_url = original_payload ->> 'avatar_url'
      where id = report_row.reported_user_id and avatar_url is null;
    end if;
  end if;

  insert into public.moderation_decisions (
    report_id, affected_user_id, content_kind, content_id, action,
    policy_code, severity, rationale, user_notice, appeal_eligible,
    original_payload, decided_by
  ) values (
    p_report_id, report_row.reported_user_id, content_kind, content_id,
    case when p_action = 'escalate_restricted' then 'quarantine' else p_action end,
    p_policy_code, p_severity, normalized_reason, normalized_notice,
    p_action in ('remove_content', 'remove_profile_photo'),
    original_payload, uid
  ) returning * into decision_row;

  if p_action in ('remove_content', 'remove_profile_photo') then
    insert into public.moderation_account_actions (decision_id, user_id, action)
    values (decision_row.id, report_row.reported_user_id, 'warning');
    insert into public.moderation_notices (decision_id, user_id, kind, title, body)
    values (
      decision_row.id, report_row.reported_user_id, 'decision',
      case when p_action = 'remove_profile_photo' then 'Your profile photo was removed'
        else 'Your content was removed' end,
      normalized_notice
    );
  end if;

  if p_action <> 'escalate_restricted' then
    update public.reports
    set status = case when p_action = 'no_violation' then 'dismissed' else 'actioned' end,
        notes = normalized_reason
    where id = p_report_id;
    update public.admin_report_triage
    set assigned_to = coalesce(assigned_to, uid),
        assigned_at = coalesce(assigned_at, clock_timestamp()),
        resolved_at = clock_timestamp(), resolved_by = uid,
        updated_at = clock_timestamp()
    where report_id = p_report_id;
  end if;

  insert into public.admin_audit_log (
    actor_id, actor_role, action, entity_type, entity_id, reason,
    request_id, metadata
  ) values (
    uid, actor_role, 'report.' || p_action, 'report', p_report_id::text,
    normalized_reason, p_idempotency_key,
    jsonb_build_object(
      'decisionId', decision_row.id,
      'policyCode', p_policy_code,
      'severity', p_severity,
      'contentKind', content_kind,
      'affectedUserId', report_row.reported_user_id
    )
  );

  perform public.enqueue_domain_event(
    'moderation:global', 'moderation.report.changed', p_report_id,
    jsonb_build_object('version', 2, 'reportId', p_report_id), null
  );
  perform public.enqueue_domain_event(
    'user:' || report_row.reported_user_id::text || ':events',
    'moderation.status.changed', decision_row.id,
    jsonb_build_object('version', 1, 'decisionId', decision_row.id), null
  );

  final_result := jsonb_build_object(
    'report_id', p_report_id,
    'decision_id', decision_row.id,
    'status', case when p_action = 'escalate_restricted' then 'pending' else
      case when p_action = 'no_violation' then 'dismissed' else 'actioned' end end,
    'action', p_action,
    'queue', case when p_action = 'escalate_restricted' then 'restricted_safety' else 'moderation' end
  );
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.admin_decide_report_v2(uuid, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.admin_decide_report_v2(uuid, text, text, text, text, text, text)
  to authenticated;

-- Feed reconciliation excludes non-visible content in the same bounded server
-- snapshot. The client never receives a quarantined row and therefore cannot
-- briefly render it while realtime invalidation catches up.
create or replace function public.get_feed_page_snapshot_v2(
  p_daily_event_id uuid,
  p_audience text default 'friends',
  p_limit integer default 20,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); result jsonb;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_audience not in ('friends', 'everyone') then raise exception 'Invalid audience'; end if;
  if not public.can_access_daily_event(p_daily_event_id, uid) then return '[]'::jsonb; end if;

  with friend_ids as (
    select uid user_id union
    select case when f.requester_id = uid then f.addressee_id else f.requester_id end
    from public.friendships f where f.status = 'accepted'
      and (f.requester_id = uid or f.addressee_id = uid)
  ), blocked_ids as (
    select b.blocked_id user_id from public.blocks b where b.blocker_id = uid union
    select b.blocker_id from public.blocks b where b.blocked_id = uid
  ), normal_posts as (
    select post.id post_id, post.created_at post_created_at,
      to_jsonb(post) - 'idempotency_key' - 'moderation_status' post_json,
      jsonb_build_object('id', profile.id, 'username', profile.username,
        'display_name', profile.display_name, 'avatar_url', profile.avatar_url,
        'avatar_gradient', profile.avatar_gradient,
        'equipped_border_key', profile.equipped_border_key,
        'equipped_title_key', profile.equipped_title_key) profile_json,
      to_jsonb(challenge) challenge_json,
      to_jsonb(event) || jsonb_build_object('challenge', to_jsonb(challenge)) event_json
    from public.posts post
    join public.daily_events event on event.id = post.daily_event_id
    join public.challenges challenge on challenge.id = event.challenge_id
    join public.profiles profile on profile.id = post.user_id
    where post.daily_event_id = p_daily_event_id
      and post.moderation_status = 'visible'
      and post.is_community_poll is not true and coalesce(post.is_demo, false) is false
      and post.user_id not in (select blocked.user_id from blocked_ids blocked)
      and (p_audience = 'everyone' or post.user_id in (select friend.user_id from friend_ids friend))
      and (p_before_created_at is null or (post.created_at, post.id) < (p_before_created_at, p_before_id))
    order by post.created_at desc, post.id desc
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  ), community_posts as (
    select post.id, post.created_at,
      to_jsonb(post) - 'idempotency_key' - 'moderation_status', null::jsonb,
      to_jsonb(challenge),
      to_jsonb(event) || jsonb_build_object('challenge', to_jsonb(challenge))
    from public.posts post join public.daily_events event on event.id = post.daily_event_id
    join public.challenges challenge on challenge.id = event.challenge_id
    where post.daily_event_id = p_daily_event_id
      and post.moderation_status = 'visible'
      and post.is_community_poll is true
      and (p_before_created_at is null or (post.created_at, post.id) < (p_before_created_at, p_before_id))
      and ((p_audience = 'everyone' and exists (
        select 1 from public.poll_votes vote
        where vote.daily_event_id = p_daily_event_id
          and vote.moderation_status = 'visible'
      )) or (p_audience = 'friends' and exists (
        select 1 from public.poll_votes vote
        where vote.daily_event_id = p_daily_event_id
          and vote.moderation_status = 'visible'
          and vote.user_id in (select friend.user_id from friend_ids friend)
      ))) order by post.created_at desc, post.id desc limit 1
  ), candidates as (
    select * from normal_posts union all select * from community_posts
  ), paged as (
    select * from candidates order by post_created_at desc, post_id desc
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  ), raw_reaction_counts as (
    select shard.post_id, shard.emoji, sum(shard.reaction_count)::integer count
    from public.post_reaction_count_shards shard
    where p_audience = 'everyone' and shard.post_id in (select page.post_id from paged page)
    group by shard.post_id, shard.emoji
    union all
    select reaction.post_id, reaction.emoji, count(*)::integer
    from public.reactions reaction
    where p_audience = 'friends' and reaction.post_id in (select page.post_id from paged page)
      and reaction.user_id in (select friend.user_id from friend_ids friend)
      and reaction.user_id not in (select blocked.user_id from blocked_ids blocked)
    group by reaction.post_id, reaction.emoji
  ), blocked_reactions as (
    select reaction.post_id, reaction.emoji, count(*)::integer count
    from public.reactions reaction
    where p_audience = 'everyone' and reaction.post_id in (select page.post_id from paged page)
      and reaction.user_id in (select blocked.user_id from blocked_ids blocked)
    group by reaction.post_id, reaction.emoji
  ), reaction_counts as (
    select raw.post_id, raw.emoji,
      greatest(raw.count - coalesce(blocked.count, 0), 0)::integer count
    from raw_reaction_counts raw left join blocked_reactions blocked
      on blocked.post_id = raw.post_id and blocked.emoji = raw.emoji
  ), reaction_summary as (
    select counts.post_id, sum(counts.count)::integer total,
      jsonb_object_agg(counts.emoji, counts.count) breakdown
    from reaction_counts counts group by counts.post_id
  ), my_reactions as (
    select reaction.post_id, jsonb_agg(reaction.emoji) emojis
    from public.reactions reaction where reaction.user_id = uid
      and reaction.post_id in (select page.post_id from paged page)
    group by reaction.post_id
  ), raw_comments as (
    select shard.post_id, sum(shard.comment_count)::integer total
    from public.post_engagement_shards shard
    where p_audience = 'everyone' and shard.post_id in (select page.post_id from paged page)
    group by shard.post_id
    union all
    select comment.post_id, count(*)::integer
    from public.comments comment where p_audience = 'friends'
      and comment.post_id in (select page.post_id from paged page)
      and comment.moderation_status = 'visible'
      and comment.user_id in (select friend.user_id from friend_ids friend)
      and comment.user_id not in (select blocked.user_id from blocked_ids blocked)
    group by comment.post_id
  ), blocked_comments as (
    select comment.post_id, count(*)::integer total from public.comments comment
    where p_audience = 'everyone' and comment.post_id in (select page.post_id from paged page)
      and comment.moderation_status = 'visible'
      and comment.user_id in (select blocked.user_id from blocked_ids blocked)
    group by comment.post_id
  ), hidden_comments as (
    select comment.post_id, count(*)::integer total from public.comments comment
    where p_audience = 'everyone' and comment.post_id in (select page.post_id from paged page)
      and comment.moderation_status <> 'visible'
    group by comment.post_id
  ), hydrated as (
    select page.post_json || jsonb_build_object(
      'profile', page.profile_json, 'challenge', page.challenge_json,
      'daily_event', page.event_json, 'reaction_count', coalesce(reactions.total, 0),
      'reaction_breakdown', coalesce(reactions.breakdown, '{}'::jsonb),
      'my_reactions', coalesce(mine.emojis, '[]'::jsonb),
      'comment_count', greatest(coalesce(comments.total, 0)
        - coalesce(blocked.total, 0) - coalesce(hidden.total, 0), 0)
    ) post, page.post_created_at
    from paged page left join reaction_summary reactions on reactions.post_id = page.post_id
    left join my_reactions mine on mine.post_id = page.post_id
    left join raw_comments comments on comments.post_id = page.post_id
    left join blocked_comments blocked on blocked.post_id = page.post_id
    left join hidden_comments hidden on hidden.post_id = page.post_id
  )
  select coalesce(jsonb_agg(post order by post_created_at desc), '[]'::jsonb)
  into result from hydrated;
  return result;
end;
$$;

revoke all on function public.get_feed_page_snapshot_v2(uuid, text, integer, timestamptz, uuid)
  from public, anon;
grant execute on function public.get_feed_page_snapshot_v2(uuid, text, integer, timestamptz, uuid)
  to authenticated;

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

create or replace function public.get_poll_snapshot_for_feed(
  p_daily_event_id uuid,
  p_audience text default 'friends'
)
returns table (
  option_id uuid,
  challenge_id uuid,
  option_text text,
  option_position integer,
  option_is_other boolean,
  option_created_at timestamptz,
  vote_id uuid,
  user_id uuid,
  custom_text text,
  vote_created_at timestamptz,
  username text,
  display_name text,
  avatar_url text,
  equipped_border_key text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_audience not in ('friends', 'everyone') then raise exception 'Invalid audience'; end if;
  if not public.can_access_daily_event(p_daily_event_id, uid) then return; end if;

  return query
  with event_context as (
    select event.challenge_id
    from public.daily_events event
    where event.id = p_daily_event_id
  ), visible_votes as (
    select vote.id, vote.option_id, vote.user_id, vote.custom_text, vote.created_at
    from public.poll_votes vote
    join public.user_events participant on participant.id = vote.user_event_id
    where participant.daily_event_id = p_daily_event_id
      and vote.moderation_status = 'visible'
      and not exists (
        select 1 from public.blocks block
        where (block.blocker_id = uid and block.blocked_id = vote.user_id)
           or (block.blocked_id = uid and block.blocker_id = vote.user_id)
      )
      and (
        p_audience = 'everyone' or vote.user_id = uid or exists (
          select 1 from public.friendships friendship
          where friendship.status = 'accepted'
            and ((friendship.requester_id = uid and friendship.addressee_id = vote.user_id)
              or (friendship.addressee_id = uid and friendship.requester_id = vote.user_id))
        )
      )
  )
  select option.id, option.challenge_id, option.text, option.position,
    option.is_other, option.created_at, vote.id, vote.user_id,
    vote.custom_text, vote.created_at, profile.username, profile.display_name,
    profile.avatar_url, profile.equipped_border_key
  from event_context event
  join public.poll_options option on option.challenge_id = event.challenge_id
  left join visible_votes vote on vote.option_id = option.id
  left join public.profiles profile on profile.id = vote.user_id
  order by option.position, vote.created_at;
end;
$$;

revoke all on function public.get_poll_snapshot_for_feed(uuid, text) from public, anon;
grant execute on function public.get_poll_snapshot_for_feed(uuid, text) to authenticated;

create or replace function public.get_post_engagement_snapshot_v2(
  p_post_id uuid,
  p_audience text default 'everyone'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid(); result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_audience not in ('friends', 'everyone') then raise exception 'Invalid audience'; end if;
  if not public.can_view_full_post(p_post_id, uid) then raise exception 'Post is not available'; end if;

  with friend_ids as (
    select uid user_id union
    select case when friendship.requester_id = uid
      then friendship.addressee_id else friendship.requester_id end
    from public.friendships friendship
    where friendship.status = 'accepted'
      and (friendship.requester_id = uid or friendship.addressee_id = uid)
  ), blocked_ids as (
    select block.blocked_id user_id from public.blocks block where block.blocker_id = uid
    union select block.blocker_id from public.blocks block where block.blocked_id = uid
  ), raw_reaction_counts as (
    select shard.emoji, sum(shard.reaction_count)::integer count
    from public.post_reaction_count_shards shard
    where p_audience = 'everyone' and shard.post_id = p_post_id group by shard.emoji
    union all
    select reaction.emoji, count(*)::integer from public.reactions reaction
    where p_audience = 'friends' and reaction.post_id = p_post_id
      and reaction.user_id in (select friend.user_id from friend_ids friend)
      and reaction.user_id not in (select blocked.user_id from blocked_ids blocked)
    group by reaction.emoji
  ), blocked_reactions as (
    select reaction.emoji, count(*)::integer count from public.reactions reaction
    where p_audience = 'everyone' and reaction.post_id = p_post_id
      and reaction.user_id in (select blocked.user_id from blocked_ids blocked)
    group by reaction.emoji
  ), reaction_counts as (
    select raw.emoji, greatest(raw.count - coalesce(blocked.count, 0), 0)::integer count
    from raw_reaction_counts raw left join blocked_reactions blocked on blocked.emoji = raw.emoji
  ), reaction_summary as (
    select coalesce(sum(counts.count), 0)::integer total,
      coalesce(jsonb_object_agg(counts.emoji, counts.count) filter (where counts.count > 0), '{}'::jsonb) breakdown
    from reaction_counts counts
  ), raw_comments as (
    select coalesce(sum(shard.comment_count), 0)::integer total
    from public.post_engagement_shards shard
    where p_audience = 'everyone' and shard.post_id = p_post_id
    union all
    select count(*)::integer from public.comments comment
    where p_audience = 'friends' and comment.post_id = p_post_id
      and comment.moderation_status = 'visible'
      and comment.user_id in (select friend.user_id from friend_ids friend)
      and comment.user_id not in (select blocked.user_id from blocked_ids blocked)
  ), comment_summary as (
    select coalesce(sum(raw.total), 0)::integer total from raw_comments raw
  ), blocked_comments as (
    select count(*)::integer total from public.comments comment
    where p_audience = 'everyone' and comment.post_id = p_post_id
      and comment.moderation_status = 'visible'
      and comment.user_id in (select blocked.user_id from blocked_ids blocked)
  ), hidden_comments as (
    select count(*)::integer total from public.comments comment
    where p_audience = 'everyone' and comment.post_id = p_post_id
      and comment.moderation_status <> 'visible'
  ), my_reactions as (
    select coalesce(jsonb_agg(reaction.emoji order by reaction.created_at), '[]'::jsonb) emojis
    from public.reactions reaction where reaction.post_id = p_post_id and reaction.user_id = uid
  )
  select jsonb_build_object(
    'post_id', post.id,
    'reaction_count', reactions.total,
    'comment_count', greatest(comments.total - blocked.total - hidden.total, 0),
    'reaction_breakdown', reactions.breakdown,
    'my_reactions', mine.emojis
  ) into result
  from public.posts post cross join reaction_summary reactions
  cross join comment_summary comments cross join blocked_comments blocked
  cross join hidden_comments hidden cross join my_reactions mine
  where post.id = p_post_id and post.moderation_status = 'visible';
  return result;
end;
$$;

revoke all on function public.get_post_engagement_snapshot_v2(uuid, text)
  from public, anon;
grant execute on function public.get_post_engagement_snapshot_v2(uuid, text)
  to authenticated;

drop policy if exists moderation_update_visible_posts on public.posts;
create policy moderation_update_visible_posts on public.posts as restrictive
  for update to authenticated
  using (moderation_status = 'visible') with check (moderation_status = 'visible');
drop policy if exists moderation_delete_visible_posts on public.posts;
create policy moderation_delete_visible_posts on public.posts as restrictive
  for delete to authenticated using (moderation_status = 'visible');
drop policy if exists moderation_update_visible_comments on public.comments;
create policy moderation_update_visible_comments on public.comments as restrictive
  for update to authenticated
  using (moderation_status = 'visible') with check (moderation_status = 'visible');
drop policy if exists moderation_delete_visible_comments on public.comments;
create policy moderation_delete_visible_comments on public.comments as restrictive
  for delete to authenticated using (moderation_status = 'visible');

create or replace function public.get_admin_appeals_snapshot(p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Administrator MFA required';
  end if;
  if not public.admin_user_has_permission('moderation.read') then
    raise exception 'Moderation access required';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', appeal.id,
    'decision_id', appeal.decision_id,
    'report_id', decision.report_id,
    'status', appeal.status,
    'statement', appeal.statement,
    'submitted_at', appeal.submitted_at,
    'policy_code', decision.policy_code,
    'severity', decision.severity,
    'content_kind', decision.content_kind,
    'original_decider_id', decision.decided_by,
    'user', jsonb_build_object(
      'id', profile.id,
      'username', profile.username,
      'display_name', profile.display_name
    )
  ) order by appeal.submitted_at, appeal.id), '[]'::jsonb)
  into result
  from (
    select * from public.moderation_appeals
    where status = 'pending'
    order by submitted_at, id
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) appeal
  join public.moderation_decisions decision on decision.id = appeal.decision_id
  join public.profiles profile on profile.id = appeal.user_id;
  return result;
end;
$$;

revoke all on function public.get_admin_appeals_snapshot(integer) from public, anon;
grant execute on function public.get_admin_appeals_snapshot(integer) to authenticated;

create or replace function public.admin_review_moderation_appeal(
  p_appeal_id uuid,
  p_outcome text,
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
  appeal_row public.moderation_appeals%rowtype;
  decision_row public.moderation_decisions%rowtype;
  normalized_reason text := btrim(coalesce(p_reason, ''));
  prior_result jsonb;
  final_result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Administrator MFA required';
  end if;
  if not public.admin_user_has_permission('moderation.write') then
    raise exception 'Moderation write access required';
  end if;
  if p_outcome not in ('uphold', 'reverse') then raise exception 'Invalid appeal outcome'; end if;
  if char_length(normalized_reason) not between 10 and 1000 then
    raise exception 'Enter an appeal rationale between 10 and 1000 characters';
  end if;
  if char_length(coalesce(p_idempotency_key, '')) not between 16 and 160 then
    raise exception 'Invalid idempotency key';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_appeal_id::text, 0));
  select receipt.result into prior_result from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  select * into appeal_row from public.moderation_appeals
  where id = p_appeal_id for update;
  if not found then raise exception 'Appeal not found'; end if;
  if appeal_row.status <> 'pending' then raise exception 'Appeal is already closed'; end if;

  select * into decision_row from public.moderation_decisions
  where id = appeal_row.decision_id for update;
  if decision_row.decided_by = uid then
    raise exception 'Appeals must be reviewed by a different operator';
  end if;

  if p_outcome = 'reverse' then
    if decision_row.content_kind = 'post' then
      update public.posts set moderation_status = 'visible'
      where id = decision_row.content_id and moderation_status = 'removed';
    elsif decision_row.content_kind = 'comment' then
      update public.comments set moderation_status = 'visible'
      where id = decision_row.content_id and moderation_status = 'removed';
    elsif decision_row.content_kind = 'poll_response' then
      update public.poll_votes set moderation_status = 'visible'
      where id = decision_row.content_id and moderation_status = 'removed';
    elsif decision_row.content_kind = 'profile_photo' then
      update public.profiles
      set avatar_url = decision_row.original_payload ->> 'avatar_url'
      where id = decision_row.affected_user_id and avatar_url is null;
    end if;

    update public.moderation_decisions
    set state = 'reversed', reversed_by = uid, reversed_at = clock_timestamp(),
        reversal_reason = normalized_reason
    where id = decision_row.id;
    update public.moderation_account_actions
    set state = 'reversed'
    where decision_id = decision_row.id and state = 'active';
  end if;

  update public.moderation_appeals
  set status = case when p_outcome = 'reverse' then 'reversed' else 'upheld' end,
      reviewed_by = uid, reviewed_at = clock_timestamp(), review_reason = normalized_reason
  where id = p_appeal_id
  returning * into appeal_row;

  insert into public.moderation_notices (decision_id, user_id, kind, title, body)
  values (
    decision_row.id, appeal_row.user_id,
    case when p_outcome = 'reverse' then 'appeal_reversed' else 'appeal_upheld' end,
    case when p_outcome = 'reverse' then 'Your appeal was approved' else 'Your appeal was reviewed' end,
    case when p_outcome = 'reverse'
      then 'We reversed the original decision and restored the affected content when restoration was possible. ' || normalized_reason
      else 'We upheld the original decision after a new review. ' || normalized_reason end
  );

  insert into public.admin_audit_log (
    actor_id, actor_role, action, entity_type, entity_id, reason, request_id, metadata
  ) values (
    uid, public.admin_current_operator_role(), 'appeal.' || p_outcome,
    'moderation_appeal', p_appeal_id::text, normalized_reason, p_idempotency_key,
    jsonb_build_object('decisionId', decision_row.id, 'originalDeciderId', decision_row.decided_by)
  );

  perform public.enqueue_domain_event(
    'moderation:global', 'moderation.appeal.reviewed', p_appeal_id,
    jsonb_build_object('version', 1, 'appealId', p_appeal_id), null
  );
  perform public.enqueue_domain_event(
    'user:' || appeal_row.user_id::text || ':events', 'moderation.status.changed', decision_row.id,
    jsonb_build_object('version', 1, 'decisionId', decision_row.id), null
  );

  final_result := jsonb_build_object(
    'appeal_id', appeal_row.id,
    'decision_id', appeal_row.decision_id,
    'status', appeal_row.status,
    'reviewed_at', appeal_row.reviewed_at
  );
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.admin_review_moderation_appeal(uuid, text, text, text)
  from public, anon;
grant execute on function public.admin_review_moderation_appeal(uuid, text, text, text)
  to authenticated;

comment on function public.admin_decide_report_v2(uuid, text, text, text, text, text, text) is
  'Records a classified, reversible moderation outcome. Routine removals warn and notify; serious cases quarantine into restricted review.';
comment on function public.submit_moderation_appeal(uuid, text, text) is
  'Creates one idempotent server-owned appeal for the affected user.';
comment on function public.admin_review_moderation_appeal(uuid, text, text, text) is
  'Requires an independent AAL2 moderation operator and atomically upholds or reverses an appeal.';

-- Retire the original destructive command. Keeping the signature produces an
-- explicit upgrade error for a stale portal instead of allowing a hard delete.
create or replace function public.admin_decide_report(
  p_report_id uuid,
  p_action text,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_action = 'dismiss' then
    return public.admin_decide_report_v2(
      p_report_id,
      'no_violation',
      'no_violation',
      'none',
      p_reason,
      'We reviewed this report and found no policy violation.',
      p_idempotency_key
    );
  end if;
  raise exception 'This portal is out of date. Reload before recording an enforcement action.';
end;
$$;

revoke all on function public.admin_decide_report(uuid, text, text, text)
  from public, anon;
grant execute on function public.admin_decide_report(uuid, text, text, text)
  to authenticated;

create or replace function public.get_post_detail(p_post_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select (to_jsonb(post) - 'idempotency_key' - 'moderation_status') || jsonb_build_object(
    'profile', case when profile.id is null then null else jsonb_build_object(
      'id', profile.id, 'username', profile.username,
      'display_name', profile.display_name, 'avatar_url', profile.avatar_url,
      'avatar_gradient', profile.avatar_gradient,
      'equipped_border_key', profile.equipped_border_key,
      'equipped_title_key', profile.equipped_title_key
    ) end,
    'challenge', to_jsonb(challenge),
    'daily_event', to_jsonb(event) || jsonb_build_object('challenge', to_jsonb(challenge))
  )
  from public.posts post
  join public.daily_events event on event.id = post.daily_event_id
  join public.challenges challenge on challenge.id = event.challenge_id
  left join public.profiles profile on profile.id = post.user_id
  where post.id = p_post_id
    and post.moderation_status = 'visible'
    and post.daily_event_id = (
      select current_event.id from public.daily_events current_event
      where current_event.activated_at is not null or current_event.prelive_at is not null
      order by coalesce(current_event.activated_at, current_event.prelive_at) desc,
               current_event.created_at desc
      limit 1
    )
    and auth.uid() is not null
    and public.can_view_full_post(p_post_id, auth.uid())
    and not exists (
      select 1 from public.blocks block
      where (block.blocker_id = auth.uid() and block.blocked_id = post.user_id)
         or (block.blocker_id = post.user_id and block.blocked_id = auth.uid())
    );
$$;

revoke all on function public.get_post_detail(uuid) from public, anon;
grant execute on function public.get_post_detail(uuid) to authenticated;

create or replace function public.get_current_profile_post(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid(); current_event_id uuid; current_post_id uuid;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select event.id into current_event_id from public.daily_events event
  where event.activated_at is not null or event.prelive_at is not null
  order by coalesce(event.activated_at, event.prelive_at) desc, event.created_at desc limit 1;
  if current_event_id is null then return null; end if;
  select post.id into current_post_id
  from public.posts post join public.profiles profile on profile.id = post.user_id
  where post.daily_event_id = current_event_id and post.user_id = p_user_id
    and post.moderation_status = 'visible'
    and post.is_community_poll is not true and coalesce(post.is_demo, false) is false
    and coalesce(profile.is_banned, false) is false
    and coalesce(profile.is_demo_account, false) is false
  order by post.created_at desc, post.id desc limit 1;
  if current_post_id is null then return null; end if;
  return public.get_post_detail(current_post_id);
end;
$$;

revoke all on function public.get_current_profile_post(uuid) from public, anon;
grant execute on function public.get_current_profile_post(uuid) to authenticated;

create or replace function public.can_read_post_media(
  p_object_path text,
  p_viewer uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1 from public.posts post
    where (
        public.public_storage_object_path(post.photo_url, 'post-media') = p_object_path
        or public.public_storage_object_path(post.front_photo_url, 'post-media') = p_object_path
        or public.public_storage_object_path(post.video_url, 'post-media') = p_object_path
      )
      and (
        (
          post.moderation_status = 'visible'
          and public.can_view_full_post(p_viewer, post.user_event_id, post.daily_event_id,
            post.user_id, coalesce(post.is_community_poll, false))
        )
        or (
          p_viewer = auth.uid()
          and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
          and public.admin_user_has_permission('moderation.read')
          and exists (
            select 1 from public.reports report
            left join public.admin_report_triage triage on triage.report_id = report.id
            where report.post_id = post.id
              and (
                (report.status = 'pending' and coalesce(triage.queue, 'moderation') = 'moderation')
                or (public.admin_user_has_permission('legal.read')
                  and coalesce(triage.queue, 'moderation') = 'restricted_safety')
              )
          )
        )
      )
  ), false);
$$;

revoke all on function public.can_read_post_media(text, uuid) from public, anon;
grant execute on function public.can_read_post_media(text, uuid) to authenticated;

create or replace function public.moderate_report(
  p_report_id uuid,
  p_action text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Moderation decisions moved to the protected admin portal. Reload and use admin.dojipro.com.';
end;
$$;

revoke all on function public.moderate_report(uuid, text, text) from public, anon;
grant execute on function public.moderate_report(uuid, text, text) to authenticated;

-- Preserve the established notification snapshot, filter references to hidden
-- content, and add member-facing moderation notices without a second request.
alter function public.get_notification_center_snapshot(timestamptz, integer)
  rename to get_notification_center_snapshot_without_moderation;
revoke all on function public.get_notification_center_snapshot_without_moderation(timestamptz, integer)
  from public, anon, authenticated;

create function public.get_notification_center_snapshot(
  p_since timestamptz,
  p_limit integer default 200
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with original as (
    select value item
    from jsonb_array_elements(
      public.get_notification_center_snapshot_without_moderation(
        p_since,
        least(greatest(coalesce(p_limit, 200), 1), 250)
      )
    )
  ), visible_original as (
    select item from original
    where (
      nullif(item ->> 'post_id', '') is null
      or exists (
        select 1 from public.posts post
        where post.id = nullif(item ->> 'post_id', '')::uuid
          and post.moderation_status = 'visible'
      )
    ) and (
      nullif(item ->> 'comment_id', '') is null
      or exists (
        select 1 from public.comments comment
        where comment.id = nullif(item ->> 'comment_id', '')::uuid
          and comment.moderation_status = 'visible'
      )
    )
  ), moderation_items as (
    select jsonb_build_object(
      'key', 'moderation_notice:' || notice.id,
      'kind', 'moderation_notice',
      'notice_id', notice.id,
      'decision_id', notice.decision_id,
      'title', notice.title,
      'body', notice.body,
      'notice_kind', notice.kind,
      'sortAt', notice.created_at
    ) item
    from public.moderation_notices notice
    where notice.user_id = auth.uid() and notice.created_at > p_since
  ), combined as (
    select item from visible_original
    union all
    select item from moderation_items
  ), bounded as (
    select item from combined
    order by (item ->> 'sortAt')::timestamptz desc
    limit least(greatest(coalesce(p_limit, 200), 1), 250)
  )
  select coalesce(jsonb_agg(item order by (item ->> 'sortAt')::timestamptz desc), '[]'::jsonb)
  from bounded;
$$;

revoke all on function public.get_notification_center_snapshot(timestamptz, integer)
  from public, anon;
grant execute on function public.get_notification_center_snapshot(timestamptz, integer)
  to authenticated;
