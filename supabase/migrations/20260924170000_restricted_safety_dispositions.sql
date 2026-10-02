-- Complete restricted safety review without reintroducing the legacy destructive
-- ban path. Content and account consequences remain explicit, reversible, and
-- attached to one audited moderation decision.

create unique index if not exists moderation_account_actions_decision_idx
  on public.moderation_account_actions (decision_id);

create table if not exists public.moderation_account_content_states (
  account_action_id uuid not null references public.moderation_account_actions(id) on delete cascade,
  content_kind text not null check (content_kind in ('post', 'comment', 'poll_response')),
  content_id uuid not null,
  prior_status text not null check (prior_status in ('visible', 'quarantined', 'removed')),
  captured_at timestamptz not null default clock_timestamp(),
  primary key (account_action_id, content_kind, content_id)
);

alter table public.moderation_account_content_states enable row level security;
revoke all on table public.moderation_account_content_states from public, anon, authenticated;

comment on table public.moderation_account_content_states is
  'Private restoration ledger for content hidden by a reversible permanent account suspension.';

-- Keep the established is_banned compatibility gate for old clients, but preserve
-- rows for evidence and appeal instead of deleting a member's content/social data.
create or replace function public.purge_newly_banned_user_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_banned is not true and new.is_banned is true then
    update public.posts
    set moderation_status = 'removed'
    where user_id = new.id and moderation_status <> 'removed';

    update public.comments
    set moderation_status = 'removed'
    where user_id = new.id and moderation_status <> 'removed';

    update public.poll_votes
    set moderation_status = 'removed'
    where user_id = new.id and moderation_status <> 'removed';
  end if;
  return new;
end;
$$;

revoke all on function public.purge_newly_banned_user_content()
  from public, anon, authenticated;

-- Table-boundary authorization covers old and new clients. Temporary restrictions
-- expire by server time and therefore never depend on a handset timer or push.
create or replace function public.reject_banned_actor_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  restriction_kind text;
begin
  if uid is null then return new; end if;

  select case
    when profile.is_banned is true or exists (
      select 1 from public.moderation_account_actions action_row
      where action_row.user_id = uid
        and action_row.action = 'permanent_ban'
        and action_row.state = 'active'
    ) then 'suspended'
    when exists (
      select 1 from public.moderation_account_actions action_row
      where action_row.user_id = uid
        and action_row.action = 'temporary_restriction'
        and action_row.state = 'active'
        and action_row.ends_at > clock_timestamp()
    ) then 'temporarily restricted'
    else null
  end
  into restriction_kind
  from public.profiles profile
  where profile.id = uid;

  if restriction_kind is not null then
    raise exception using
      errcode = '42501',
      message = case when restriction_kind = 'suspended'
        then 'This account is suspended'
        else 'This account is temporarily restricted' end;
  end if;
  return new;
end;
$$;

revoke all on function public.reject_banned_actor_write()
  from public, anon, authenticated;

create or replace function public.get_admin_portal_session_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base jsonb;
begin
  base := public.get_admin_portal_session();
  return base || jsonb_build_object(
    'version', 3,
    'read_only', false,
    'capabilities', jsonb_build_object(
      'moderation_read', public.admin_user_has_permission('moderation.read'),
      'moderation_write', public.admin_user_has_permission('moderation.write'),
      'restricted_review', public.admin_user_has_permission('moderation.write')
        and public.admin_user_has_permission('legal.read')
    )
  );
end;
$$;

revoke all on function public.get_admin_portal_session_v2() from public, anon;
grant execute on function public.get_admin_portal_session_v2() to authenticated;

