// Synthetic, network-disabled database only; no hosted endpoint or member action.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { employeeEvidenceSetup } from './test-employee-local-evidence.mts';
import { engine as podman, container } from './database/owned-target.mts';
import { offlineContainer, errorOutput } from './database/contracts.mts';
const info = offlineContainer(
  JSON.parse(execFileSync(podman, ['inspect', container], { encoding: 'utf8' })),
);
assert.equal(info.HostConfig.NetworkMode, 'none');
assert.equal(Object.keys(info.HostConfig.PortBindings || {}).length, 0);
const body = (path: string) =>
  readFileSync(path, 'utf8')
    .replace(/^begin;\s*$/m, '')
    .replace(/^commit;\s*$/m, '');
const id = '98000000-0000-4000-8000-000000000001';
const call = (name: string, args: Record<string, unknown> = {}) =>
  `portal_identity_private.employee_rpc_v1('https://employee.test/','employee','user_test','session_test',true,'${name}',$args$${JSON.stringify(args)}$args$::jsonb)`;
const claim = {
  p_report_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  p_action: 'claim',
  p_priority: null,
  p_note: null,
  p_idempotency_key: 'external-bridge-claim-0001',
};
const decision = {
  p_report_id: claim.p_report_id,
  p_action: 'remove_content',
  p_policy_code: 'spam_scam',
  p_severity: 'level_1',
  p_reason: 'Synthetic bridge decision rationale',
  p_user_notice: 'Synthetic bridge member notice',
  p_account_action: 'warning',
  p_restriction_days: null,
  p_idempotency_key: 'external-bridge-remove-0001',
};
const prepare = [
  'business_applications_v1',
  'portal_identity_registry_v1',
  'employee_session_store_v1',
  'portal_employee_actors_v1',
]
  .map((n) => body(`docs/drafts/${n}.sql`))
  .join('\n');
