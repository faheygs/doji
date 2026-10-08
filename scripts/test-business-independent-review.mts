// Synthetic offline PostgreSQL only. Every fixture and schema overlay rolls back.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { engine, container } from './database/owned-target.mts';
import { errorOutput } from './database/contracts.mts';

const body = (file: string) =>
  readFileSync(file, 'utf8')
    .replaceAll('\r\n', '\n')
    .replace(/^begin;\s*$/m, '')
    .replace(/^commit;\s*$/m, '');
const drafts = [
  'business_applications_v1',
  'business_auth_v1',
  'business_signup_legal_v1',
  'business_privacy_v1',
  'portal_identity_registry_v1',
  'portal_identity_business_enrollment_v1',
  'portal_identity_business_reads_v1',
  'portal_identity_business_commands_v1',
];
const privacy = process.argv.includes('--privacy-candidate');
const sql = `begin;
set local statement_timeout='15s';
do $$begin
 if exists(select 1 from vault.secrets) or exists(select 1 from auth.users where email is null or email not like '%@test.invalid')
 then raise exception 'Synthetic offline database required'; end if;
end$$;
create temp table before_auth as select id,to_jsonb(u) data from auth.users u;
create temp table before_profiles as select id,to_jsonb(p) data from public.profiles p;
create temp table before_policies as select * from pg_policies;
create temp table before_functions as select oid,pg_get_functiondef(oid) definition,proacl from pg_proc
 where pronamespace='public'::regnamespace and prokind='f';
${drafts.map((name) => body('docs/drafts/' + name + '.sql')).join('\n')}
${body('docs/drafts/portal_identity_business_review_v1.sql')}
${privacy ? body('docs/drafts/business_session_store_v1.sql') + body('docs/drafts/portal_identity_business_privacy_v1.sql') : ''}
${readFileSync('scripts/test-business-independent-review.sql', 'utf8')}
${privacy ? readFileSync('scripts/test-business-independent-privacy.sql', 'utf8') : ''}
reset role;
select pg_temp.denied($drift$
 create or replace function business_private.privacy_target(p_id uuid,p_absent_ok boolean default false)
 returns void language plpgsql security definer set search_path='' as $changed$begin null;end$changed$;
 ${body('docs/drafts/portal_identity_business_review_v1.rollback.sql')}
 $drift$,'rollback rejects intervening source changes','P0001');
select pg_temp.ok((select enabled from portal_identity_private.realms where realm='business'),'failed rollback does not silently change flags');
${body('docs/drafts/portal_identity_business_review_v1.rollback.sql')}
select pg_temp.ok(not exists(select 1 from portal_identity_private.business_review_restore r
 where pg_get_functiondef(r.signature::regprocedure) is distinct from r.prior_definition),'rollback restores exact review/privacy functions');
select pg_temp.ok(not (select enabled from portal_identity_private.realms where realm='business'),'rollback freezes only business realm');
select pg_temp.ok((select enabled from portal_identity_private.realms where realm='employee'),'rollback preserves employee realm');
select pg_temp.ok((select count(*)>0 from business_private.history),'rollback preserves business decision history');
select pg_temp.ok((select count(*)>0 from business_private.signup_agreements),'rollback preserves legal agreements');
select pg_temp.ok(not exists(select * from before_auth except select id,to_jsonb(u) from auth.users u),'existing Auth data unchanged');
select pg_temp.ok(not exists(select id,to_jsonb(u) from auth.users u except select * from before_auth),'no new Auth account');
select pg_temp.ok(not exists(select * from before_profiles except select id,to_jsonb(p) from public.profiles p),'existing member data unchanged');
select pg_temp.ok(not exists(select * from before_policies except select * from pg_policies),'existing RLS policies unchanged');
select pg_temp.ok(not exists(select 1 from before_functions f join pg_proc p on p.oid=f.oid
 where f.definition is distinct from pg_get_functiondef(p.oid) or f.proacl is distinct from p.proacl),'existing public/member RPCs and grants unchanged');
rollback;`;
try {
  const output = execFileSync(
    engine,
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
  const checks = output.split('\n').filter((line) => line.startsWith('PASS:'));
  assert.ok(checks.length >= 30, 'Expected independent review assertions');
  console.log(checks.join('\n'));
  console.log(
    `${checks.length} independent business review checks passed; all changes rolled back.`,
  );
} catch (error) {
  console.error(errorOutput(error, 'stderr'));
  process.exitCode = 1;
}
