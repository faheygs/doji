-- Bounded read-only hosted canary. Does not mint sessions, fetch credentials,
-- exercise writes or emit events. Claims emulate the approved test subjects.
begin read only;
set local statement_timeout='10s';
select set_config('request.jwt.claims','{"sub":"ae62514b-d022-4845-9933-2d10689b5105","role":"doji_employee","aal":"aal2"}',true);
set local role doji_employee;
select set_config('employee_release.checks',jsonb_build_object(
 'employee_session',public.get_admin_portal_session_v3()->'roles',
 'employee_moderation',public.admin_user_has_permission('moderation.write'),
 'employee_legal',public.admin_user_has_permission('legal.read'),
 'employee_manage',public.admin_user_has_permission('admin.manage'),
 'work_queue_read',public.get_admin_work_queue_page_v1(1) is not null,
 'audit_read',public.get_admin_audit_page_v2(1) is not null,
 'realtime_scope',public.get_admin_realtime_token_capabilities()->>'isAdmin',
 'employee_member_profile_denied',not has_function_privilege('doji_employee','public.get_own_profile()','execute'),
 'employee_member_realtime_denied',not has_function_privilege('doji_employee','public.get_realtime_token_capabilities(uuid[])','execute'))::text,true);
reset role;
select set_config('request.jwt.claims','{"sub":"57f7d45d-d10a-4426-923b-dcdc6f2b1bbc","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select jsonb_build_object(
 'member_profile_read',public.get_own_profile() is not null,
 'member_realtime_read',public.get_realtime_token_capabilities()->>'userId'='57f7d45d-d10a-4426-923b-dcdc6f2b1bbc',
 'member_employee_directory_denied',not has_function_privilege('authenticated','public.get_admin_employee_directory_v1()','execute')) as member_checks,
 current_setting('employee_release.checks')::jsonb as employee_checks;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','57f7d45d-d10a-4426-923b-dcdc6f2b1bbc','role','authenticated','aal','aal2')::text,true);
select jsonb_build_object(
 'employee_only',(select employee_only from public.admin_employee_cutover where singleton),
 'owner_active',(select status='active' and 'super_admin'=any(roles) from public.admin_employees where id='ae62514b-d022-4845-9933-2d10689b5105'),
 'personal_portal_denied_at_aal2',not public.admin_user_has_permission('portal.session'),
 'activation_audited',(select count(*)=2 from public.admin_audit_log where request_id in ('employee-owner-bootstrap-20260926','employee-portal-cutover-20260926'))
) as cutover_checks;
rollback;
