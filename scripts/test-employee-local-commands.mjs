// Full public-schema command regression. Synthetic local fixtures only; every
// command, receipt, outbox event and role change rolls back at the end.
import { employeeEvidenceSetup } from './test-employee-local-evidence.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { container } from './employee-test-runtime.mjs';
import assert from 'node:assert/strict';
const externalStaff = process.env.DOJI_TEST_EXTERNAL_STAFF_REFS === 'true';
let externalSetup = '';
let externalClaims = '';
if (externalStaff) {
  const info = JSON.parse(
    execFileSync('C:/Program Files/RedHat/Podman/podman.exe', ['inspect', container], {
      encoding: 'utf8',
    }),
  )[0];
  assert.equal(info.HostConfig.NetworkMode, 'none');
  assert.equal(Object.keys(info.HostConfig.PortBindings || {}).length, 0);
  const body = (path) =>
    readFileSync(path, 'utf8')
      .replace(/^begin;\s*$/m, '')
      .replace(/^commit;\s*$/m, '');
  externalSetup =
    `do $$begin if exists(select 1 from vault.secrets) or exists(select 1 from auth.users where email is null or email not like '%@test.invalid') then raise exception 'Synthetic offline database required';end if;end$$;\n` +
    [
      'business_applications_v1',
      'portal_identity_registry_v1',
      'employee_session_store_v1',
      'portal_employee_actors_v1',
    ]
      .map((name) => body(`docs/drafts/${name}.sql`))
      .join('\n');
  externalClaims = `
 insert into portal_identity_private.realms(realm,issuer,audience) values('employee','https://employee.test/','employee');
 select portal_identity_private.bind_identity('employee','user_command_test','98000000-0000-4000-8000-000000000001','synthetic command regression');
 select portal_identity_private.prepare_employee_actor_v1('98000000-0000-4000-8000-000000000001','synthetic command regression');
 insert into public.admin_employees(id,display_name,status,roles) values('98000000-0000-4000-8000-000000000001','Independent command fixture','active',array['super_admin']);
 select set_config('request.jwt.claims',jsonb_build_object('sub','98000000-0000-4000-8000-000000000001','role','doji_employee','aal','aal2')::text,true);
 do $$begin if exists(select 1 from auth.users where id=auth.uid()) or exists(select 1 from public.profiles where id=auth.uid()) then raise exception 'Independent employee must have no Auth or member account';end if;end$$;`;
}
const migration = readFileSync(
  'docs/drafts/20260926011000_employee_portal_authorization.sql',
  'utf8',
);
const receipts = migration.slice(
  migration.indexOf('-- BEGIN EMPLOYEE COMMAND RECEIPTS'),
  migration.indexOf('-- END EMPLOYEE COMMAND RECEIPTS'),
);
const deletion = migration
  .slice(
    migration.indexOf('create function public.retain_deleted_admin_actor_history_v1()'),
    migration.indexOf('create trigger retain_deleted_admin_actor_history'),
  )
  .replace('create function', 'create or replace function');
const installed =
  execFileSync(
    'C:/Program Files/RedHat/Podman/podman.exe',
    [
      'exec',
      container,
      'psql',
      '-X',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-At',
      '-c',
      "select to_regclass('public.admin_employee_command_receipts') is not null;",
    ],
    { encoding: 'utf8' },
  ).trim() === 't';
const setup =
  employeeEvidenceSetup.replace(
    'begin;',
    () => `begin;\n${installed ? '' : receipts}\n${deletion}\n${externalSetup}`,
  ) + externalClaims;
