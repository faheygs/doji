begin;

select plan(35);

select has_table('public', 'admin_operator_roles', 'admin roles are server owned');
select has_table('public', 'admin_audit_log', 'admin audit storage exists');
select has_table('public', 'admin_report_triage', 'report assignment and priority are server owned');
select has_function(
  'public', 'admin_user_has_permission', array['text'],
  'portal permissions use a bounded server helper'
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
select has_trigger(
  'public', 'challenge_suggestions', 'publish_admin_suggestion_change',
  'new community ideas invalidate the admin queue'
);
select alike(
  pg_get_functiondef('public.get_realtime_token_capabilities(uuid[])'::regprocedure),
  '%moderation.read%',
  'portal moderation roles receive the existing admin realtime channel'
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
  '%''aal2''%',
  'operator session requires MFA assurance level two'
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
  '%''aal2''%',
  'report triage requires MFA assurance level two'
);
select alike(
  pg_get_functiondef('public.admin_triage_report(uuid,text,text,text,text)'::regprocedure),
  '%moderation.write%',
  'report triage requires the moderation write permission'
);
select alike(
  pg_get_functiondef('public.admin_decide_report_v2(uuid,text,text,text,text,text,text)'::regprocedure),
  '%''aal2''%',
  'report decisions require MFA assurance level two'
);
select alike(
  pg_get_functiondef('public.admin_decide_report_v2(uuid,text,text,text,text,text,text)'::regprocedure),
  '%admin_audit_log%',
  'report decisions append an administrator audit record'
);
select alike(
  pg_get_functiondef('public.admin_decide_report_v2(uuid,text,text,text,text,text,text)'::regprocedure),
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
  pg_get_functiondef('public.can_read_post_media(text,uuid)'::regprocedure),
  '%moderation.read%',
  'pending reported post media is available only to an authorized moderation reader'
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
