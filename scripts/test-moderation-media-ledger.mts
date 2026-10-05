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
const draft = readFileSync('docs/drafts/moderation_media_ledger_v1.sql', 'utf8')
  .replace(/^begin;$/m, '')
  .replace(/^commit;$/m, '');
// Real Storage policies now come from migration replay, not a retained snapshot.
const sql = `begin;
do $$begin if exists(select 1 from vault.secrets) or exists(select 1 from auth.users where email is null or email not like '%@test.invalid') then raise exception 'Synthetic offline database required'; end if; end$$;
create temp table prior_functions as select p.oid,pg_get_functiondef(p.oid) definition,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f';
alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant execute on functions to anon,authenticated,service_role;
${draft}
${readFileSync('scripts/test-moderation-media-ledger.sql', 'utf8')}
reset role;
select pg_temp.check_true(not exists(select 1 from prior_functions f join pg_proc p on p.oid=f.oid where f.definition is distinct from pg_get_functiondef(p.oid) or f.proacl is distinct from p.proacl),'existing functions and grants unchanged');
rollback;`;
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
    { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 8000000 },
  );
  console.log(
    'Offline media ledger permission, lease, archive, retry, exhaustion and origin/CDN separation checks passed; transaction rolled back.',
  );
} catch (error) {
  console.error(errorOutput(error, 'stderr'));
  process.exitCode = 1;
}
