// Owner-approved additive foundation, NOT a login cutover. No provider keys,
// LOGIN roles, realm enablement, Auth writes, existing RPC changes or member work.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { cli, cf, hash, ref } from './prepare-safety-launch.mts';
import {evidenceRecord,evidenceAt,evidenceRows,evidenceAssets} from './release-evidence.mts';
import type {PagesReleaseProject} from './release-evidence.mts';
const root = 'test-results/portal-identity-foundation-20261001';
const sources = [
  'docs/drafts/portal_identity_registry_v1.sql',
  'docs/drafts/business_session_store_v1.sql',
  'docs/drafts/employee_session_store_v1.sql',
];
const mode = process.argv[2];
assert.ok(mode&&['prepare', 'rehearse', 'apply', 'verify'].includes(mode));
assert.equal((await readFile('supabase/.temp/project-ref', 'utf8')).trim(), ref);
const save = async (name:string, value:unknown) =>
  writeFile(`${root}/${name}.json`, JSON.stringify(value, null, 2), { flag: 'wx' });
const read = async (name:string) => evidenceRecord(JSON.parse(await readFile(`${root}/${name}.json`, 'utf8')));
const query = (sql:string) => evidenceRows(cli(['db', 'query', sql, '--linked', '--output-format', 'json']));
const fingerprint = `select md5(jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),p.proacl::text) order by p.oid)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','auth','storage','business_private') and p.prokind='f'),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in('public','auth','storage','business_private')),
 'relations',(select jsonb_agg(jsonb_build_array(c.oid,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity) order by c.oid)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','auth','storage','business_private') and c.relkind in('r','p','v','m'))
 )::text)`;
const state = () =>
  query(`begin read only;set local statement_timeout='8s';select jsonb_build_object(
 'fingerprint',(${fingerprint}),
 'schemas',(select coalesce(jsonb_agg(nspname order by nspname),'[]') from pg_namespace where nspname in('portal_identity_private','business_session_private','employee_session_private')),
 'roles',(select coalesce(jsonb_agg(rolname order by rolname),'[]') from pg_roles where rolname in('doji_identity_resolver','doji_business_session','doji_employee_session')),
 'active_event',exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '2 minutes' and fires_at+interval '12 minutes'>clock_timestamp() limit 1)
 ) as state;rollback;`)[0]?.state;
