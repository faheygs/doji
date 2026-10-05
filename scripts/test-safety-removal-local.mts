// No networking: synthetic offline Postgres transaction, rolled back in full.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { errorOutput, offlineContainer } from './database/contracts.mts';
import { engine as podman, container } from './database/owned-target.mts';
const info = offlineContainer(
  JSON.parse(execFileSync(podman, ['inspect', container], { encoding: 'utf8' })),
);
assert.equal(info.HostConfig.NetworkMode, 'none');
assert.equal(Object.keys(info.HostConfig.PortBindings || {}).length, 0);
const draft = [
  'external_takedown_intake_v1.sql',
  'external_takedown_alerts_v1.sql',
  'external_takedown_alert_wakeup_v1.sql',
  'external_takedown_staff_bridge_v1.sql',
]
  .map((name) =>
    readFileSync(`docs/drafts/${name}`, 'utf8')
      .replace(/^begin;\s*$/m, '')
      .replace(/^commit;\s*$/m, ''),
  )
  .join('\n');
const bridgeChecks = readFileSync('scripts/test-safety-removal-bridge.sql', 'utf8');
const rollback = readFileSync('docs/drafts/external_takedown_staff_bridge_rollback.sql', 'utf8')
  .replace(/^begin;\s*$/m, '')
  .replace(/^commit;\s*$/m, '');
const checks = readFileSync('scripts/test-safety-removal-local.sql', 'utf8');
const sql = `begin;
do $$begin if exists(select 1 from vault.secrets) or exists(select 1 from auth.users where email is null or email not like '%@test.invalid') then raise exception 'Synthetic offline database required'; end if; end$$;
create temp table prior_functions as select p.oid,pg_get_functiondef(p.oid) definition,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f';
create temp table prior_policies as select * from pg_policies;
create temp table prior_relations as select oid,relacl,relrowsecurity from pg_class;
alter default privileges for role postgres in schema public grant execute on functions to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
${draft}
${checks}
reset role;
${bridgeChecks}
reset role;
${readFileSync('scripts/test-safety-removal-categories.sql', 'utf8')}
reset role;
select pg_temp.check_true(not exists(select 1 from prior_functions f join pg_proc p on p.oid=f.oid where (f.definition is distinct from pg_get_functiondef(p.oid) or f.proacl is distinct from p.proacl) and p.oid not in ('public.trg_enforce_write_rate_limit()'::regprocedure,'public.publish_reporter_visibility_change()'::regprocedure,'public.trg_report_notify_admin()'::regprocedure)),'only the three scoped report guards changed');
${rollback}
select pg_temp.check_true(not exists(select 1 from prior_functions f join pg_proc p on p.oid=f.oid where f.definition is distinct from pg_get_functiondef(p.oid) or f.proacl is distinct from p.proacl),'existing functions and grants preserved');
select pg_temp.check_true(not exists(select * from prior_policies except select * from pg_policies),'existing policies preserved');
select pg_temp.check_true(not exists(select 1 from prior_relations r join pg_class c on c.oid=r.oid where r.relacl is distinct from c.relacl or r.relrowsecurity is distinct from c.relrowsecurity),'existing table privileges preserved');
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
    'Offline safety-removal permission, receipt, deadline and command checks passed; transaction rolled back.',
  );
  console.log(output.trim().split('\n').slice(-5).join('\n'));
} catch (error) {
  console.error(errorOutput(error, 'stderr'));
  process.exitCode = 1;
}
