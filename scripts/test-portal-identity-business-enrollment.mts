// Entire synthetic database run rolls back. No network or hosted data.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { engine as podman, container } from './database/owned-target.mts';
import { offlineContainer, errorOutput } from './database/contracts.mts';
const info = offlineContainer(
  JSON.parse(execFileSync(podman, ['inspect', container], { encoding: 'utf8' })),
);
assert.equal(info.HostConfig.NetworkMode, 'none');
assert.equal(Object.keys(info.HostConfig.PortBindings || {}).length, 0);
const body = (p: string) =>
  readFileSync(p, 'utf8')
    .replace(/^begin;\s*$/m, '')
    .replace(/^commit;\s*$/m, '');
const call = (subject = 'user_new', changes: Record<string, string> = {}) => {
  const a = {
    issuer: "'https://business.test'",
    audience: "'business-test'",
    subject: `'${subject}'`,
    session: "'session_new'",
    terms: 'true',
    privacy: 'true',
    tv: "'terms-v1'",
    pv: "'privacy-v1'",
    country: "'US'",
    ...changes,
  };
  return `portal_identity_private.complete_business_enrollment(${Object.values(a).join(',')})`;
};
// SQL literals generated from fixed code-owned scenarios, not user input.
const denied = (label: string, expression: string) =>
  `select pg_temp.denies($q$select ${expression}$q$,'${label}');`;