create or replace function public.admin_decide_report_v3(
  p_report_id uuid,
  p_action text,
  p_policy_code text,
  p_severity text,
  p_reason text,
  p_user_notice text,
  p_account_action text default null,
  p_restriction_days integer default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  triage_row public.admin_report_triage%rowtype;
  report_row public.reports%rowtype;
  v_result jsonb;
  v_decision_id uuid;
  v_account_action_id uuid;
  v_affected_user_id uuid;
  v_restriction_ends_at timestamptz;
  restricted_case boolean := false;
  delegated_severity text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Administrator MFA required';
  end if;
  if not public.admin_user_has_permission('moderation.write') then
    raise exception 'Moderation write access required';
  end if;
  if char_length(coalesce(p_idempotency_key, '')) not between 16 and 160 then
    raise exception 'Invalid idempotency key';
  end if;

  select * into report_row from public.reports where id = p_report_id;
  if not found then raise exception 'Report not found'; end if;
  select * into triage_row from public.admin_report_triage where report_id = p_report_id;
  restricted_case := coalesce(triage_row.queue, 'moderation') = 'restricted_safety';

  if not restricted_case then
    if p_account_action is not null and p_account_action <> 'warning' then
      raise exception 'Account restrictions require restricted safety review';
    end if;
    return public.admin_decide_report_v2(
      p_report_id, p_action, p_policy_code, p_severity,
      p_reason, p_user_notice, p_idempotency_key
    );
  end if;

  if not public.admin_user_has_permission('legal.read') then
    raise exception 'Restricted safety authorization required';
  end if;
  if p_action not in ('no_violation', 'remove_content', 'remove_profile_photo') then
    raise exception 'Choose a final restricted-review disposition';
  end if;
  if p_action = 'no_violation' then
    if p_account_action is not null or p_severity <> 'none' or p_policy_code <> 'no_violation' then
      raise exception 'No violation cannot apply an account consequence';
    end if;
  else
    if p_severity not in ('level_2', 'level_3') then
      raise exception 'Restricted review requires Level 2 or Level 3 classification';
    end if;
    if p_account_action not in ('warning', 'temporary_restriction', 'permanent_ban') then
      raise exception 'Choose the account consequence separately from content removal';
    end if;
    if p_account_action = 'temporary_restriction'
       and p_restriction_days not in (1, 3, 7, 30) then
      raise exception 'Temporary restrictions must be 1, 3, 7, or 30 days';
    end if;
    if p_account_action <> 'temporary_restriction' and p_restriction_days is not null then
      raise exception 'Only temporary restrictions have an expiration';
    end if;
  end if;

  if p_action = 'remove_profile_photo' and report_row.target_kind <> 'profile_photo' then
    raise exception 'This report is not for a profile photo';
  end if;
  if p_action = 'remove_content' and report_row.target_kind not in ('post', 'comment', 'poll_response') then
    raise exception 'This report does not contain removable post content';
  end if;

  -- The established command owns locking, idempotency, evidence preservation,
  -- report closure, audit, notice creation, and outbox insertion. It permits a
  -- finalized removal at Level 2; restricted review then records Level 3 and the
  -- distinct account consequence in this same transaction.
  delegated_severity := case when p_action = 'no_violation' then 'none' else 'level_2' end;
  v_result := public.admin_decide_report_v2(
    p_report_id, p_action, p_policy_code, delegated_severity,
    p_reason, p_user_notice, p_idempotency_key
  );

  v_decision_id := nullif(v_result ->> 'decision_id', '')::uuid;
  select decision.affected_user_id into v_affected_user_id
  from public.moderation_decisions decision where decision.id = v_decision_id;

  if p_action <> 'no_violation' then
    update public.moderation_decisions
    set severity = p_severity
    where id = v_decision_id;

    update public.moderation_account_actions
    set action = p_account_action,
        starts_at = clock_timestamp(),
        ends_at = case when p_account_action = 'temporary_restriction'
          then clock_timestamp() + make_interval(days => p_restriction_days)
          else null end,
        state = 'active'
    where moderation_account_actions.decision_id = v_decision_id
    returning id, ends_at into v_account_action_id, v_restriction_ends_at;

    update public.moderation_notices
    set title = case p_account_action
      when 'temporary_restriction' then 'Your account is temporarily restricted'
      when 'permanent_ban' then 'Your account has been suspended'
      else case when p_action = 'remove_profile_photo'
        then 'Your profile photo was removed'
        else 'Your content was removed' end
    end
    where moderation_notices.decision_id = v_decision_id and kind = 'decision';

    update public.admin_audit_log
    set metadata = metadata || jsonb_build_object(
      'accountAction', p_account_action,
      'restrictionDays', p_restriction_days,
      'restrictedReview', true,
      'severity', p_severity
    )
    where request_id = p_idempotency_key
      and entity_type = 'report'
      and entity_id = p_report_id::text;

    update public.domain_event_outbox event
    set payload = event.payload || jsonb_build_object(
      'accountAction', p_account_action,
      'restrictionEndsAt', v_restriction_ends_at,
      'sendEmail', p_severity in ('level_2', 'level_3')
    )
    where event.event_type = 'moderation.status.changed'
      and event.aggregate_id = v_decision_id
      and event.published_at is null;

    if p_account_action = 'permanent_ban' then
      insert into public.moderation_account_content_states (
        account_action_id, content_kind, content_id, prior_status
      )
      select v_account_action_id, 'post', post.id, post.moderation_status
      from public.posts post
      where post.user_id = v_affected_user_id
        and post.id is distinct from case when report_row.post_id is not null then report_row.post_id else null end
      on conflict do nothing;

      insert into public.moderation_account_content_states (
        account_action_id, content_kind, content_id, prior_status
      )
      select v_account_action_id, 'comment', comment.id, comment.moderation_status
      from public.comments comment
      where comment.user_id = v_affected_user_id
        and comment.id is distinct from case when report_row.comment_id is not null then report_row.comment_id else null end
      on conflict do nothing;

      insert into public.moderation_account_content_states (
        account_action_id, content_kind, content_id, prior_status
      )
      select v_account_action_id, 'poll_response', vote.id, vote.moderation_status
      from public.poll_votes vote
      where vote.user_id = v_affected_user_id
        and vote.id is distinct from case when report_row.poll_vote_id is not null then report_row.poll_vote_id else null end
      on conflict do nothing;

      update public.profiles set is_banned = true where id = v_affected_user_id;
    end if;
  end if;

  v_result := v_result || jsonb_build_object(
    'restricted_review', true,
    'account_action', p_account_action,
    'restriction_ends_at', v_restriction_ends_at
  );
  update public.command_receipts
  set result = v_result
  where user_id = auth.uid() and idempotency_key = p_idempotency_key;
  return v_result;
end;
$$;

revoke all on function public.admin_decide_report_v3(uuid, text, text, text, text, text, text, integer, text)
  from public, anon;
grant execute on function public.admin_decide_report_v3(uuid, text, text, text, text, text, text, integer, text)
  to authenticated;

comment on function public.admin_decide_report_v3(uuid, text, text, text, text, text, text, integer, text) is
  'Finalizes ordinary or restricted reports atomically while keeping content action, account consequence, expiry, notice, audit, and reversal state explicit.';

alter function public.admin_review_moderation_appeal(uuid, text, text, text)
  rename to admin_review_moderation_appeal_before_account_restrictions_20260924;

revoke all on function public.admin_review_moderation_appeal_before_account_restrictions_20260924(uuid, text, text, text)
  from public, anon, authenticated;

create function public.admin_review_moderation_appeal(
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
  v_result jsonb;
  selected_action public.moderation_account_actions%rowtype;
  selected_user_id uuid;
begin
  select appeal.user_id into selected_user_id
  from public.moderation_appeals appeal where appeal.id = p_appeal_id;

  select account_action.* into selected_action
  from public.moderation_appeals appeal
  join public.moderation_account_actions account_action
    on account_action.decision_id = appeal.decision_id
  where appeal.id = p_appeal_id;

  v_result := public.admin_review_moderation_appeal_before_account_restrictions_20260924(
    p_appeal_id, p_outcome, p_reason, p_idempotency_key
  );

  if p_outcome = 'reverse' and selected_action.action = 'permanent_ban' then
    if not exists (
      select 1 from public.moderation_account_actions other_action
      where other_action.user_id = selected_user_id
        and other_action.action = 'permanent_ban'
        and other_action.state = 'active'
    ) then
      update public.profiles set is_banned = false where id = selected_user_id;
    end if;

    update public.posts post
    set moderation_status = prior.prior_status
    from public.moderation_account_content_states prior
    where prior.account_action_id = selected_action.id
      and prior.content_kind = 'post' and prior.content_id = post.id;

    update public.comments comment
    set moderation_status = prior.prior_status
    from public.moderation_account_content_states prior
    where prior.account_action_id = selected_action.id
      and prior.content_kind = 'comment' and prior.content_id = comment.id;

    update public.poll_votes vote
    set moderation_status = prior.prior_status
    from public.moderation_account_content_states prior
    where prior.account_action_id = selected_action.id
      and prior.content_kind = 'poll_response' and prior.content_id = vote.id;
  end if;

  return v_result || jsonb_build_object('account_action_reversed',
    p_outcome = 'reverse' and selected_action.id is not null);
end;
$$;

revoke all on function public.admin_review_moderation_appeal(uuid, text, text, text)
  from public, anon;
grant execute on function public.admin_review_moderation_appeal(uuid, text, text, text)
  to authenticated;

create or replace function public.get_my_moderation_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then
    jsonb_build_object('account_access', null, 'notices', '[]'::jsonb, 'decisions', '[]'::jsonb)
  else jsonb_build_object(
    'account_access', (
      select jsonb_build_object(
        'state', case
          when profile.is_banned is true or access.action = 'permanent_ban' then 'suspended'
          when access.action = 'temporary_restriction' and access.ends_at > clock_timestamp() then 'temporarily_restricted'
          else 'active' end,
        'decision_id', access.decision_id,
        'ends_at', access.ends_at,
        'title', notice.title,
        'body', notice.body,
        'appeal_eligible', coalesce(decision.appeal_eligible, false),
        'appeal_status', appeal.status
      )
      from public.profiles profile
      left join lateral (
        select action_row.* from public.moderation_account_actions action_row
        where action_row.user_id = auth.uid()
          and action_row.state = 'active'
          and (action_row.action = 'permanent_ban'
            or (action_row.action = 'temporary_restriction' and action_row.ends_at > clock_timestamp()))
        order by case action_row.action when 'permanent_ban' then 0 else 1 end,
          action_row.created_at desc
        limit 1
      ) access on true
      left join public.moderation_decisions decision on decision.id = access.decision_id
      left join public.moderation_appeals appeal on appeal.decision_id = access.decision_id
      left join public.moderation_notices notice
        on notice.decision_id = access.decision_id and notice.kind = 'decision'
      where profile.id = auth.uid()
    ),
    'notices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', notice.id, 'decision_id', notice.decision_id, 'kind', notice.kind,
        'title', notice.title, 'body', notice.body, 'created_at', notice.created_at,
        'read_at', notice.read_at
      ) order by notice.created_at desc, notice.id desc)
      from (select * from public.moderation_notices where user_id = auth.uid()
        order by created_at desc, id desc limit 50) notice
    ), '[]'::jsonb),
    'decisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', decision.id, 'content_kind', decision.content_kind,
        'action', decision.action, 'policy_code', decision.policy_code,
        'severity', decision.severity, 'user_notice', decision.user_notice,
        'appeal_eligible', decision.appeal_eligible, 'state', decision.state,
        'decided_at', decision.decided_at,
        'account_action', case when account_action.id is null then null else jsonb_build_object(
          'action', account_action.action,
          'state', case when account_action.action = 'temporary_restriction'
              and account_action.state = 'active'
              and account_action.ends_at <= clock_timestamp()
            then 'expired' else account_action.state end,
          'starts_at', account_action.starts_at, 'ends_at', account_action.ends_at
        ) end,
        'appeal', case when appeal.id is null then null else jsonb_build_object(
          'id', appeal.id, 'status', appeal.status, 'statement', appeal.statement,
          'submitted_at', appeal.submitted_at, 'reviewed_at', appeal.reviewed_at,
          'review_reason', appeal.review_reason
        ) end
      ) order by decision.decided_at desc, decision.id desc)
      from (select * from public.moderation_decisions where affected_user_id = auth.uid()
        order by decided_at desc, id desc limit 50) decision
      left join public.moderation_appeals appeal on appeal.decision_id = decision.id
      left join public.moderation_account_actions account_action
        on account_action.decision_id = decision.id
    ), '[]'::jsonb)
  ) end;
$$;

revoke all on function public.get_my_moderation_status() from public, anon;
grant execute on function public.get_my_moderation_status() to authenticated;

comment on function public.get_my_moderation_status() is
  'Returns private member notices, decisions, appeals, and the server-authoritative effective account access state.';