const pageState = async () => {
  const result:Record<string,unknown> = {};
  for (const name of ['doji-admin', 'doji-business', 'doji-site']) {
    const p = await cf<PagesReleaseProject>('/pages/projects/' + name);
    result[name] = {
      id: p.canonical_deployment?.id,
      domains: p.domains,
      functions: p.canonical_deployment?.uses_functions,
    };
  }
  return result;
};
if (mode === 'prepare') {
  await mkdir(root, { recursive: true });
  const before = evidenceRecord(state());
  assert.deepEqual(before.schemas, []);
  assert.deepEqual(before.roles, []);
  assert.equal(before.active_event, false);
  const files = await Promise.all(
    sources.map(async (path) => ({ path, sha256: hash(await readFile(path)) })),
  );
  const bodies = await Promise.all(
    sources.map(async (path) =>
      (await readFile(path, 'utf8')).replace(/^begin;\s*$/m, '').replace(/^commit;\s*$/m, ''),
    ),
  );
  const sql = `begin;set local lock_timeout='2s';set local statement_timeout='8s';
do $$begin
 if not pg_try_advisory_xact_lock(hashtextextended('doji-portal-identity-foundation-v1',0)) then raise exception 'Concurrent identity deployment';end if;
 if (${fingerprint})<>'${before.fingerprint}' then raise exception 'Existing contract drift';end if;
 if exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '2 minutes' and fires_at+interval '12 minutes'>clock_timestamp() limit 1) then raise exception 'Event window: do not deploy';end if;
end$$;
${bodies.join('\n')}
do $$declare candidate text;begin
 if (${fingerprint})<>'${before.fingerprint}' then raise exception 'Existing member/portal contracts changed';end if;
 if exists(select 1 from portal_identity_private.realms) or exists(select 1 from portal_identity_private.principals)
 or exists(select 1 from business_session_private.settings where enabled or scope_hash is not null)
 or exists(select 1 from employee_session_private.settings where enabled or scope_hash is not null) then raise exception 'Foundation must remain disabled and empty';end if;
 foreach candidate in array array['doji_identity_resolver','doji_employee_session','doji_business_session'] loop
  if exists(select 1 from pg_roles where rolname=candidate and (rolcanlogin or rolinherit or rolsuper or rolcreaterole or rolcreatedb or rolbypassrls or rolreplication))
   or pg_has_role('authenticator',candidate,'member') or pg_has_role('authenticated',candidate,'member') then raise exception 'Unexpected role reachability';end if;
 end loop;
end$$;
commit;`;
  await writeFile(`${root}/install.sql`, sql, { flag: 'wx' });
  await writeFile(`${root}/rehearse.sql`, sql.replace(/commit;$/, 'rollback;'), { flag: 'wx' });
  await save('candidate', {
    at: new Date().toISOString(),
    before,
    pages: await pageState(),
    files,
    sqlHash: hash(sql),
    disabled: true,
  });
  console.log('Prepared disabled private identity/session foundation; no deployment performed.');
} else {
  const candidate = await read('candidate');
  for (const f of evidenceAssets(candidate.files)) assert.equal(hash(await readFile(f.path)), f.sha256);
  assert.equal(hash(await readFile(`${root}/install.sql`)), candidate.sqlHash);
  if (mode === 'rehearse' || mode === 'apply') {
    const fresh = state();
    assert.deepEqual(fresh, candidate.before);
    if (mode === 'apply') {
      assert.equal((await read('rehearsed')).sqlHash, candidate.sqlHash);
      await assert.rejects(
        access(`${root}/apply-started.json`),
        'Attempt exists: inspect, never blindly retry',
      );
      await save('apply-started', { at: new Date().toISOString(), sqlHash: candidate.sqlHash });
    }
    cli([
      'db',
      'query',
      '--file',
      `${root}/${mode === 'apply' ? 'install' : 'rehearse'}.sql`,
      '--linked',
      '--output-format',
      'json',
    ]);
    if (mode === 'rehearse') {
      assert.deepEqual(state(), candidate.before);
      await save('rehearsed', { at: new Date().toISOString(), sqlHash: candidate.sqlHash });
      console.log(
        'Production transaction rehearsal rolled back; disabled foundation qualified against live grants.',
      );
      process.exit(0);
    }
  }
  const after = evidenceRecord(state());
  assert.equal(after.fingerprint, evidenceAt(candidate,'before').fingerprint);
  assert.deepEqual(after.schemas, [
    'business_session_private',
    'employee_session_private',
    'portal_identity_private',
  ]);
  assert.deepEqual(after.roles, [
    'doji_business_session',
    'doji_employee_session',
    'doji_identity_resolver',
  ]);
  const check = query(`begin read only;set local statement_timeout='5s';select jsonb_build_object(
 'realms',(select count(*) from portal_identity_private.realms),
 'principals',(select count(*) from portal_identity_private.principals),
 'business_enabled',(select enabled from business_session_private.settings where singleton),
 'employee_enabled',(select enabled from employee_session_private.settings where singleton),
 'business_records',(select count(*) from business_session_private.records),
 'employee_records',(select count(*) from employee_session_private.records)) as state;rollback;`)[0]
    ?.state;
  assert.deepEqual(check, {
    realms: 0,
    principals: 0,
    business_enabled: false,
    employee_enabled: false,
    business_records: 0,
    employee_records: 0,
  });
  assert.deepEqual(await pageState(), candidate.pages);
  await save(`verified-${Date.now()}`, {
    at: new Date().toISOString(),
    after,
    check,
    existingContractFingerprintUnchanged: true,
    loginCutover: false,
  });
  console.log(
    'Private foundation installed and verified DISABLED. Existing portal deployments and member/portal RPC, RLS and table grants unchanged. Independent login is NOT live.',
  );
}