const sql = `begin;
do $$begin if exists(select 1 from vault.secrets) or exists(select 1 from auth.users where email is null or email not like '%@test.invalid') then raise exception 'Synthetic database required';end if;end$$;
create temp table before_auth as select id,md5(row_to_json(u)::text) fingerprint from auth.users u;
create temp table before_profile as select id,md5(row_to_json(p)::text) fingerprint from public.profiles p;
${body('docs/drafts/business_applications_v1.sql')}
${body('docs/drafts/business_signup_legal_v1.sql')}
create temp table before_rpc as select p.oid,pg_get_functiondef(p.oid) definition,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','business_private') and p.prokind='f';
${body('docs/drafts/portal_identity_registry_v1.sql')}
${body('docs/drafts/portal_identity_business_enrollment_v1.sql')}
${body('docs/drafts/portal_identity_business_reads_v1.sql')}
${body('docs/drafts/portal_identity_business_commands_v1.sql')}
create function pg_temp.ok(p boolean,label text) returns text language plpgsql as $$begin if p is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
create function pg_temp.denies(q text,label text) returns text language plpgsql as $$begin
 begin execute q; exception when insufficient_privilege or invalid_parameter_value or sqlstate 'PT409' then return 'PASS: '||label; end;
 raise exception 'FAIL: expected denial %',label;end$$;
grant doji_business_enrollment to postgres;
grant doji_identity_resolver to postgres;
select pg_temp.ok(not (select enabled from portal_identity_private.business_enrollment_settings),'enrollment defaults disabled');
insert into portal_identity_private.realms(realm,enabled,issuer,audience) values('business',true,'https://business.test','business-test');
update business_private.settings set enabled=true,application_terms_version='terms-v1',privacy_version='privacy-v1';
${denied('disabled admission rejects', call())}
update portal_identity_private.business_enrollment_settings set enabled=true,admission_until=clock_timestamp()+interval '1 hour',account_limit=2;
${denied('wrong directory rejects', call('user_new', { issuer: "'https://employee.test'" }))}
${denied('wrong audience rejects', call('user_new', { audience: "'employee-test'" }))}
${denied('unchecked terms rejects', call('user_new', { terms: 'false' }))}
${denied('unchecked privacy rejects', call('user_new', { privacy: 'false' }))}
${denied('null consent rejects', call('user_new', { terms: 'null' }))}
${denied('stale terms reject', call('user_new', { tv: "'old'" }))}
${denied('non-US admission rejects', call('user_new', { country: "'CA'" }))}
${denied('missing session rejects', call('user_new', { session: 'null' }))}
set local role doji_business_enrollment;
select ${call()};
reset role;
select pg_temp.ok((select count(*)=1 from portal_identity_private.principals),'duplicate completion creates one principal');
select pg_temp.ok((select accounts_used=1 from portal_identity_private.business_enrollment_settings),'duplicate completion consumes capacity once');
select pg_temp.ok((select count(*)=1 from business_private.accounts),'business account committed');
select pg_temp.ok((select count(*)=1 from business_private.signup_agreements where terms_version='terms-v1' and privacy_version='privacy-v1'),'exact agreements committed');
select pg_temp.ok((select count(*)=1 from portal_identity_private.business_enrollment_receipts),'one durable completion receipt');
select pg_temp.ok(not exists(select 1 from business_private.organizations),'enrollment does not approve workspace');
select pg_temp.ok(not has_function_privilege('authenticated','portal_identity_private.complete_business_enrollment(text,text,text,text,boolean,boolean,text,text,text)','execute'),'member cannot enroll');
select pg_temp.ok(not has_function_privilege('doji_identity_resolver','portal_identity_private.complete_business_enrollment(text,text,text,text,boolean,boolean,text,text,text)','execute'),'read resolver cannot provision accounts');
select pg_temp.ok(not has_function_privilege('doji_business_enrollment','portal_identity_private.bind_identity(text,text,uuid,text)','execute'),'registrar cannot arbitrarily bind identities');
update portal_identity_private.business_read_settings set enabled=true;
update portal_identity_private.business_command_settings set enabled=true;
select set_config('test.details','{"legal_name":"Example LLC","brand_name":"Example","website":"https://example.test","country":"US","representative_name":"Test Owner","representative_role":"Owner","category":"Retail","purpose":"Synthetic local verification"}',true);
set local role doji_identity_resolver;
select pg_temp.ok(portal_identity_private.read_business_application('https://business.test','business-test','user_new','session_new',false) is null,'new enrollment starts without an application');
select pg_temp.ok(portal_identity_private.business_application_command('https://business.test','business-test','user_new','session_new',false,'save',null,current_setting('test.details')::jsonb,null,null,'87000000-0000-4000-8000-000000000001')#>>'{outcome,state}'='draft','new enrollment saves its own onboarding draft');
select pg_temp.ok(portal_identity_private.business_application_command('https://business.test','business-test','user_new','session_new',false,'submit',1,current_setting('test.details')::jsonb,'terms-v1','privacy-v1','87000000-0000-4000-8000-000000000002')#>>'{outcome,state}'='pending','enrolled account submits for review atomically');
select pg_temp.ok(portal_identity_private.business_application_command('https://business.test','business-test','user_new','session_new',false,'submit',1,current_setting('test.details')::jsonb,'terms-v1','privacy-v1','87000000-0000-4000-8000-000000000002')->>'replayed'='true','enrolled account submit retry replays its receipt');
select pg_temp.ok(portal_identity_private.read_business_application('https://business.test','business-test','user_new','session_new',false)->>'state'='pending','enrolled account reads its pending review state');
${denied('enrollment without MFA cannot open workspace', "portal_identity_private.read_business_workspace('https://business.test','business-test','user_new','session_new',false)")}
${denied('MFA alone does not grant organization approval', "portal_identity_private.read_business_workspace('https://business.test','business-test','user_new','session_new',true)")}
reset role;
select pg_temp.ok((select count(*)=1 from business_private.submissions),'enrollment and retry leave one immutable submission');
select pg_temp.ok(not exists(select 1 from business_private.organizations),'onboarding does not autoapprove an organization');
select portal_identity_private.revoke_session('business','user_new','session_new','synthetic-test');
${denied('revoked-session replay rejects', call())}
update business_private.accounts set disabled=true;
${denied('disabled-account replay rejects', call('user_new', { session: "'session_other'" }))}
select ${call('user_second')};
set local role doji_identity_resolver;
select pg_temp.ok(portal_identity_private.read_business_application('https://business.test','business-test','user_second','session_new',false) is null,'second enrolled identity cannot read first business application');
reset role;
${denied('third identity exceeds capacity', call('user_third'))}
select pg_temp.ok((select count(*)=2 from portal_identity_private.principals),'failed capacity check creates no partial principal');
update portal_identity_private.business_enrollment_settings set account_limit=3,admission_until=clock_timestamp()-interval '1 second';
${denied('expired admission rejects new account', call('user_third'))}
${body('docs/drafts/portal_identity_business_enrollment_v1.rollback.sql')}
select pg_temp.ok(not (select enabled from portal_identity_private.business_enrollment_settings),'rollback freezes admission');
select pg_temp.ok((select count(*)=2 from business_private.signup_agreements),'rollback retains agreements');
select pg_temp.ok(not has_function_privilege('doji_business_enrollment','portal_identity_private.complete_business_enrollment(text,text,text,text,boolean,boolean,text,text,text)','execute'),'rollback revokes registrar entry point');
${body('docs/drafts/portal_identity_business_commands_v1.rollback.sql')}
select pg_temp.ok(not exists(select * from before_auth except select id,md5(row_to_json(u)::text) from auth.users u) and not exists(select id,md5(row_to_json(u)::text) from auth.users u except select * from before_auth),'Auth identities unchanged');
select pg_temp.ok(not exists(select * from before_profile except select id,md5(row_to_json(p)::text) from public.profiles p) and not exists(select id,md5(row_to_json(p)::text) from public.profiles p except select * from before_profile),'member profiles unchanged');
select pg_temp.ok(not exists(select 1 from before_rpc f join pg_proc p on p.oid=f.oid where f.definition is distinct from pg_get_functiondef(p.oid) or f.proacl is distinct from p.proacl),'existing business and member RPC definitions and grants unchanged');
rollback;`;
try {
  const out = execFileSync(
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
    { input: sql, encoding: 'utf8', maxBuffer: 4e6, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  const checks = out.split('\n').filter((l) => l.startsWith('PASS:'));
  console.log(checks.join('\n'));
  console.log(checks.length + ' enrollment checks passed; all database changes rolled back.');
} catch (error) {
  console.error(errorOutput(error, 'stderr'));
  process.exitCode = 1;
}
