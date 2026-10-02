-- Resolved moderation work is an archive, not part of the latency-sensitive open
-- queue. Expose it through a separate bounded keyset page and enrich the existing
-- protected case read with the final decision and delivery state.

create index if not exists admin_report_triage_resolved_page_idx
  on public.admin_report_triage (resolved_at desc, report_id desc)
  where resolved_at is not null;

create or replace function public.get_admin_resolved_reports_page_v1(
  p_limit integer default 25,
  p_before_resolved_at timestamptz default null,
  p_before_report_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  bounded_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  result jsonb;
begin
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Administrator MFA required';
  end if;
  if not public.admin_user_has_permission('moderation.read') then
    raise exception 'Moderation access required';
  end if;
  if (p_before_resolved_at is null) <> (p_before_report_id is null) then
    raise exception 'Resolved report cursor is incomplete';
  end if;

  with resolved_rows as materialized (
    select
      report.id,
      report.target_kind,
      report.reason,
      report.reason_detail,
      report.created_at as submitted_at,
      triage.resolved_at,
      coalesce(triage.priority, 'normal') as priority,
      report.status as report_status,
      decision.id as decision_id,
      decision.action as decision_action,
      decision.policy_code,
      decision.severity,
      decision.state as decision_state,
      account_action.action as account_action,
      account_action.state as account_action_state,
      account_action.ends_at as restriction_ends_at,
      appeal.status as appeal_status,
      coalesce(
        nullif(resolver.display_name, ''), nullif(resolver.username, ''),
        nullif(decider.display_name, ''), nullif(decider.username, ''),
        'Authorized operator'
      ) as owner,
      case report.target_kind
        when 'post' then coalesce(post.moderation_status, 'unavailable')
        when 'comment' then coalesce(comment.moderation_status, 'unavailable')
        when 'poll_response' then coalesce(vote.moderation_status, 'unavailable')
        when 'profile_photo' then case when reported.is_banned then 'banned' else 'active' end
        when 'account' then case when reported.is_banned then 'banned' else 'active' end
        else 'unavailable'
      end as content_state
    from public.admin_report_triage triage
    join public.reports report on report.id = triage.report_id
    left join lateral (
      select selected.*
      from public.moderation_decisions selected
      where selected.report_id = report.id
      order by
        case selected.state when 'active' then 0 when 'reversed' then 1 else 2 end,
        selected.decided_at desc,
        selected.id desc
      limit 1
    ) decision on true
    left join public.moderation_account_actions account_action
      on account_action.decision_id = decision.id
    left join public.moderation_appeals appeal on appeal.decision_id = decision.id
    left join public.profiles resolver on resolver.id = triage.resolved_by
    left join public.profiles decider on decider.id = decision.decided_by
    left join public.profiles reported on reported.id = report.reported_user_id
    left join public.posts post on post.id = report.post_id
    left join public.comments comment on comment.id = report.comment_id
    left join public.poll_votes vote on vote.id = report.poll_vote_id
    where report.status in ('dismissed', 'actioned')
      and triage.resolved_at is not null
      and (
        p_before_resolved_at is null
        or (triage.resolved_at, report.id) < (p_before_resolved_at, p_before_report_id)
      )
    order by triage.resolved_at desc, report.id desc
    limit bounded_limit + 1
  ), page as (
    select * from resolved_rows
    order by resolved_at desc, id desc
    limit bounded_limit
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'queue', 'moderation',
        'subject', case item.target_kind
          when 'post' then 'Post report'
          when 'comment' then 'Comment report'
          when 'poll_response' then 'Poll response report'
          when 'profile_photo' then 'Profile photo report'
          else 'Account report'
        end,
        'secondary', initcap(replace(coalesce(item.reason_detail, item.reason), '_', ' ')),
        'category', case item.reason
          when 'bullying_harassment' then 'Bullying or unwanted contact'
          when 'self_harm' then 'Suicide, self-harm or eating disorders'
          when 'violence_hate_exploitation' then 'Violence, hate or exploitation'
          when 'restricted_goods' then 'Selling or promoting restricted items'
          when 'sexual_content' then 'Nudity or sexual activity'
          when 'spam_scam' then 'Scam, fraud or spam'
          when 'intellectual_property' then 'Intellectual property'
          when 'privacy' then 'Privacy violation'
          when 'impersonation' then 'Impersonation'
          else initcap(replace(item.reason, '_', ' '))
        end,
        'submitted_at', item.submitted_at,
        'resolved_at', item.resolved_at,
        'status', 'resolved',
        'label', case
          when item.decision_state = 'reversed' then 'Reversed'
          when item.report_status = 'dismissed' then 'No violation'
          else 'Action taken'
        end,
        'priority', item.priority,
        'summary', case
          when item.decision_state = 'reversed' then 'The original moderation decision was reversed after review.'
          when item.report_status = 'dismissed' then 'The report was reviewed and closed without enforcement.'
          else 'The report was reviewed and an enforcement decision was applied.'
        end,
        'visibility', case item.content_state
          when 'visible' then 'Visible in app'
          when 'removed' then 'Removed from members'
          when 'quarantined' then 'Quarantined from members'
          when 'banned' then 'Account suspended'
          when 'active' then 'Account active'
          else 'Content unavailable'
        end,
        'owner', item.owner,
        'source', 'In-app report',
        'next_step', case item.appeal_status
          when 'pending' then 'An independent appeal review is pending.'
          when 'reversed' then 'The appeal reversed the original decision; no further action is required.'
          when 'upheld' then 'The appeal upheld the original decision; no further action is required.'
          else 'No further action is required unless the member appeals.'
        end,
        'decision_id', item.decision_id,
        'decision_action', item.decision_action,
        'policy_code', item.policy_code,
        'severity', item.severity,
        'decision_state', item.decision_state,
        'account_action', item.account_action,
        'account_action_state', item.account_action_state,
        'restriction_ends_at', item.restriction_ends_at,
        'appeal_status', item.appeal_status
      ) order by item.resolved_at desc, item.id desc)
      from page item
    ), '[]'::jsonb),
    'next_cursor', case
      when (select count(*) from resolved_rows) > bounded_limit then (
        select jsonb_build_object(
          'resolved_at', cursor_row.resolved_at,
          'report_id', cursor_row.id
        )
        from page cursor_row
        order by cursor_row.resolved_at desc, cursor_row.id desc
        offset bounded_limit - 1 limit 1
      )
      else null
    end
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_admin_resolved_reports_page_v1(integer, timestamptz, uuid)
  from public, anon;