const sql = `${setup}
do $$begin if exists(select 1 from vault.secrets) then raise exception 'Test requires empty local Vault'; end if; end$$;
select set_config('test.employee_claims',current_setting('request.jwt.claims'),true);
select set_config('request.jwt.claims','{}',true);
update public.reports set reported_user_id=current_setting('test.member_id')::uuid;
insert into public.reports(id,post_id,reason,target_kind,reporter_id,reported_user_id)
 values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','cccccccc-cccc-4ccc-8ccc-cccccccccccc','other','post',
 current_setting('test.member_id')::uuid,current_setting('test.member_id')::uuid);
-- Existing member-admin path remains usable while employee cutover is off.
update public.profiles set is_admin=true where id=current_setting('test.member_id')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.member_id'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
select public.admin_triage_report('cccccccc-cccc-4ccc-8ccc-cccccccccccc','claim',null,null,'legacy-local-claim-0001');
select public.admin_triage_report('cccccccc-cccc-4ccc-8ccc-cccccccccccc','release',null,null,'legacy-local-release-0001');
reset role;
do $$begin
 if (select count(*) from public.command_receipts where idempotency_key='legacy-local-claim-0001')<>1 then raise exception 'Legacy member receipt path changed'; end if;
end$$;
update public.profiles set is_admin=false where id=current_setting('test.member_id')::uuid;
select set_config('request.jwt.claims',current_setting('test.employee_claims'),true);
set local role doji_employee;
select public.admin_triage_report('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','claim',null,null,'employee-local-claim-0001');
select public.admin_triage_report('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','claim',null,null,'employee-local-claim-0001');
reset role;
do $$begin
 if (select count(*) from public.admin_audit_log where request_id='employee-local-claim-0001')<>1 then raise exception 'Claim replay duplicated audit'; end if;
 if (select assigned_to from public.admin_report_triage where report_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')<>auth.uid() then raise exception 'Employee assignment missing'; end if;
end$$;
set local role doji_employee;
select public.admin_triage_report('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','set_priority','high','Synthetic priority check','employee-local-priority-0001');
select public.admin_triage_report('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','release',null,null,'employee-local-release-0001');
select public.admin_decide_report_v3('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','remove_content','spam_scam','level_1',
 'Synthetic local removal rationale','Synthetic local notice for the member','warning',null,'employee-local-remove-0001');
select public.admin_decide_report_v3('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','remove_content','spam_scam','level_1',
 'Synthetic local removal rationale','Synthetic local notice for the member','warning',null,'employee-local-remove-0001');
select public.admin_set_report_review_state_v1('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','reopen','Synthetic follow-up review rationale','employee-local-reopen-0001');
select public.admin_set_report_review_state_v1('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','reclose','Synthetic follow-up finished rationale','employee-local-reclose-0001');
reset role;
do $$begin
 if (select moderation_status from public.posts where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')<>'removed' then raise exception 'Removal/reopen changed visibility incorrectly'; end if;
 if (select count(*) from public.moderation_decisions where report_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')<>1 then raise exception 'Removal replay duplicated decision'; end if;
 if exists(select 1 from public.command_receipts where user_id=auth.uid()) then raise exception 'Employee wrote member receipt table'; end if;
end$$;
select set_config('test.decision_id',id::text,true) from public.moderation_decisions where report_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.member_id'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
select public.submit_moderation_appeal(current_setting('test.decision_id')::uuid,'Synthetic member appeal for a local regression test','member-local-appeal-0001');
reset role;
select set_config('test.appeal_id',id::text,true) from public.moderation_appeals where decision_id=current_setting('test.decision_id')::uuid;
select set_config('request.jwt.claims',current_setting('test.employee_claims'),true);
set local role doji_employee;
select public.admin_review_moderation_appeal(current_setting('test.appeal_id')::uuid,'reverse','Synthetic super admin appeal override','employee-local-appeal-0001');
select public.admin_review_moderation_appeal(current_setting('test.appeal_id')::uuid,'reverse','Synthetic super admin appeal override','employee-local-appeal-0001');
select public.admin_decide_report_v3('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','remove_content','violence_threats','level_3',
 'Synthetic restricted review rationale','Synthetic restricted member notice','temporary_restriction',1,'employee-local-restrict-0001');
select public.admin_decide_report_v3('cccccccc-cccc-4ccc-8ccc-cccccccccccc','escalate_restricted','violence_threats','level_3',
 'Synthetic quarantine rationale','Synthetic investigation notice',null,null,'employee-local-quarantine-0001');
select public.admin_decide_report_v3('cccccccc-cccc-4ccc-8ccc-cccccccccccc','no_violation','no_violation','none',
 'Synthetic restricted clearance rationale','Synthetic no violation member notice',null,null,'employee-local-clear-0001');
reset role;
do $$begin
 if (select moderation_status from public.posts where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')<>'visible' then raise exception 'Appeal did not restore content'; end if;
 if not exists(select 1 from public.admin_audit_log where action='appeal.reverse' and (metadata->>'superAdminOverride')::boolean) then raise exception 'Override not audited'; end if;
 if not exists(select 1 from public.admin_employee_command_receipts where idempotency_key='employee-local-restrict-0001' and result->>'account_action'='temporary_restriction') then raise exception 'Restricted receipt update missing'; end if;
 if (select moderation_status from public.posts where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')<>'visible' then raise exception 'No violation did not restore quarantine'; end if;
end$$;
-- Auth deletion must preserve both member-subject history and legacy actor attribution.
update public.moderation_decisions set decided_by=current_setting('test.member_id')::uuid
 where report_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
delete from auth.users where id=current_setting('test.member_id')::uuid;
do $$begin
 if exists(select 1 from public.profiles where id=current_setting('test.member_id')::uuid) then raise exception 'Member deletion failed'; end if;
 if (select count(*) from public.reports where id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'))<>2 then raise exception 'Report history lost'; end if;
 if not exists(select 1 from public.moderation_decisions where report_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
   and decided_by is null and deleted_member_refs->>'decided_by'=current_setting('test.member_id')) then raise exception 'Deleted actor attribution lost'; end if;
end$$;
rollback;`;
try {
  execFileSync(
    'C:/Program Files/RedHat/Podman/podman.exe',
    [
      'exec',
      '-i',
      container,
      'psql',
      '-X',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  );
  console.log(
    `Local ${externalStaff ? 'independent' : 'legacy'} employee command regression passed; all fixture changes rolled back.`,
  );
} catch (error) {
  console.error(String(error.stderr));
  process.exitCode = 1;
}
