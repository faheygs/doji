// Read-only production capture and local assembly. No deployment mode.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { cli, cf, ref, hash, inventory } from './prepare-safety-launch.mts';
import {
  functions,
  secrets,
  pages,
  database,
  health,
  linkedWorkspace,
} from './business-disabled-release-reads.mts';
import { evidenceRecord, evidenceRows } from './release-evidence.mts';
assert.equal(process.argv.length, 2);
assert.equal((await readFile(`${linkedWorkspace}/supabase/.temp/project-ref`, 'utf8')).trim(), ref);
const before = {
  at: new Date().toISOString(),
  functions: functions(),
  secrets: secrets(),
  pages: await pages(),
  database: database(),
  health: await health(),
};
assert.equal(before.database.event_window, false);
assert.equal(before.database.overdue_sample, 0);
assert.ok(
  !before.secrets.some((s) =>
    ['BUSINESS_OWNED_AUTH_ENABLED', 'BUSINESS_AUTH_MAINTENANCE'].includes(String(s.name)),
  ),
);
const priorConfig = await readFile('.artifacts/business-runtime/runtime.json', 'utf8');
assert.equal(
  hash(priorConfig),
  before.secrets.find((s) => s.name === 'BUSINESS_V2_CONFIG')?.value,
  'Protected prior runtime configuration must exactly match the live secret',
);
const project = evidenceRecord(await cf('/pages/projects/doji-business'));
assert.equal(
  evidenceRecord(project.canonical_deployment).id,
  evidenceRecord(before.pages['doji-business']).id,
);
await mkdir('test-results', { recursive: true });
const folder = await mkdtemp('test-results/business-owned-release-');
const secure = `.artifacts/${folder.split('/')[1]}`;
execFileSync('git', ['check-ignore', `${secure}/runtime-before.json`], { stdio: 'pipe' });
await mkdir(secure, { recursive: false });
const owner = execFileSync('whoami', [], { encoding: 'utf8' }).trim();
execFileSync(
  'icacls',
  [secure, '/inheritance:r', '/grant:r', `${owner}:(OI)(CI)F`, 'SYSTEM:(OI)(CI)F'],
  { stdio: 'pipe' },
);
await writeFile(`${secure}/runtime-before.json`, priorConfig, { flag: 'wx' });
await writeFile(`${secure}/pages-before.json`, JSON.stringify(project), { flag: 'wx' });
await mkdir(`${folder}/edge-before`, { recursive: false });
cli(
  [
    'functions',
    'download',
    'business-portal-v2',
    '--project-ref',
    ref,
    '--use-api',
    '--workdir',
    resolve(folder, 'edge-before'),
  ],
  false,
);
// Existing live Pages rollback is already hash-verified by its release manifest.
const pagesRollback = 'test-results/react-business-migration-6PLoSb';
const pagesManifest = evidenceRecord(
  JSON.parse(await readFile(`${pagesRollback}/prepared.json`, 'utf8')),
);
assert.deepEqual(await inventory(`${pagesRollback}/site`), pagesManifest.assets);
const deployed = evidenceRecord(
  JSON.parse(await readFile(`${pagesRollback}/deployed.json`, 'utf8')),
);
assert.equal(
  evidenceRecord(evidenceRecord(deployed.after)['doji-business']).id,
  evidenceRecord(before.pages['doji-business']).id,
);
const query = (sql: string) =>
  evidenceRows(
    cli(['db', 'query', sql, '--linked', '--workdir', linkedWorkspace, '--output-format', 'json']),
  );
const allSchemas =
  "('public','auth','storage','business_private','portal_identity_private','business_session_private','employee_session_private')";
const snapshot = `jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_array(p.oid,md5(pg_get_functiondef(p.oid)),p.proacl::text) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and n.nspname in ${allSchemas}),
 'relations',(select jsonb_agg(jsonb_build_array(c.oid,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity) order by c.oid) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in('r','p','v','m') and n.nspname in ${allSchemas}),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p),
 'roles',(select jsonb_agg(case when rolname='cli_login_postgres' then to_jsonb(r)-'rolvaliduntil' else to_jsonb(r) end order by rolname) from pg_roles r),
 'members',(select jsonb_agg(to_jsonb(m) order by roleid,member) from pg_auth_members m),
 'realms',(select jsonb_agg(to_jsonb(r) order by realm) from portal_identity_private.realms r),
 'business_settings',(select to_jsonb(s) from business_session_private.settings s where singleton),
 'employee_settings',(select to_jsonb(s) from employee_session_private.settings s where singleton))`;
