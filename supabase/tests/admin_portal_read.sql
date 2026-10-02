begin;

select plan(94);

select has_table('public', 'admin_operator_roles', 'admin roles are server owned');
select has_table('public', 'admin_audit_log', 'admin audit storage exists');
select has_table('public', 'admin_report_triage', 'report assignment and priority are server owned');
select has_table(
  'public', 'admin_daily_event_health_snapshots',
  'completed Dojis retain a service-owned operational summary'
);
select has_function(
  'public', 'admin_user_has_permission', array['text'],
  'portal permissions use a bounded server helper'
);
select has_function(
  'public', 'get_admin_realtime_token_capabilities', array[]::text[],
  'portal realtime authorization has a separate capability contract'
);
select has_function(
  'public', 'get_admin_portal_session', array[]::text[],
  'portal exposes a narrow operator-session contract'
);
select has_function(
  'public', 'get_admin_command_center_snapshot', array['integer'],
  'command center uses one bounded read contract'
);
select has_function(
  'public', 'get_admin_portal_session_v2', array[]::text[],
  'portal session v2 advertises narrow moderation capabilities'
);
select has_function(
  'public', 'get_admin_command_center_snapshot_v2', array['integer'],
  'command center v2 includes authoritative report triage state'
);
select has_function(
  'public', 'get_admin_audit_page_v1', array['integer', 'timestamp with time zone', 'uuid'],
  'immutable audit events use a bounded keyset-paged portal contract'
);
select has_function(
  'public', 'get_admin_audit_page_v2', array['integer', 'timestamp with time zone', 'uuid', 'text', 'text'],
  'audit history supports bounded server-side filters and search'
);
select has_function(
  'public', 'get_admin_audit_export_v1', array['text', 'text'],
  'matching audit history has a bounded raw export contract'
);
select has_function(
  'public', 'get_admin_operator_directory_v1', array[]::text[],
  'super administrators can read a safe operator directory'
);
select has_function(
  'public', 'admin_set_operator_role_v1', array['text', 'text', 'boolean', 'text', 'text'],
  'operator role changes use one atomic audited command'
);
select has_function(
  'public', 'refresh_daily_event_health_snapshots_v1', array['integer'],
  'the service monitor refreshes event-level health summaries'
);
select has_function(
  'public', 'get_admin_event_health_history_v1', array['integer'],
  'operations readers have a bounded per-Doji health history'
);
select has_function(
  'public', 'get_admin_resolved_reports_page_v1', array['integer', 'timestamp with time zone', 'uuid'],
  'resolved moderation cases use a separate bounded archive contract'
);
select has_function(
  'public', 'admin_set_report_review_state_v1', array['uuid', 'text', 'text', 'text'],
  'resolved moderation cases use an atomic follow-up review command'
);
select has_function(
  'public', 'get_admin_report_case', array['uuid'],
  'one bounded report evidence contract exists'
);
select has_function(
  'public', 'admin_triage_report', array['uuid', 'text', 'text', 'text', 'text'],
  'report assignment and priority use one atomic command'
);
select has_function(
  'public', 'admin_decide_report_v2', array['uuid', 'text', 'text', 'text', 'text', 'text', 'text'],
  'classified report enforcement uses one atomic command'
);
select has_function(
  'public', 'submit_policy_report', array['uuid', 'uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'text', 'text'],
  'member reports use one target-specific atomic command'
);
select has_trigger(
  'public', 'challenge_suggestions', 'publish_admin_suggestion_change',
  'new community ideas invalidate the admin queue'
);
select unalike(
  pg_get_functiondef('public.get_realtime_token_capabilities(uuid[])'::regprocedure),
  '%moderation.read%',
  'mobile realtime authorization does not consult portal roles'
);
select alike(
  pg_get_functiondef('public.get_admin_realtime_token_capabilities()'::regprocedure),
  '%moderation.read%',
  'portal realtime authorization checks moderation permission'
);
select alike(
  pg_get_functiondef('public.get_admin_realtime_token_capabilities()'::regprocedure),
  '%''aal2''%',
  'portal realtime authorization requires MFA assurance level two'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.get_admin_realtime_token_capabilities()',
    'execute'
  ),
  'authenticated AAL2 operators may request admin realtime capability'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.get_admin_realtime_token_capabilities()',
    'execute'
  ),
  'anonymous users cannot request admin realtime capability'
);
select ok(
  has_function_privilege('authenticated', 'public.get_admin_portal_session()', 'execute'),
  'authenticated AAL2 operators may request their portal session'
);
select ok(
  not has_function_privilege('anon', 'public.get_admin_portal_session()', 'execute'),
  'anonymous users cannot request an operator session'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.get_admin_command_center_snapshot(integer)',
    'execute'
  ),
  'authenticated AAL2 operators may request the command center'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.get_admin_command_center_snapshot(integer)',
    'execute'
  ),
  'anonymous users cannot request the command center'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.refresh_daily_event_health_snapshots_v1(integer)',
    'execute'
  ),
  'only the service monitor may refresh event health history'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.refresh_daily_event_health_snapshots_v1(integer)',
    'execute'
  ),
  'portal users cannot write event health history'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.get_admin_event_health_history_v1(integer)',
    'execute'
  ),
  'authenticated AAL2 operations readers may request event health history'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.get_admin_event_health_history_v1(integer)',
    'execute'
  ),
  'anonymous users cannot request event health history'
);
select alike(
  pg_get_functiondef('public.get_admin_event_health_history_v1(integer)'::regprocedure),
  '%''aal2''%',
  'event health history requires MFA assurance level two'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.get_admin_resolved_reports_page_v1(integer,timestamp with time zone,uuid)',
    'execute'
  ),
  'authenticated AAL2 moderation readers may request the resolved archive'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.get_admin_resolved_reports_page_v1(integer,timestamp with time zone,uuid)',
    'execute'
  ),
  'anonymous users cannot request the resolved archive'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_set_report_review_state_v1(uuid,text,text,text)',
    'execute'
  ),
  'authenticated AAL2 moderation writers may reopen a resolved case'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.admin_set_report_review_state_v1(uuid,text,text,text)',
    'execute'
  ),
  'anonymous users cannot change report review state'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_triage_report(uuid,text,text,text,text)',
    'execute'
  ),
  'authenticated AAL2 moderation operators may run triage commands'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.admin_triage_report(uuid,text,text,text,text)',
    'execute'
  ),
  'anonymous users cannot run triage commands'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_decide_report_v2(uuid,text,text,text,text,text,text)',
    'execute'
  ),
  'authenticated AAL2 moderation operators may run decision commands'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.admin_decide_report_v2(uuid,text,text,text,text,text,text)',
    'execute'
  ),
  'anonymous users cannot run decision commands'
);
select alike(
  pg_get_functiondef('public.get_admin_portal_session()'::regprocedure),
  '%admin_user_has_permission(''portal.session'')%',
  'operator session delegates to the employee permission and MFA gate'
);
select alike(
  pg_get_functiondef('public.get_admin_command_center_snapshot(integer)'::regprocedure),
  '%limit bounded_limit%',
  'command center work is bounded at the database'
);
select alike(
  pg_get_functiondef('public.get_admin_command_center_snapshot(integer)'::regprocedure),
  '%operations.read%',
  'the full command center requires the operations permission'
);
select unalike(
  pg_get_functiondef('public.get_admin_command_center_snapshot(integer)'::regprocedure),
  '%email%',
  'command center does not expose consumer email addresses'
);
select unalike(
  pg_get_functiondef('public.get_admin_command_center_snapshot(integer)'::regprocedure),
  '%birth_date%',
  'command center does not expose age-assurance evidence'
);
select alike(
  pg_get_functiondef('public.admin_triage_report(uuid,text,text,text,text)'::regprocedure),
  '%admin_triage_report_before_restricted_guard_20260924%',
  'report triage delegates to its authenticated atomic command'
);
select alike(
  pg_get_functiondef('public.admin_triage_report_before_restricted_guard_20260924(uuid,text,text,text,text)'::regprocedure),
  '%moderation.write%',
  'report triage requires the moderation write permission'
);
select alike(
  pg_get_functiondef('public.admin_decide_report_v2(uuid,text,text,text,text,text,text)'::regprocedure)
    || pg_get_functiondef('public.admin_decide_report_v2_before_member_delivery_20260924(uuid,text,text,text,text,text,text)'::regprocedure),
  '%''aal2''%',
  'report decisions require MFA assurance level two'
);
select alike(
  pg_get_functiondef('public.admin_decide_report_v2(uuid,text,text,text,text,text,text)'::regprocedure)
    || pg_get_functiondef('public.admin_decide_report_v2_before_member_delivery_20260924(uuid,text,text,text,text,text,text)'::regprocedure)
    || pg_get_functiondef('public.admin_decide_report_v2_hierarchical_legacy_20260924(uuid,text,text,text,text,text,text)'::regprocedure),
  '%admin_audit_log%',
  'report decisions append an administrator audit record'
);
select alike(
  pg_get_functiondef('public.admin_decide_report_v2(uuid,text,text,text,text,text,text)'::regprocedure)
    || pg_get_functiondef('public.admin_decide_report_v2_before_member_delivery_20260924(uuid,text,text,text,text,text,text)'::regprocedure),
  '%between 10 and 1000%',
  'report decisions require a bounded written reason'
);
select unalike(
  pg_get_functiondef('public.get_admin_report_case(uuid)'::regprocedure),
  '%email%',
  'report evidence does not expose account email addresses'
);
select alike(
  pg_get_functiondef('public.get_admin_report_case(uuid)'::regprocedure),
  '%report.evidence_viewed%',
  'opening authorized report evidence appends an audit record'
);
select alike(
  pg_get_functiondef('public.get_admin_report_case(uuid)'::regprocedure),
  '%target_kind%',
  'report evidence preserves the exact member-selected target'
);
select alike(
  pg_get_functiondef('public.submit_policy_report(uuid,uuid,uuid,uuid,text,text,text,text,text)'::regprocedure),
  '%can_view_full_post%',
  'content reports bind evidence to an authorized authoritative post owner'
);
select alike(
  pg_get_functiondef('public.submit_policy_report(uuid,uuid,uuid,uuid,text,text,text,text,text)'::regprocedure),
  '%restricted_safety%',
  'safety-critical report leaves route to restricted review'
);
select alike(
  pg_get_functiondef('public.admin_decide_report_v2_hierarchical_legacy_20260924(uuid,text,text,text,text,text,text)'::regprocedure),
  '%report_target = ''account''%',
  'account decisions are handled separately from profile-photo decisions'
);
select alike(
  pg_get_functiondef('public.get_admin_command_center_snapshot_v2(integer)'::regprocedure),
  '%get_admin_command_center_snapshot_v2_before_work_item_context_%',
  'the command center delegates to the existing concern and queue snapshot'
);
select alike(
  pg_get_functiondef('public.get_admin_command_center_snapshot_v2_before_work_item_context_2(integer)'::regprocedure),
  '%restricted_safety_open%',
  'the command center exposes a distinct open restricted-safety count'
);
select alike(
  pg_get_functiondef('public.get_admin_command_center_snapshot_v2(integer)'::regprocedure),
  '%submitted_by%',
  'the command center preserves queue-specific suggestion review context'
);
select alike(
  pg_get_functiondef('public.get_admin_audit_page_v1(integer,timestamp with time zone,uuid)'::regprocedure),
  '%limit bounded_limit%',
  'the audit contract is bounded inside the database'
);
select alike(
  pg_get_functiondef('public.get_admin_audit_page_v2(integer,timestamp with time zone,uuid,text,text)'::regprocedure),
  '%limit bounded_limit%',
  'the server-filtered audit page remains bounded inside the database'
);
select alike(
  pg_get_functiondef('public.get_admin_audit_page_v2(integer,timestamp with time zone,uuid,text,text)'::regprocedure),
  '%normalized_category = ''activity'' and audit.action not like ''%evidence_viewed%''%',
  'the operational audit view omits repetitive evidence opens by default'
);
select alike(
  pg_get_functiondef('public.get_admin_audit_export_v1(text,text)'::regprocedure),
  '%limit 5001%',
  'audit export detects truncation at its fixed server limit'
);
select alike(
  pg_get_functiondef('public.admin_set_operator_role_v1(text,text,boolean,text,text)'::regprocedure),
  '%admin.manage%admin_audit_log%',
  'operator access changes require super-admin authority and append immutable audit'
);
select alike(
  pg_get_functiondef('public.get_admin_report_case_v2(uuid)'::regprocedure)
    || pg_get_functiondef('public.get_admin_report_case_v2_before_history_20260924(uuid)'::regprocedure)
    || pg_get_functiondef('public.get_admin_report_case_v2_before_context_20260924(uuid)'::regprocedure),
  '%suggested_policy_code%',
  'report details provide a non-binding suggested operator policy'
);
select alike(
  pg_get_functiondef('public.get_admin_report_case_v2(uuid)'::regprocedure)
    || pg_get_functiondef('public.get_admin_report_case_v2_before_history_20260924(uuid)'::regprocedure)
    || pg_get_functiondef('public.get_admin_report_case_v2_before_context_20260924(uuid)'::regprocedure),
  '%related_context%',
  'report details provide bounded related-account review counts'
);
select alike(
  pg_get_functiondef('public.get_admin_report_case_v2_before_history_20260924(uuid)'::regprocedure),
  '%case_context%',
  'report details include bounded source-of-truth content context'
);
select unalike(
  pg_get_functiondef('public.get_admin_report_case_v2(uuid)'::regprocedure)
    || pg_get_functiondef('public.get_admin_report_case_v2_before_resolved_archive_20260924(uuid)'::regprocedure)
    || pg_get_functiondef('public.get_admin_report_case_v2_before_history_20260924(uuid)'::regprocedure),
  '%auth.users%',
  'case context does not expose consumer email addresses'
);
select alike(
  pg_get_functiondef('public.get_admin_report_case_v2_before_resolved_archive_20260924(uuid)'::regprocedure),
  '%workflow_history%',
  'report details expose bounded operational workflow history'
);
select alike(
  pg_get_functiondef('public.get_admin_report_case_v2_before_resolved_archive_20260924(uuid)'::regprocedure),
  '%evidence_access%',
  'report details summarize evidence access separately'
);
select alike(
  pg_get_functiondef('public.get_admin_report_case_v2_before_resolved_archive_20260924(uuid)'::regprocedure),
  '%audit.action <> ''report.evidence_viewed''%',
  'workflow history excludes repetitive evidence-view audit entries'
);
select alike(
  pg_get_functiondef('public.get_admin_resolved_reports_page_v1(integer,timestamp with time zone,uuid)'::regprocedure),
  '%limit bounded_limit + 1%',
  'resolved report archive reads are bounded at the database'
);
select alike(
  pg_get_functiondef('public.get_admin_resolved_reports_page_v1(integer,timestamp with time zone,uuid)'::regprocedure),
  '%(triage.resolved_at, report.id) < (p_before_resolved_at, p_before_report_id)%',
  'resolved report archive uses stable keyset pagination'
);
select alike(
  pg_get_functiondef('public.get_admin_report_case_v2_before_policy_mapping_20260925(uuid)'::regprocedure),
  '%decision_summary%',
  'resolved case detail exposes a structured final decision summary'
);
select alike(
  pg_get_functiondef('public.get_admin_report_case_v2_before_policy_mapping_20260925(uuid)'::regprocedure),
  '%member_moderation_email_deliveries%',
  'resolved case detail includes transactional email delivery state'
);
select alike(
  pg_get_functiondef('public.get_admin_report_case_v2_before_policy_mapping_20260925(uuid)'::regprocedure),
  '%push_delivery_claims%',
  'resolved case detail includes push delivery state'
);
select unalike(
  pg_get_functiondef('public.submit_policy_report(uuid,uuid,uuid,uuid,text,text,text,text,text)'::regprocedure),
  '%service_role%',
  'member reporting never depends on a privileged browser credential'
);
select has_table(
  'public', 'member_moderation_email_deliveries',
  'serious member enforcement email has a service-owned delivery ledger'
);
select alike(
  pg_get_functiondef('public.admin_decide_report_v2(uuid,text,text,text,text,text,text)'::regprocedure),
  '%''sendPush'', true%',
  'finalized removals request an OS push through the durable outbox'
);
select alike(
  pg_get_functiondef('public.admin_decide_report_v2(uuid,text,text,text,text,text,text)'::regprocedure),
  '%''sendEmail'', p_severity = ''level_2''%',
  'member email is reserved for finalized Level 2 enforcement'
);
select alike(
  pg_get_functiondef('public.can_read_post_media(text,uuid)'::regprocedure),
  '%moderation.read%',
  'reported post media is available only to an authorized moderation reader'
);
select alike(
  pg_get_functiondef('public.can_read_post_media(text,uuid)'::regprocedure),
  '%report.status in (''pending'', ''dismissed'', ''actioned'')%',
  'retained resolved evidence remains available to its authorized report reader'
);
select alike(
  pg_get_functiondef('public.admin_set_report_review_state_v1(uuid,text,text,text)'::regprocedure),
  '%''aal2''%',
  'follow-up review state changes require MFA assurance level two'
);
select alike(
  pg_get_functiondef('public.admin_set_report_review_state_v1(uuid,text,text,text)'::regprocedure),
  '%moderation.write%',
  'follow-up review state changes require moderation write permission'
);
select alike(
  pg_get_functiondef('public.admin_set_report_review_state_v1(uuid,text,text,text)'::regprocedure),
  '%''report.'' || case when p_action = ''reopen'' then ''reopened'' else ''reclosed'' end%',
  'follow-up review transitions append a meaningful audit event'
);
select alike(
  pg_get_functiondef('public.admin_set_report_review_state_v1(uuid,text,text,text)'::regprocedure),
  '%''enforcement_changed'', false%',
  'reopening a case explicitly preserves its existing enforcement'
);
select alike(
  pg_get_functiondef('public.admin_set_report_review_state_v1(uuid,text,text,text)'::regprocedure),
  '%command_receipts%',
  'follow-up review state changes are idempotent'
);
select is(
  (
    select count(*)
    from information_schema.role_table_grants grant_row
    where grant_row.table_schema = 'public'
      and grant_row.table_name in ('admin_operator_roles', 'admin_audit_log', 'admin_report_triage')
      and grant_row.grantee in ('PUBLIC', 'anon', 'authenticated')
  ),
  0::bigint,
  'browser roles have no direct access to admin role or audit tables'
);

select * from finish();
rollback;
