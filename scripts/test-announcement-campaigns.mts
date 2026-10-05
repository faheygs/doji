// No network/ports/production credentials. All changes are rollback-only.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { errorOutput, offlineContainer } from './database/contracts.mts';
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
alter default privileges for role postgres in schema public grant execute on functions to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
${body('docs/drafts/employee_editorial_v1.sql')}
${readFileSync('scripts/test-editorial-local.sql', 'utf8')}
reset role;
create temp table prior_campaign_functions as select p.oid,p.proname,pg_get_functiondef(p.oid) definition,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f';
create temp table prior_campaign_policies as select * from pg_policies;
create temp table prior_campaign_relations as select oid,relacl,relrowsecurity from pg_class;
${body('docs/drafts/announcement_campaigns_v1.sql')}
${readFileSync('scripts/test-announcement-campaigns.sql', 'utf8')}
reset role;
select pg_temp.check_true(not exists(select 1 from prior_campaign_functions f join pg_proc p on p.oid=f.oid where f.proacl is distinct from p.proacl),'existing function grants unchanged');
select pg_temp.check_true(not exists(select 1 from prior_campaign_functions f join pg_proc p on p.oid=f.oid where f.proname not in ('admin_editorial_command_v1','submit_challenge_suggestion','claim_active_app_announcement') and f.definition is distinct from pg_get_functiondef(p.oid)),'only three approved function bodies changed');
select pg_temp.check_true(not exists(select * from prior_campaign_policies except select * from pg_policies),'existing policies unchanged');
select pg_temp.check_true(not exists(select 1 from prior_campaign_relations r join pg_class c on c.oid=r.oid where r.relacl is distinct from c.relacl or r.relrowsecurity is distinct from c.relrowsecurity),'existing table permissions unchanged');
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
  console.log('Offline campaign and baseline editorial SQL tests passed; all changes rolled back.');
} catch (error) {
  console.error(errorOutput(error, 'stderr'));
  process.exitCode = 1;
}