const setup = employeeEvidenceSetup.replace(
  'begin;',
  () => `begin;
 do $$begin if exists(select 1 from vault.secrets) or exists(select 1 from auth.users where email is null or email not like '%@test.invalid') then raise exception 'Synthetic offline DB required';end if;end$$;
 ${prepare}`,
);
const sql = `${setup}
update public.reports set reported_user_id=current_setting('test.member_id')::uuid;
-- Employee avatar/case evidence is already present in the replayed migrations.
${['moderation_media_ledger_v1', 'moderation_media_restoration_v1', 'moderation_media_cleanup_v1', 'moderation_media_evidence_v1'].map((n) => body(`docs/drafts/${n}.sql`)).join('\n')}
create temp table before_functions as select oid,pg_get_functiondef(oid) definition,proacl from pg_proc where prokind='f' and pronamespace in('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace);
${body('docs/drafts/portal_identity_employee_rpc_v1.sql')}
${body('docs/drafts/portal_employee_directory_v1.sql')}
${body('docs/drafts/employee_login_admission_v1.sql')}
-- Local harness may impersonate the new NOLOGIN transport role; rolled back.
grant doji_employee_application to postgres;
create function pg_temp.ok(v boolean,label text) returns text language plpgsql as $$begin if v is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
create function pg_temp.denied(s text,expected text,label text) returns text language plpgsql as $$begin begin execute s;exception when others then if sqlstate=expected then return 'PASS: '||label;end if;raise;end;raise exception 'FAIL: allowed %',label;end$$;
update employee_session_private.settings set enabled=true,scope_hash=repeat('a',64);
select pg_temp.ok((select bool_and(employee_session_private.admit_login_v1(repeat('a',64),repeat('b',64),repeat('c',64))) from generate_series(1,5)),'five login attempts admitted durably');
select pg_temp.ok(not employee_session_private.admit_login_v1(repeat('a',64),repeat('b',64),repeat('d',64)),'email throttle cannot be bypassed with another IP');
select pg_temp.ok((select max(attempts)=5 from employee_session_private.login_admission),'denied login does not inflate stored counters');
update employee_session_private.login_admission set window_start=clock_timestamp()-interval '11 minutes';
select pg_temp.ok(employee_session_private.admit_login_v1(repeat('a',64),repeat('b',64),repeat('c',64)),'expired admission buckets reclaimed on demand');
select pg_temp.ok(not has_table_privilege('authenticated','employee_session_private.login_admission','SELECT') and not has_function_privilege('authenticated','employee_session_private.admit_login_v1(text,text,text)','EXECUTE'),'member cannot read or mutate employee admission');
insert into portal_identity_private.realms(realm,issuer,audience,enabled) values('employee','https://employee.test/','employee',true);
select portal_identity_private.bind_identity('employee','user_test','${id}','synthetic bridge employee');
select portal_identity_private.prepare_employee_actor_v1('${id}','synthetic bridge employee');
select portal_identity_private.set_principal_state('${id}',1,'active','synthetic bridge activation');
insert into public.admin_employees(id,display_name,status,roles) values('${id}','Synthetic external staff','active',array['super_admin']);
insert into portal_identity_private.employee_contacts(id,email,verified_at) values('${id}','owner@test.invalid',clock_timestamp());
select portal_identity_private.bind_identity('employee','user_second','98000000-0000-4000-8000-000000000002','synthetic second employee');
select portal_identity_private.prepare_employee_actor_v1('98000000-0000-4000-8000-000000000002','synthetic second employee');
select portal_identity_private.set_principal_state('98000000-0000-4000-8000-000000000002',1,'active','synthetic second activation');
insert into public.admin_employees(id,display_name,status,roles) values('98000000-0000-4000-8000-000000000002','Synthetic invited staff','pending',array[]::text[]);
insert into portal_identity_private.employee_contacts(id,email,verified_at)
 select '98000000-0000-4000-8000-000000000002',email,clock_timestamp() from auth.users where id=current_setting('test.member_id')::uuid;
select set_config('test.staff_email',(select email from portal_identity_private.employee_contacts where id='98000000-0000-4000-8000-000000000002'),true);
select set_config('request.jwt.claims','{"sub":"98000000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal1"}',true);
select set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000099',true);
select set_config('request.jwt.claim','{"role":"authenticated","aal":"aal1"}',true);
select set_config('test.prior_claims',current_setting('request.jwt.claims'),true);
set local role doji_employee_application;
select pg_temp.denied($q$select ${call('get_admin_portal_session_v3')}$q$,'42501','bridge disabled by default');
reset role;
update portal_identity_private.employee_rpc_settings set enabled=true;
set local role doji_employee_application;
select pg_temp.ok((${call('get_admin_portal_session_v3')}->>'user_id')='${id}','session resolves external ID, overriding stale caller claims');
select pg_temp.ok((${call('get_admin_realtime_token_capabilities')}->>'userId')='${id}','realtime capability uses independent employee actor');
select pg_temp.ok((${call('portal_evidence_authorization_v1', { p_bucket: 'post-media', p_path: 'employee-test-routine.jpg' })}->>'expiresIn')='300','reported media keeps existing authorized TTL');
select pg_temp.denied($q$select ${call('portal_evidence_authorization_v1', { p_bucket: 'post-media', p_path: 'employee-test-unreported.jpg' })}$q$,'42501','unreported media is not authorized');
select pg_temp.denied($q$select ${call('portal_evidence_authorization_v1', { p_bucket: 'post-media', p_path: '../employee-test-routine.jpg' })}$q$,'42501','media traversal denied');
select pg_temp.denied($q$select ${call('get_admin_event_health_history_v1', { p_limit: 51 })}$q$,'22023','oversized query page denied by SQL');
select pg_temp.ok(jsonb_array_length(${call('get_admin_employee_directory_v1')}->'items')=2,'directory includes independent employees without Auth rows');
select portal_identity_private.employee_rpc_v1('https://employee.test/','employee','user_test','session_test',true,'admin_set_employee_role_v1',jsonb_build_object('p_username',current_setting('test.staff_email'),'p_role','moderator','p_active',true,'p_reason','Synthetic staff permission grant','p_idempotency_key','external-bridge-role-0001'));
select portal_identity_private.employee_rpc_v1('https://employee.test/','employee','user_test','session_test',true,'admin_set_employee_role_v1',jsonb_build_object('p_username',current_setting('test.staff_email'),'p_role','moderator','p_active',true,'p_reason','Synthetic staff permission grant','p_idempotency_key','external-bridge-role-0001'));
reset role;
select pg_temp.ok((select roles=array['moderator'] and status='active' from public.admin_employees where id='98000000-0000-4000-8000-000000000002'),'role grant targets independent staff only');
select pg_temp.ok((select count(*)=1 from public.admin_employee_access_events where actor_id='${id}' and request_id='external-bridge-role-0001'),'role replay has one immutable access event');
select pg_temp.ok(exists(select 1 from auth.users where id=current_setting('test.member_id')::uuid and role='authenticated') and not exists(select 1 from auth.users where id='98000000-0000-4000-8000-000000000002'),'same-email member identity unchanged by staff grant');
update public.admin_employees set status='disabled' where id<>'${id}' and 'super_admin'=any(roles);
set local role doji_employee_application;
select pg_temp.denied($q$select ${call('admin_set_employee_role_v1', { p_username: 'owner@test.invalid', p_role: 'super_admin', p_active: false, p_reason: 'Synthetic last owner removal', p_idempotency_key: 'external-bridge-last-owner' })}$q$,'42501','last usable super administrator cannot be removed');
select pg_temp.ok(current_setting('request.jwt.claims')=current_setting('test.prior_claims') and current_setting('request.jwt.claim.sub')='98000000-0000-4000-8000-000000000099' and current_setting('request.jwt.claim')::jsonb->>'role'='authenticated','success restores caller claim settings');
select pg_temp.denied($q$select ${call('delete_account')}$q$,'42501','member command cannot be selected');
select pg_temp.denied($q$select ${call('get_admin_portal_session_v3', { actor_id: id })}$q$,'22023','caller cannot inject principal');
select pg_temp.denied($q$select portal_identity_private.employee_rpc_v1('https://employee.test/','wrong','user_test','session_test',true,'get_admin_portal_session_v3','{}')$q$,'42501','wrong audience denied');
select pg_temp.denied($q$select portal_identity_private.employee_rpc_v1('https://employee.test/','employee','user_test','session_test',false,'get_admin_portal_session_v3','{}')$q$,'42501','missing MFA denied');
select ${call('get_admin_report_case_v3', { p_report_id: claim.p_report_id })};
select ${call('get_admin_work_queue_page_v1', { p_limit: 10, p_queue: 'all', p_filter: 'all', p_search: null, p_after_at: null, p_after_id: null })};
select ${call('admin_triage_report', claim)};
select ${call('admin_triage_report', claim)};
select ${call('admin_decide_report_v3', decision)};
select ${call('admin_decide_report_v3', decision)};
select ${call('admin_set_report_review_state_v1', { p_report_id: claim.p_report_id, p_action: 'reopen', p_reason: 'Synthetic follow up required', p_idempotency_key: 'external-bridge-reopen-0001' })};
select ${call('admin_set_report_review_state_v1', { p_report_id: claim.p_report_id, p_action: 'reclose', p_reason: 'Synthetic follow up complete', p_idempotency_key: 'external-bridge-reclose-0001' })};
reset role;
select pg_temp.ok((select count(*)=1 from public.admin_audit_log where request_id='external-bridge-claim-0001' and actor_id='${id}'),'claim replay yields one audited external actor');
select pg_temp.ok((select count(*)=1 from public.moderation_decisions where report_id='${claim.p_report_id}' and decided_by='${id}'),'decision replay yields one external decision');
select pg_temp.ok(not exists(select 1 from auth.users where id='${id}') and not exists(select 1 from public.profiles where id='${id}'),'no employee Auth or member row created');
-- Member appeal still uses its original command; no portal identity dependency.
select set_config('request.jwt.claim','',true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.member_id'),'role','authenticated','aal','aal1')::text,true);
update public.reports set reported_user_id=current_setting('test.member_id')::uuid where id='${claim.p_report_id}';
select set_config('test.decision_id',(select id::text from public.moderation_decisions where report_id='${claim.p_report_id}'),true);
set local role authenticated;
select public.submit_moderation_appeal(current_setting('test.decision_id')::uuid,'Synthetic member appeal for bridge test','external-bridge-member-appeal');
select pg_temp.denied($q$select ${call('get_admin_portal_session_v3')}$q$,'42501','member cannot invoke trusted bridge');
reset role;
select set_config('test.appeal_id',(select id::text from public.moderation_appeals where decision_id=current_setting('test.decision_id')::uuid),true);
set local role doji_employee_application;
select portal_identity_private.employee_rpc_v1('https://employee.test/','employee','user_test','session_test',true,'get_admin_appeal_case_v1',jsonb_build_object('p_appeal_id',current_setting('test.appeal_id')));
select portal_identity_private.employee_rpc_v1('https://employee.test/','employee','user_test','session_test',true,'admin_review_moderation_appeal',jsonb_build_object('p_appeal_id',current_setting('test.appeal_id'),'p_outcome','reverse','p_reason','Synthetic independent bridge override','p_idempotency_key','external-bridge-reverse-0001'));
reset role;
select pg_temp.ok((select moderation_status='removed' from public.posts where id='${claim.p_report_id}')
 and exists(select 1 from public.moderation_decisions where report_id='${claim.p_report_id}' and state='reversed')
 and exists(select 1 from public.moderation_media_objects m join public.moderation_media_decisions l on l.object_id=m.id join public.moderation_decisions d on d.id=l.decision_id where d.report_id='${claim.p_report_id}' and m.desired='restored'),
 'appeal reversal queues verification without prematurely exposing media');
select pg_temp.ok(not has_function_privilege('doji_employee_application','public.finish_moderation_media_restore_v1(uuid,uuid,bigint,jsonb)','EXECUTE'),'portal transport cannot fake media restoration');
update public.admin_employees set roles=array['moderator'] where id='${id}';
set local role doji_employee_application;
select pg_temp.denied($q$select ${call('get_admin_employee_directory_v1')}$q$,'42501','moderator cannot read employee account directory');
select pg_temp.denied($q$select ${call('portal_evidence_authorization_v1', { p_bucket: 'post-media', p_path: 'employee-test-restricted.jpg' })}$q$,'42501','moderator cannot authorize restricted media');
select pg_temp.denied($q$select ${call('admin_set_employee_role_v1', { p_username: 'owner@test.invalid', p_role: 'super_admin', p_active: true, p_reason: 'Synthetic self escalation attempt', p_idempotency_key: 'external-bridge-escalation' })}$q$,'42501','moderator cannot escalate own role');
select pg_temp.denied($q$select ${call('get_admin_report_case_v3', { p_report_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })}$q$,'P0001','moderator cannot read restricted case');
select pg_temp.ok(current_setting('request.jwt.claims')::jsonb->>'role'='authenticated','exception restores caller claims');
reset role;
update public.admin_employees set status='disabled' where id='${id}';
set local role doji_employee_application;
select pg_temp.denied($q$select ${call('get_admin_portal_session_v3')}$q$,'42501','disabled employee denied');
reset role;
update public.admin_employees set status='active',roles=array['super_admin'] where id='${id}';
reset role;
select set_config('test.member',current_setting('test.member_id'),true);
select set_config('test.claims',current_setting('request.jwt.claims'),true);
select set_config('test.poll_bridge','yes',true);
insert into public.badges(id,name,emoji,description,criteria_type,criteria_value) values
 ('idea_submitted','Submitted','test','Synthetic','ideas',1),('idea_picked','Picked','test','Synthetic','ideas',1) on conflict do nothing;
${readFileSync('scripts/test-poll-reserved-other.sql', 'utf8')}
select portal_identity_private.revoke_session('employee','user_test','session_test','synthetic bridge revoke');
set local role doji_employee_application;
select pg_temp.denied($q$select ${call('get_admin_portal_session_v3')}$q$,'42501','revoked exact session denied');
select pg_temp.denied($q$select * from public.profiles limit 1$q$,'42501','transport role cannot read member tables');
select pg_temp.denied($q$select public.get_admin_portal_session_v3()$q$,'42501','transport role cannot bypass identity bridge');
reset role;
select pg_temp.ok(not exists(select 1 from before_functions b join pg_proc p on p.oid=b.oid where b.definition<>pg_get_functiondef(p.oid) or b.proacl is distinct from p.proacl),'existing RPCs and grants unchanged');
${body('docs/drafts/portal_identity_employee_rpc_v1.rollback.sql')}
select pg_temp.ok(not (select enabled from portal_identity_private.employee_rpc_settings),'rollback disables only employee bridge');
rollback;`;
try {
  const output = execFileSync(
    podman,
    [
      'exec',
      '-i',
      container,
      'psql',
      '-X',
      '-qAt',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 4e6 },
  );
  const checks = output.split('\n').filter((l) => l.startsWith('PASS:'));
  console.log(checks.join('\n'));
  console.log(`${checks.length} employee bridge checks passed; all fixture writes rolled back.`);
} catch (error) {
  console.error(errorOutput(error, 'stderr'));
  process.exitCode = 1;
}
