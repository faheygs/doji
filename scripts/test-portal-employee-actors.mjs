// Network-disabled restored schema only. The complete transaction rolls back.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { engine as podman, container } from './database/owned-target.mjs';
const info = JSON.parse(execFileSync(podman, ['inspect', container], { encoding: 'utf8' }))[0];
assert.equal(info.HostConfig.NetworkMode, 'none');
assert.equal(Object.keys(info.HostConfig.PortBindings || {}).length, 0);
const body = (path) =>
  readFileSync(path, 'utf8')
    .replace(/^begin;\s*$/m, '')
    .replace(/^commit;\s*$/m, '');
const sql = `begin;
do $$begin if exists(select 1 from vault.secrets) or exists(select 1 from auth.users where email is null or email not like '%@test.invalid') then raise exception 'Synthetic offline database required';end if;end$$;
${body('docs/drafts/business_applications_v1.sql')}
${body('docs/drafts/portal_identity_registry_v1.sql')}
${body('docs/drafts/employee_session_store_v1.sql')}
create function pg_temp.ok(v boolean,label text) returns text language plpgsql as $$begin if v is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
create function pg_temp.denied(s text,expected text,label text) returns text language plpgsql as $$begin begin execute s;exception when others then if sqlstate=expected then return 'PASS: '||label;end if;raise;end;raise exception 'FAIL: allowed %',label;end$$;
create temp table before_functions as select p.oid,pg_get_functiondef(p.oid) definition,p.proacl from pg_proc p where p.prokind='f' and p.pronamespace in('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace);
create temp table before_auth as select id,md5(to_jsonb(u)::text) fingerprint from auth.users u;
create temp table before_policies as select * from pg_policies;
create temp table before_fks as select oid,conrelid,conname,pg_get_constraintdef(oid) definition from pg_constraint where contype='f';
create temp table before_history as select 'admin_audit_log'::text relation,to_jsonb(a) item from public.admin_audit_log a union all select 'admin_employees',to_jsonb(a) from public.admin_employees a union all select 'moderation_decisions',to_jsonb(a) from public.moderation_decisions a;
${body('docs/drafts/portal_employee_actors_v1.sql')}
select pg_temp.ok((select count(*)=9 from portal_identity_private.staff_reference_migration),'exactly nine reviewed references recorded');
select pg_temp.ok((select count(*)=9 from pg_constraint where contype='f' and confrelid='portal_identity_private.staff_actors'::regclass),'all nine references point to attribution registry');
select pg_temp.ok(not exists(select * from before_history except (select 'admin_audit_log',to_jsonb(a) from public.admin_audit_log a union all select 'admin_employees',to_jsonb(a) from public.admin_employees a union all select 'moderation_decisions',to_jsonb(a) from public.moderation_decisions a)),'historical rows and UUIDs unchanged');
select pg_temp.ok(not exists(select 1 from before_fks b left join pg_constraint c on c.oid=b.oid where not exists(select 1 from portal_identity_private.staff_reference_migration m where b.conrelid=('public.'||m.relation_name)::regclass and b.conname=m.constraint_name) and (c.oid is null or pg_get_constraintdef(c.oid)<>b.definition)),'all unrelated foreign keys unchanged');
insert into portal_identity_private.realms(realm,issuer,audience) values('employee','https://employee.test/','employee'),('business','https://business.test/','business');
select portal_identity_private.bind_identity('employee','user_new','98000000-0000-4000-8000-000000000001','synthetic employee mapping');
select portal_identity_private.prepare_employee_actor_v1('98000000-0000-4000-8000-000000000001','synthetic independent employee');
select portal_identity_private.prepare_employee_actor_v1('98000000-0000-4000-8000-000000000001','synthetic idempotent repeat');
select pg_temp.ok((select count(*)=1 from portal_identity_private.mapping_audit where action='employee.actor_prepared'),'actor preparation replay is idempotent');
insert into public.admin_employees(id,display_name,status,roles) values('98000000-0000-4000-8000-000000000001','Independent test employee','active',array['operations']);
insert into public.admin_audit_log(actor_id,actor_role,action,entity_type,entity_id,reason,request_id) values('98000000-0000-4000-8000-000000000001','operations','identity.test','test','synthetic','Synthetic attribution only','independent-staff-test');
insert into public.admin_employee_command_receipts(user_id,idempotency_key,result) values('98000000-0000-4000-8000-000000000001','independent-staff-receipt','{}');
select pg_temp.ok(not exists(select 1 from auth.users where id='98000000-0000-4000-8000-000000000001') and not exists(select 1 from public.profiles where id='98000000-0000-4000-8000-000000000001'),'new employee writes audit and receipt without Auth/member account');
select pg_temp.denied($q$delete from portal_identity_private.principals where id='98000000-0000-4000-8000-000000000001'$q$,'23503','principal deletion cannot erase attribution');
select portal_identity_private.set_principal_state('98000000-0000-4000-8000-000000000001',1,'deleted','synthetic provider closure');
select pg_temp.ok(exists(select 1 from public.admin_audit_log where request_id='independent-staff-test' and actor_id='98000000-0000-4000-8000-000000000001'),'provider closure retains staff audit');
select portal_identity_private.bind_identity('business','user_business','98000000-0000-4000-8000-000000000002','synthetic business mapping');
select pg_temp.denied($q$select portal_identity_private.prepare_employee_actor_v1('98000000-0000-4000-8000-000000000002','wrong realm test')$q$,'42501','business principal cannot become staff actor');
select pg_temp.denied($q$insert into public.admin_audit_log(actor_id,action,entity_type,entity_id) values('98000000-0000-4000-8000-000000000003','test','test','unknown')$q$,'23503','unknown actor cannot acquire attribution');
select pg_temp.denied($q$insert into portal_identity_private.staff_actors(id) values('98000000-0000-4000-8000-000000000003')$q$,'23514','empty identity linkage rejected');
select pg_temp.ok(not has_table_privilege('authenticated','portal_identity_private.staff_actors','select,insert,update,delete') and not has_function_privilege('doji_identity_resolver','portal_identity_private.prepare_employee_actor_v1(uuid,text)','execute'),'member/resolver cannot create or read staff bindings');
select pg_temp.ok(not exists(select 1 from before_functions b join pg_proc p on p.oid=b.oid where b.definition<>pg_get_functiondef(p.oid) or b.proacl is distinct from p.proacl),'existing public/Auth/Storage functions and grants unchanged');
select pg_temp.ok(not exists(select * from before_policies except select * from pg_policies),'existing policies unchanged');
select pg_temp.ok(not exists(select * from before_auth except select id,md5(to_jsonb(u)::text) from auth.users u) and not exists(select id,md5(to_jsonb(u)::text) from auth.users u except select * from before_auth),'all original Auth rows unchanged');
-- Exercise an existing member's Auth deletion after adding historical attribution.
select set_config('test.member',(select id::text from auth.users where role='authenticated' limit 1),true);
insert into public.admin_audit_log(actor_id,actor_role,action,entity_type,entity_id,reason,request_id) values(current_setting('test.member')::uuid,'legacy','member.history.test','test','synthetic','Synthetic legacy history','legacy-staff-attribution');
select pg_temp.ok(exists(select 1 from portal_identity_private.staff_actors where legacy_auth_id=current_setting('test.member')::uuid),'legacy writes lazily preserve original Auth linkage');
delete from auth.users where id=current_setting('test.member')::uuid;
select pg_temp.ok(not exists(select 1 from auth.users where id=current_setting('test.member')::uuid) and not exists(select 1 from portal_identity_private.staff_actors where id=current_setting('test.member')::uuid),'member deletion cascades only legacy attribution linkage');
select pg_temp.ok(exists(select 1 from public.admin_audit_log where request_id='legacy-staff-attribution' and actor_id is null and deleted_member_refs->>'actor_id'=current_setting('test.member')),'member deletion retains audit and deleted actor UUID');
select pg_temp.ok(exists(select 1 from public.admin_audit_log where request_id='independent-staff-test' and actor_id='98000000-0000-4000-8000-000000000001'),'member deletion leaves independent staff attribution intact');
${body('docs/drafts/portal_employee_actors_v1.rollback.sql')}
select pg_temp.ok(not exists(select 1 from portal_identity_private.realms where realm='employee' and enabled) and not (select enabled from employee_session_private.settings),'fallback freezes external employee access');
select pg_temp.ok(exists(select 1 from public.admin_audit_log where request_id='independent-staff-test'),'fallback retains external audit history');
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
  const checks = output.split('\n').filter((line) => line.startsWith('PASS:'));
  console.log(checks.join('\n'));
  console.log(`${checks.length} staff-reference checks passed; complete transaction rolled back.`);
} catch (error) {
  console.error(String(error.stderr || error.message));
  process.exitCode = 1;
}