const fingerprint = `md5((${snapshot})::text)`;
const old = evidenceRecord(
  query(
    `begin read only;set local statement_timeout='5s';select jsonb_build_object('fingerprint',${fingerprint},'owned_exists',exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='business_session_private' and c.relname like 'owned_auth_%')) state;rollback;`,
  )[0]?.state,
);
assert.equal(old.owned_exists, false);
assert.match(String(old.fingerprint), /^[a-f0-9]{32}$/);
const drafts = [
  'business_owned_auth_guard_v1.sql',
  'business_owned_reset_links_v1.sql',
  'business_owned_store_v1.sql',
  'business_owned_acceptance_v1.sql',
];
await mkdir(`${folder}/sql`);
const draftHashes: Record<string, string> = {};
let body = '';
for (const file of drafts) {
  const source = (await readFile(`supabase/overlays/${file}`, 'utf8')).replaceAll('\r\n', '\n');
  assert.equal((source.match(/^begin;$/gm) || []).length, 1);
  assert.equal((source.match(/^commit;$/gm) || []).length, 1);
  body += source.replace(/^begin;$|^commit;$/gm, '') + '\n';
  draftHashes[file] = hash(source);
  await copyFile(`supabase/overlays/${file}`, `${folder}/sql/${file}`);
}
const guard = `do $$begin
 if not pg_try_advisory_xact_lock(hashtextextended('doji-business-owned-auth-v1',0)) then raise exception 'Concurrent business release';end if;
 if ${fingerprint}<>'${old.fingerprint}' then raise exception 'Production contract drift';end if;
 if exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '25 minutes' and fires_at+interval '15 minutes'>clock_timestamp() limit 1) then raise exception 'Event window';end if;
 if exists(select 1 from public.domain_event_outbox where published_at is null and available_at<clock_timestamp()-interval '60 seconds' limit 1) then raise exception 'Delivery backlog';end if;
end$$;`;
const preserve = `create temp table owned_release_before as select ${snapshot} state;
create temp table owned_release_functions as select p.oid,pg_get_functiondef(p.oid) definition,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and n.nspname in ${allSchemas};
create temp table owned_release_relations as select c.oid,c.relacl,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in('r','p','v','m') and n.nspname in ${allSchemas};`;
const after = `do $$declare now_state jsonb; before_state jsonb; begin
 if exists(select 1 from owned_release_functions b left join pg_proc p on p.oid=b.oid where p.oid is null or b.definition is distinct from pg_get_functiondef(p.oid) or b.proacl is distinct from p.proacl) then raise exception 'Existing function/grant changed';end if;
 if exists(select 1 from owned_release_relations b left join pg_class c on c.oid=b.oid where c.oid is null or (b.relacl,b.relrowsecurity,b.relforcerowsecurity) is distinct from (c.relacl,c.relrowsecurity,c.relforcerowsecurity)) then raise exception 'Existing relation changed';end if;
 select state into before_state from owned_release_before;
 now_state:=${snapshot};
 if (before_state-'functions'-'relations') is distinct from (now_state-'functions'-'relations') then raise exception 'Existing policy/role/realm/settings changed';end if;
 if exists(select 1 from business_session_private.owned_auth_settings where enabled or scope_hash is not null or epoch<>0)
  or exists(select 1 from business_session_private.owned_auth_acceptance where enabled or identity_hmac is not null or reserved_at is not null)
  then raise exception 'New gates not closed';end if;
 if exists(select 1 from pg_roles r cross join pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='business_session_private' and p.proname like '%owned%' and r.rolname in ('anon','authenticated','service_role','doji_employee','doji_business','doji_identity_resolver') and has_function_privilege(r.rolname,p.oid,'execute')) then raise exception 'New function access leaked';end if;
end$$;`;
const sql = `begin;set local lock_timeout='2s';set local statement_timeout='8s';\n${guard}\n${preserve}\n${body}\n${after}\ncommit;\n`;
await writeFile(`${folder}/install.sql`, sql, { flag: 'wx' });
await writeFile(`${folder}/rehearse.sql`, sql.replace(/commit;\n$/, 'rollback;\n'), { flag: 'wx' });
const stop = `begin;set local lock_timeout='2s';set local statement_timeout='5s';
select 1 from business_session_private.owned_auth_settings where singleton for update;
update business_session_private.owned_auth_settings set enabled=false where singleton;
update business_session_private.owned_auth_acceptance set enabled=false where singleton;
do $$declare p regprocedure;begin for p in select oid::regprocedure from pg_proc where pronamespace='business_session_private'::regnamespace and proname like '%owned%' loop
 execute format('revoke execute on function %s from doji_business_session',p);end loop;end$$;
commit;`;
await writeFile(`${folder}/stop-before-enable.sql`, stop, { flag: 'wx' });
await writeFile(`${folder}/baseline.json`, JSON.stringify({ ...before, sql: old }, null, 2), {
  flag: 'wx',
});
await writeFile(
  `${folder}/prepared.json`,
  JSON.stringify(
    {
      at: new Date().toISOString(),
      secure,
      installHash: hash(sql),
      draftHashes,
      edgeRollback: await inventory(`${folder}/edge-before`),
      pagesRollback,
      pagesRollbackAssets: pagesManifest.assets,
      runtimeBackupHash: hash(priorConfig),
      deployed: false,
      databaseEnabled: false,
      sendingEnabled: false,
      publicRegistrationOpened: false,
    },
    null,
    2,
  ),
  { flag: 'wx' },
);
console.log(
  JSON.stringify({ folder, rollbackCaptured: true, gatesClosed: true, productionWrites: 0 }),
);
