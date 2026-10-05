// Offline real Postgres, synthetic fixtures, entire draft + test rolled back.
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
const transactionBody = (path: string) =>
  readFileSync(path, 'utf8')
    .replace(/^begin;\s*$/m, '')
    .replace(/^commit;\s*$/m, '');
const draft = transactionBody('docs/drafts/employee_editorial_v1.sql');
const rollback = transactionBody('docs/drafts/employee_editorial_v1.rollback.sql');
const checks = readFileSync('scripts/test-editorial-local.sql', 'utf8');
const sql = `begin;
do $$begin
 if exists(select 1 from vault.secrets) or exists(select 1 from auth.users where email is null or email not like '%@test.invalid')
 then raise exception 'Synthetic offline database required'; end if;
end$$;
create temp table prior_functions as select p.oid,pg_get_functiondef(p.oid) as definition,p.proacl
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f';
create temp table prior_policies as select * from pg_policies;
create temp table prior_relations as select oid,relacl,relrowsecurity from pg_class;
-- Match the hosted postgres defaults; the migration must explicitly remove them.
alter default privileges for role postgres in schema public grant execute on functions to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
${draft}
${checks}
reset role;
select pg_temp.check_true(not exists(select 1 from prior_functions f join pg_proc p on p.oid=f.oid
 where f.definition is distinct from pg_get_functiondef(p.oid) or f.proacl is distinct from p.proacl),'existing functions/grants preserved');
select pg_temp.check_true(not exists(select * from prior_policies except select * from pg_policies),'existing policies preserved');
select pg_temp.check_true(not exists(select 1 from prior_relations r join pg_class c on c.oid=r.oid
 where r.relacl is distinct from c.relacl or r.relrowsecurity is distinct from c.relrowsecurity),'existing table permissions preserved');
${rollback}
select pg_temp.check_true(to_regprocedure('public.admin_editorial_command_v1(text,text,uuid,text,jsonb,text,text)') is null,'rollback removes entry point');
select pg_temp.check_true(exists(select 1 from public.admin_suggestion_reviews),'rollback retains review records');
rollback;
`;
try {
  const output = execFileSync(
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
  console.log(
    `${(checks.match(/pg_temp.check_true\(/g) || []).length} assertion call sites plus denial checks qualified.`,
  );
  console.log('Offline editorial PostgreSQL checks passed; all changes rolled back.');
} catch (error) {
  console.error(errorOutput(error, 'stderr'));
  process.exitCode = 1;
}
