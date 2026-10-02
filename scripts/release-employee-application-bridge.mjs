// Approved employee-only application transport, installed disabled first.
// No account provisioning, realm enablement, LOGIN credentials or portal release.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { cli, cf, hash, ref } from './prepare-safety-launch.mjs';
const root = 'test-results/employee-application-release-20261001';
const sources = [
  'docs/drafts/portal_identity_employee_rpc_v1.sql',
  'docs/drafts/portal_employee_directory_v1.sql',
  'docs/drafts/employee_login_admission_v1.sql',
];
const mode = process.argv[2];
assert.ok(['prepare', 'rehearse', 'apply', 'verify'].includes(mode));
assert.equal((await readFile('supabase/.temp/project-ref', 'utf8')).trim(), ref);
const save = (name, value) =>
  writeFile(`${root}/${name}.json`, JSON.stringify(value, null, 2), { flag: 'wx' });
const read = async (name) => JSON.parse(await readFile(`${root}/${name}.json`, 'utf8'));
const query = (sql) => cli(['db', 'query', sql, '--linked', '--output-format', 'json']).rows;
const fingerprint = `select md5(jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),p.proacl::text) order by p.oid) from pg_proc p where p.prokind='f' and p.pronamespace in('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace,'business_private'::regnamespace)),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in('public','auth','storage','business_private')),
 'relations',(select jsonb_agg(jsonb_build_array(c.oid,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity) order by c.oid) from pg_class c where c.relnamespace in('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace,'business_private'::regnamespace) and c.relkind in('r','p','v','m')),
 'foreign_keys',(select jsonb_agg(jsonb_build_array(c.conrelid,c.conname,pg_get_constraintdef(c.oid)) order by c.conrelid,c.conname) from pg_constraint c where c.contype='f' and c.connamespace in('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace,'business_private'::regnamespace)),
 'triggers',(select jsonb_agg(jsonb_build_array(t.oid,pg_get_triggerdef(t.oid),t.tgenabled) order by t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and c.relnamespace in('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace,'business_private'::regnamespace))
 )::text)`;
const state = () =>
  query(`begin read only;set local statement_timeout='8s';select jsonb_build_object(
 'fingerprint',(${fingerprint}),
 'installed',to_regclass('portal_identity_private.employee_rpc_settings') is not null,
 'role_exists',exists(select 1 from pg_roles where rolname='doji_employee_application'),
 'active_event',exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '2 minutes' and fires_at+interval '12 minutes'>clock_timestamp() limit 1)
 ) state;rollback;`)[0].state;
async function pages() {
  const result = {};
  for (const name of ['doji-admin', 'doji-business', 'doji-site'])
    result[name] = (await cf('/pages/projects/' + name)).canonical_deployment.id;
  return result;
}
if (mode === 'prepare') {
  await mkdir(root, { recursive: true });
  const before = state();
  assert.equal(before.installed, false);
  assert.equal(before.role_exists, false);
  assert.equal(before.active_event, false);
  const pageSnapshot = await pages();
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
 if not pg_try_advisory_xact_lock(hashtextextended('doji-employee-application-v1',0)) then raise exception 'Concurrent deployment';end if;
 if (${fingerprint})<>'${before.fingerprint}' then raise exception 'Existing contracts changed';end if;
 if exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '2 minutes' and fires_at+interval '12 minutes'>clock_timestamp() limit 1) then raise exception 'Event window: defer';end if;
 end$$;
 ${bodies.join('\n')}
 do $$declare r text;begin
 if (${fingerprint})<>'${before.fingerprint}' then raise exception 'Shared contract changed';end if;
 if (select enabled from portal_identity_private.employee_rpc_settings where singleton)
 or exists(select 1 from portal_identity_private.employee_contacts)
 or exists(select 1 from employee_session_private.settings where enabled) then raise exception 'Employee bridge must remain disabled';end if;
 if exists(select 1 from pg_roles where rolname='doji_employee_application' and (rolcanlogin or rolinherit or rolsuper or rolcreaterole or rolcreatedb or rolbypassrls or rolreplication)) then raise exception 'Unsafe role';end if;
 foreach r in array array['authenticator','anon','authenticated','doji_employee','doji_business','service_role','doji_identity_resolver'] loop
  if pg_has_role(r,'doji_employee_application','member')
   or has_function_privilege(r,'portal_identity_private.employee_rpc_v1(text,text,text,text,boolean,text,jsonb)','EXECUTE') then raise exception 'Unexpected bridge reachability';end if;
 end loop;
 end$$;commit;`;
  // A read-only provider failure may have left an identical local SQL artifact.
  // Reuse only byte-identical preparation; never overwrite release evidence.
  for (const [name, value] of [
    ['install', sql],
    ['rehearse', sql.replace(/commit;$/, 'rollback;')],
  ]) {
    try {
      await writeFile(`${root}/${name}.sql`, value, { flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      assert.equal(await readFile(`${root}/${name}.sql`, 'utf8'), value);
    }
  }
  await save('candidate', {
    at: new Date().toISOString(),
    before,
    pages: pageSnapshot,
    files,
    sqlHash: hash(sql),
  });
  console.log('Prepared exact disabled employee bridge release; no production mutation.');
} else {
  const candidate = await read('candidate');
  for (const f of candidate.files) assert.equal(hash(await readFile(f.path)), f.sha256);
  assert.equal(hash(await readFile(`${root}/install.sql`)), candidate.sqlHash);
  if (mode === 'rehearse' || mode === 'apply') {
    assert.deepEqual(state(), candidate.before);
    assert.deepEqual(await pages(), candidate.pages);
    if (mode === 'apply') {
      assert.equal((await read('rehearsed')).sqlHash, candidate.sqlHash);
      await assert.rejects(
        access(`${root}/apply-started.json`),
        'Existing attempt must be inspected, not retried',
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
      console.log('Rehearsal rolled back; existing contracts and disabled state preserved.');
      process.exit(0);
    }
  }
  const after = state();
  assert.equal(after.fingerprint, candidate.before.fingerprint);
  assert.equal(after.installed, true);
  assert.equal(after.role_exists, true);
  const check = query(
    `begin read only;set local statement_timeout='4s';select jsonb_build_object('enabled',(select enabled from portal_identity_private.employee_rpc_settings where singleton),'contacts',(select count(*) from portal_identity_private.employee_contacts),'employee_sessions_enabled',(select enabled from employee_session_private.settings where singleton),'login_role_exists',exists(select 1 from pg_roles where rolname='doji_employee_portal_login')) state;rollback;`,
  )[0].state;
  assert.deepEqual(check, {
    enabled: false,
    contacts: 0,
    employee_sessions_enabled: false,
    login_role_exists: false,
  });
  assert.deepEqual(await pages(), candidate.pages);
  await save('verified-' + Date.now(), {
    at: new Date().toISOString(),
    after,
    check,
    sqlHash: candidate.sqlHash,
    loginCutover: false,
  });
  console.log(
    'Employee bridge installed DISABLED; shared contracts and all live portal deployments unchanged.',
  );
}
