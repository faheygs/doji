// Local synthetic PostgreSQL only. No network, production credentials or deploy.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { errorOutput, offlineContainer } from './database/contracts.mts';
import { engine as podman, container } from './database/owned-target.mts';
const info = offlineContainer(
  JSON.parse(execFileSync(podman, ['inspect', container], { encoding: 'utf8' })),
);
assert.equal(info.HostConfig.NetworkMode, 'none');
assert.equal(Object.keys(info.HostConfig.PortBindings || {}).length, 0);
const sqlBody = (path: string) =>
  readFileSync(path, 'utf8')
    .replace(/^begin;\s*$/m, '')
    .replace(/^commit;\s*$/m, '');
const identityCandidate = process.argv.includes('--identity-candidate');
const sql = `begin;
do $$begin
 if exists(select 1 from vault.secrets) or exists(select 1 from auth.users where email is null or email not like '%@test.invalid')
 then raise exception 'Synthetic offline database required'; end if;
end$$;
create temp table prior_functions as select p.oid,pg_get_functiondef(p.oid) definition,p.proacl
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f';
create temp table prior_policies as select * from pg_policies;
create temp table prior_relations as select oid,relacl,relrowsecurity from pg_class;
alter default privileges for role postgres in schema public grant execute on functions to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
${sqlBody('docs/drafts/business_applications_v1.sql')}
${identityCandidate ? sqlBody('docs/drafts/portal_identity_registry_v1.sql') + sqlBody('docs/drafts/portal_identity_business_commands_v1.sql') : ''}
-- Test driver may SET ROLE; API authenticator remains deliberately ungranted.
grant doji_business to postgres;
${readFileSync('scripts/test-business-foundation.sql', 'utf8')}
reset role;
alter table business_private.applications add constraint business_launch_country_us check(coalesce(details->>'country','') in ('','US'));
do $$begin
 begin
  update business_private.applications set details=jsonb_set(details,'{country}','"CA"'::jsonb)
   where id=(select id from business_private.applications limit 1);
  raise exception 'US launch guard did not reject non-US draft';
 exception when check_violation then null; end;
end$$;
select pg_temp.check_true(true,'US-only constraint rejects non-US direct writes');
${sqlBody('docs/drafts/business_realtime_v1.sql')}
${readFileSync('scripts/test-business-realtime.sql', 'utf8')}
${sqlBody('docs/drafts/business_realtime_v1.rollback.sql')}
select pg_temp.check_true(not (select realtime_enabled from business_private.settings),'realtime rollback stops producers');
select pg_temp.check_true(not has_function_privilege('doji_business','public.get_business_realtime_capability_v1()','execute'),'realtime rollback stops issuance');
${sqlBody('docs/drafts/business_auth_v1.sql')}
select set_config('test.member.email',email,true) from auth.users where id=current_setting('test.member')::uuid;
select set_config('test.employee.email',email,true) from auth.users where id=current_setting('test.employee')::uuid;
${readFileSync('scripts/test-business-auth.sql', 'utf8')}
${sqlBody('docs/drafts/business_public_admission_v1.sql')}
${readFileSync('scripts/test-business-public-admission.sql', 'utf8')}
${sqlBody('docs/drafts/business_signup_legal_v1.sql')}
${sqlBody('docs/drafts/business_privacy_v1.sql')}
${identityCandidate ? ['portal_identity_business_enrollment_v1', 'portal_identity_business_reads_v1', 'portal_identity_business_review_v1'].map((name) => sqlBody('docs/drafts/' + name + '.sql')).join('\n') : ''}
${readFileSync('scripts/test-business-privacy.sql', 'utf8')}
${identityCandidate ? sqlBody('docs/drafts/portal_identity_business_review_v1.rollback.sql') : ''}
${sqlBody('docs/drafts/business_privacy_v1.rollback.sql')}
select pg_temp.check_true(not (select enabled from business_private.privacy_settings),'privacy rollback freezes workflow without deleting cases');
select pg_temp.check_true(not has_function_privilege('service_role','public.claim_business_erasure_v1(uuid,uuid)','execute'),'privacy rollback removes executor access');
select pg_temp.check_true(not has_function_privilege('doji_employee','public.get_admin_business_privacy_correction_v1(uuid)','execute'),'privacy rollback removes only the new correction reader grant');
${sqlBody('docs/drafts/business_signup_legal_v1.rollback.sql')}
select pg_temp.check_true((select count(*)>0 from business_private.signup_agreements),'signup rollback retains agreement evidence');
${sqlBody('docs/drafts/business_public_admission_v1.rollback.sql')}
select pg_temp.check_true(not (select enabled or registration_open from business_private.public_auth_settings),'public rollback closes access');
select pg_temp.check_true(not has_function_privilege('service_role','public.claim_public_business_auth_v1(text,text)','execute'),'public rollback revokes admission');
${sqlBody('docs/drafts/business_auth_v1.rollback.sql')}
select pg_temp.check_true(not (select enabled from business_private.auth_settings),'auth rollback closes admission');
select pg_temp.check_true(not has_function_privilege('service_role','public.claim_business_auth_v1(text,text)','execute'),'auth rollback removes admission grant');
${identityCandidate ? sqlBody('docs/drafts/portal_identity_business_commands_v1.rollback.sql') : ''}
select pg_temp.check_true(not exists(select 1 from prior_functions f join pg_proc p on p.oid=f.oid
 where f.definition is distinct from pg_get_functiondef(p.oid) or f.proacl is distinct from p.proacl),'all existing public functions/grants preserved');
select pg_temp.check_true(not exists(select * from prior_policies except select * from pg_policies),'all existing policies preserved');
select pg_temp.check_true(not exists(select 1 from prior_relations r join pg_class c on c.oid=r.oid
 where r.relacl is distinct from c.relacl or r.relrowsecurity is distinct from c.relrowsecurity),'existing table privileges/RLS preserved');
${sqlBody('docs/drafts/business_applications_v1.rollback.sql')}
select pg_temp.check_true(not (select enabled from business_private.settings),'rollback disables business boundary');
select pg_temp.check_true((select count(*)>0 from business_private.submissions),'rollback retains submitted evidence and consents');
select pg_temp.check_true((select count(*)>0 from business_private.receipts),'rollback retains receipts');
select pg_temp.check_true(not has_function_privilege('doji_business','public.get_business_application_v1()','execute'),'rollback removes business entry access');
rollback;`;
try {
  const result = execFileSync(
    podman,
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
    { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let count = result.match(/PASS:/g)?.length || 0;
  console.log(
    result
      .split('\n')
      .filter((line) => line.startsWith('PASS:'))
      .join('\n'),
  );
  for (const [name, injection, expected] of [
    [
      'unexpected PUBLIC function',
      'create function public.business_test_accidental_access() returns boolean language sql as $$select true$$; grant execute on function public.business_test_accidental_access() to public;',
      'unexpected RPC access',
    ],
    [
      'unexpected PUBLIC table',
      'create table public.business_test_accidental_table(id uuid); grant select on public.business_test_accidental_table to public;',
      'unexpected table access',
    ],
  ] as const) {
    let denied = false;
    try {
      execFileSync(
        podman,
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
        {
          input: `begin; ${injection}\n${sqlBody('docs/drafts/business_applications_v1.sql')}\nrollback;`,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
    } catch (error) {
      assert.ok(errorOutput(error, 'stderr').includes(expected), errorOutput(error, 'stderr'));
      denied = true;
    }
    assert.ok(denied, `${name} must block installation`);
    console.log(`PASS: migration rejects ${name} and transaction rolls back`);
    count++;
  }
  mkdirSync('test-results/database/business-foundation', { recursive: true });
  writeFileSync(
    'test-results/database/business-foundation/database-result.json',
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        assertions: count,
        passed: true,
        environment: 'network-disabled synthetic restored-schema PostgreSQL',
        rolledBack: true,
        productionChanged: false,
        concurrencyQualified: false,
        hostedAuthQualified: false,
        assertionsPassed: result.split('\n').filter((line) => line.startsWith('PASS:')),
        negativeInstallProbes: ['unexpected PUBLIC function', 'unexpected PUBLIC table'],
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `${count} assertions passed on offline restored-schema PostgreSQL; entire transaction rolled back.`,
  );
} catch (error) {
  console.error(errorOutput(error, 'stderr'));
  process.exitCode = 1;
}
