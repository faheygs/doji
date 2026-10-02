-- A case timeline is an operational workflow, not a raw evidence-access ledger.
-- Preserve every access in admin_audit_log while returning triage events and a
-- compact access summary as separate bounded fields.
alter function public.get_admin_report_case_v2(uuid)
  rename to get_admin_report_case_v2_before_history_20260924;

revoke all on function public.get_admin_report_case_v2_before_history_20260924(uuid)
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
  workflow_history jsonb := '[]'::jsonb;
  evidence_access jsonb := '{}'::jsonb;
  triage_state jsonb := '{}'::jsonb;
begin
  -- Retains AAL2/permission enforcement and the immutable access record.
  base := public.get_admin_report_case_v2_before_history_20260924(p_report_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', entry.id,
    'occurred_at', entry.occurred_at,
    'actor_role', entry.actor_role,
    'actor', case when actor.id is null then null else jsonb_build_object(
      'id', actor.id,
      'username', actor.username,
      'display_name', actor.display_name
    ) end,
    'action', entry.action,
    'reason', entry.reason,
    'metadata', coalesce(entry.metadata, '{}'::jsonb)
  ) order by entry.occurred_at desc, entry.id desc), '[]'::jsonb)
  into workflow_history
  from (
    select audit.id, audit.occurred_at, audit.actor_id, audit.actor_role,
      audit.action, audit.reason, audit.metadata
    from public.admin_audit_log audit
    where audit.entity_type = 'report'
      and audit.entity_id = p_report_id::text
      and audit.action <> 'report.evidence_viewed'
    order by audit.occurred_at desc, audit.id desc
    limit 50
  ) entry
  left join public.profiles actor on actor.id = entry.actor_id;

  select jsonb_build_object(
    'view_count', count(*)::integer,
    'last_viewed_at', max(audit.occurred_at),
    'last_viewer', (
      select case when viewer.id is null then jsonb_build_object(
        'role', latest.actor_role
      ) else jsonb_build_object(
        'id', viewer.id,
        'username', viewer.username,
        'display_name', viewer.display_name,
        'role', latest.actor_role
      ) end
      from public.admin_audit_log latest
      left join public.profiles viewer on viewer.id = latest.actor_id
      where latest.entity_type = 'report'
        and latest.entity_id = p_report_id::text
        and latest.action = 'report.evidence_viewed'
      order by latest.occurred_at desc, latest.id desc
      limit 1
    )
  )
  into evidence_access
  from public.admin_audit_log audit
  where audit.entity_type = 'report'
    and audit.entity_id = p_report_id::text
    and audit.action = 'report.evidence_viewed';

  select jsonb_build_object(
    'queue', coalesce(triage.queue, 'moderation'),
    'priority', coalesce(triage.priority, base ->> 'priority', 'normal'),
    'assigned_at', triage.assigned_at,
    'restricted_at', triage.restricted_at,
    'resolved_at', triage.resolved_at,
    'assigned_to', triage.assigned_to,
    'owner', base -> 'owner',
    'report_status', base ->> 'status'
  )
  into triage_state
  from public.reports report
  left join public.admin_report_triage triage on triage.report_id = report.id
  where report.id = p_report_id;

  return base || jsonb_build_object(
    'workflow_history', workflow_history,
    'evidence_access', evidence_access,
    'triage_state', triage_state
  );
end;
$$;

revoke all on function public.get_admin_report_case_v2(uuid) from public, anon;
grant execute on function public.get_admin_report_case_v2(uuid) to authenticated;

comment on function public.get_admin_report_case_v2(uuid) is
  'Returns one AAL2 report with a meaningful triage timeline and a separate compact evidence-access summary; raw access records remain immutable in admin_audit_log.';
