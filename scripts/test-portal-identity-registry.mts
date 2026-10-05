// Existing network-disabled synthetic Postgres only; all changes roll back.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { offlineContainer, errorOutput } from './database/contracts.mts';
const podman = 'C:/Program Files/RedHat/Podman/podman.exe';
const container = 'supabase_db_employee-cutover-verify';
const info = offlineContainer(
  JSON.parse(execFileSync(podman, ['inspect', container], { encoding: 'utf8' })),
);
assert.equal(info.HostConfig.NetworkMode, 'none');
assert.equal(Object.keys(info.HostConfig.PortBindings || {}).length, 0);
const body = (path: string) =>
  readFileSync(path, 'utf8')
    .replace(/^begin;\s*$/m, '')
    .replace(/^commit;\s*$/m, '');
const sql = `begin;
do $$begin
 if exists(select 1 from vault.secrets) or exists(select 1 from auth.users where email is null or email not like '%@test.invalid')
 then raise exception 'Synthetic offline database required'; end if;
end$$;
${body('docs/drafts/business_applications_v1.sql')}
create temp table prior_functions as select p.oid,pg_get_functiondef(p.oid) definition,p.proacl from pg_proc p
 join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','business_private') and p.prokind='f';
create temp table prior_policies as select * from pg_policies;
create temp table prior_relations as select oid,relacl,relrowsecurity from pg_class;
create temp table prior_auth as select id,md5(row_to_json(u)::text) fingerprint from auth.users u;
create temp table prior_profiles as select id,md5(row_to_json(p)::text) fingerprint from public.profiles p;
${body('docs/drafts/portal_identity_registry_v1.sql')}
-- Synthetic test-driver membership only, rolled back with this transaction.
grant doji_identity_resolver to postgres;
${readFileSync('scripts/test-portal-identity-registry.sql', 'utf8')}
${body('docs/drafts/portal_identity_registry_v1.rollback.sql')}
select pg_temp.ok(not exists(select 1 from portal_identity_private.realms where enabled),'rollback disables only candidate realms');
select pg_temp.ok(not has_function_privilege('doji_identity_resolver','portal_identity_private.resolve_identity(text,text,text,text,text,boolean)','execute'),'rollback removes resolver grant');
select pg_temp.ok((select count(*)=2 from portal_identity_private.principals),'rollback preserves principals');
select pg_temp.ok((select count(*)>=5 from portal_identity_private.mapping_audit),'rollback preserves audit history');
select pg_temp.ok(not exists(select 1 from prior_functions f join pg_proc p on p.oid=f.oid
 where f.definition is distinct from pg_get_functiondef(p.oid) or f.proacl is distinct from p.proacl),'existing RPC definitions and grants unchanged');
select pg_temp.ok(not exists(select * from prior_policies except select * from pg_policies),'existing policies unchanged');
select pg_temp.ok(not exists(select 1 from prior_relations r join pg_class c on c.oid=r.oid
 where r.relacl is distinct from c.relacl or r.relrowsecurity is distinct from c.relrowsecurity),'existing table grants and RLS unchanged');
select pg_temp.ok(not exists(select id,md5(row_to_json(u)::text) from auth.users u except select * from prior_auth)
 and not exists(select * from prior_auth except select id,md5(row_to_json(u)::text) from auth.users u),'all Auth rows byte-fingerprint unchanged');
select pg_temp.ok(not exists(select id,md5(row_to_json(p)::text) from public.profiles p except select * from prior_profiles)
 and not exists(select * from prior_profiles except select id,md5(row_to_json(p)::text) from public.profiles p),'all member profiles unchanged');
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
    { input: sql, encoding: 'utf8', maxBuffer: 4e6, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  const checks = output.split('\n').filter((l) => l.startsWith('PASS:'));
  console.log(checks.join('\n'));
  console.log(`${checks.length} offline database checks passed; transaction rolled back.`);
  for (const [label, injection, expected] of [
    [
      'unexpected PUBLIC function',
      'create function public.identity_test_exposed() returns boolean language sql as $$select true$$; grant execute on function public.identity_test_exposed() to public;',
      'unexpected application function access',
    ],
    [
      'unexpected PUBLIC table',
      'create table public.identity_test_exposed(id integer); grant select on public.identity_test_exposed to public;',
      'unexpected table access',
    ],
  ] as const) {
    let rejected = false;
    try {
      execFileSync(
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
        {
          input: sql.replace(
            body('docs/drafts/portal_identity_registry_v1.sql'),
            () => injection + '\n' + body('docs/drafts/portal_identity_registry_v1.sql'),
          ),
          encoding: 'utf8',
          maxBuffer: 4e6,
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
    } catch (e) {
      assert.ok(errorOutput(e, 'stderr').includes(expected), errorOutput(e, 'stderr'));
      rejected = true;
    }
    assert.ok(rejected, label + ' must reject');
    console.log('PASS: ' + label + ' rejected; connection rollback');
  }
} catch (e) {
  console.error(errorOutput(e, 'stderr'));
  process.exitCode = 1;
}