grant execute on function public.get_admin_resolved_reports_page_v1(integer, timestamptz, uuid)
  to authenticated;

comment on function public.get_admin_resolved_reports_page_v1(integer, timestamptz, uuid) is
  'Returns a bounded keyset page of resolved moderation cases without adding archive work to the active command-center snapshot.';

alter function public.get_admin_report_case_v2(uuid)
  rename to get_admin_report_case_v2_before_resolved_archive_20260924;

revoke all on function public.get_admin_report_case_v2_before_resolved_archive_20260924(uuid)
  from public, anon, authenticated;

create function public.get_admin_report_case_v2(p_report_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  base jsonb;
  decision_summary jsonb := null;
begin
  -- The prior function retains AAL2 authorization, safe evidence shaping, and
  -- immutable evidence-access auditing.
  base := public.get_admin_report_case_v2_before_resolved_archive_20260924(p_report_id);

  select jsonb_build_object(
    'id', decision.id,
    'action', decision.action,
    'policy_code', decision.policy_code,
    'severity', decision.severity,
    'state', decision.state,
    'rationale', decision.rationale,
    'member_notice', decision.user_notice,
    'appeal_eligible', decision.appeal_eligible,
    'decided_at', decision.decided_at,
    'decided_by', case when decider.id is null then null else jsonb_build_object(
      'id', decider.id,
      'username', decider.username,
      'display_name', decider.display_name
    ) end,
    'reversed_at', decision.reversed_at,
    'reversal_reason', decision.reversal_reason,
    'account_action', account_action.action,
    'account_action_state', account_action.state,
    'restriction_ends_at', account_action.ends_at,
    'notice_status', case
      when notice.id is null then 'not_requested'
      when notice.read_at is null then 'delivered'
      else 'read'
    end,
    'push_status', case
      when decision.action not in ('remove_content', 'remove_profile_photo') then 'not_requested'
      when push.total > 0 and push.accepted > 0 then 'accepted'
      when push.total > 0 and push.pending > 0 then 'pending'
      when push.total > 0 then 'failed'
      when event.id is not null and event.published_at is null then 'pending'
      else 'not_sent'
    end,
    'email_status', coalesce(email.status, case
      when decision.action in ('remove_content', 'remove_profile_photo')
        and decision.severity in ('level_2', 'level_3') then 'pending'
      else 'not_requested'
    end),
    'appeal_status', appeal.status,
    'appeal_submitted_at', appeal.submitted_at,
    'appeal_reviewed_at', appeal.reviewed_at
  )
  into decision_summary
  from public.moderation_decisions decision
  left join public.profiles decider on decider.id = decision.decided_by
  left join public.moderation_account_actions account_action
    on account_action.decision_id = decision.id
  left join public.moderation_notices notice
    on notice.decision_id = decision.id and notice.kind = 'decision'
  left join public.moderation_appeals appeal on appeal.decision_id = decision.id
  left join public.member_moderation_email_deliveries email
    on email.decision_id = decision.id
  left join lateral (
    select selected.id, selected.published_at
    from public.domain_event_outbox selected
    where selected.event_type = 'moderation.status.changed'
      and selected.aggregate_id = decision.id
    order by selected.created_at desc, selected.id desc
    limit 1
  ) event on true
  left join lateral (
    select
      count(*)::integer as total,
      count(*) filter (where claim.outcome = 'accepted')::integer as accepted,
      count(*) filter (where claim.outcome is null or claim.outcome in ('claimed', 'transport_error'))::integer as pending
    from public.push_delivery_claims claim
    where claim.aggregate_id = decision.id::text
      and claim.category = 'reviews_account'
  ) push on true
  where decision.report_id = p_report_id
  order by
    case decision.state when 'active' then 0 when 'reversed' then 1 else 2 end,
    decision.decided_at desc,
    decision.id desc
  limit 1;

  return base || jsonb_build_object('decision_summary', decision_summary);
end;
$$;

revoke all on function public.get_admin_report_case_v2(uuid) from public, anon;
grant execute on function public.get_admin_report_case_v2(uuid) to authenticated;

comment on function public.get_admin_report_case_v2(uuid) is
  'Returns one protected report case with meaningful workflow history plus final decision, account consequence, notice, push, email, and appeal status.';
