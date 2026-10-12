// Owner-approved business recovery release. Staging modes never enable or send.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access, copyFile } from 'node:fs/promises';
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
import { evidenceRecord, evidenceRows, evidenceArray } from './release-evidence.mts';

const root = 'test-results/business-recovery-acceptance-20261011';
const secure = '.artifacts/business-recovery-acceptance-20261011';
const candidate = 'test-results/business-owned-candidate-UbWsa8';
const mode = process.argv[2];
assert.equal(process.argv.length, 3);
assert.ok(mode && ['capture', 'rehearse', 'install', 'runtime', 'verify'].includes(mode));
const read = async (name: string) =>
  evidenceRecord(JSON.parse(await readFile(`${root}/${name}.json`, 'utf8')));
const save = (name: string, value: unknown) =>
  writeFile(`${root}/${name}.json`, JSON.stringify(value, null, 2), { flag: 'wx' });
const query = (sql: string) =>
  evidenceRows(
    cli(['db', 'query', sql, '--linked', '--workdir', linkedWorkspace, '--output-format', 'json']),
  );
const manifest = evidenceRecord(JSON.parse(await readFile(`${candidate}/manifest.json`, 'utf8')));
for (const [path, expected] of Object.entries(evidenceRecord(manifest.files))) {
  assert.match(path, /^[a-zA-Z0-9_./-]+$/);
  assert.ok(!path.startsWith('/') && !path.split('/').includes('..'));
  assert.equal(hash(await readFile(`${candidate}/${path}`)), expected, path);
}
const draft = (
  await readFile('docs/drafts/business_owned_recovery_email_v1.sql', 'utf8')
).replaceAll('\r\n', '\n');
assert.equal(
  hash(draft),
  hash(
    (await readFile(`${candidate}/sql/business_owned_recovery_email_v1.sql`, 'utf8')).replaceAll(
      '\r\n',
      '\n',
    ),
  ),
);
const guard = `do $$begin
 if not pg_try_advisory_xact_lock(hashtextextended('doji-business-owned-auth-v1',0)) then raise exception 'Concurrent business release';end if;
 if exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '25 minutes' and fires_at+interval '15 minutes'>clock_timestamp() limit 1) then raise exception 'Event window';end if;
 if exists(select 1 from public.domain_event_outbox where published_at is null and available_at<clock_timestamp()-interval '60 seconds' limit 1) then raise exception 'Delivery backlog';end if;
 if exists(select 1 from business_session_private.owned_auth_settings where enabled)
 or exists(select 1 from business_session_private.owned_auth_acceptance where enabled or reserved_at is not null) then raise exception 'Owned auth must remain closed';end if;
end$$;`;
const snapshot = `create temp table recovery_functions_before as select oid,pg_get_functiondef(oid) definition,proacl from pg_proc where prokind='f';
 create temp table recovery_relations_before as select oid,relacl,relrowsecurity,relforcerowsecurity from pg_class where relkind in('r','p','v','m');
 create temp table recovery_policies_before as select md5(coalesce(jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname)::text,'')) fingerprint from pg_policies p;`;
const after = `do $$begin
 if exists(select 1 from recovery_functions_before b left join pg_proc p on p.oid=b.oid where p.oid is null or b.definition is distinct from pg_get_functiondef(p.oid) or b.proacl is distinct from p.proacl) then raise exception 'Existing function changed';end if;
 if exists(select 1 from recovery_relations_before b left join pg_class c on c.oid=b.oid where c.oid is null or (b.relacl,b.relrowsecurity,b.relforcerowsecurity) is distinct from (c.relacl,c.relrowsecurity,c.relforcerowsecurity)) then raise exception 'Existing relation changed';end if;
 if (select fingerprint from recovery_policies_before) is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname)::text,'')) from pg_policies p) then raise exception 'Existing policy changed';end if;
 if exists(select 1 from business_session_private.owned_auth_mail_settings where enabled_until is not null) then raise exception 'Mail unexpectedly enabled';end if;
 if exists(select 1 from pg_roles where rolname in('anon','authenticated','service_role','doji_employee','doji_business','doji_identity_resolver') and has_function_privilege(rolname,'business_session_private.reserve_owned_recovery_email_v1(text,text)','execute')) then raise exception 'Mail permission leaked';end if;
end$$;`;
const install = `begin;set local lock_timeout='2s';set local statement_timeout='8s';\n${guard}\n${snapshot}\n${draft.replace(/^begin;$|^commit;$/gm, '')}\n${after}\ncommit;\n`;

if (mode === 'capture') {
  const baseline = {
    at: new Date().toISOString(),
    functions: functions(),
    secrets: secrets(),
    pages: await pages(),
    database: database(),
    health: await health(),
  };
  assert.equal(baseline.database.event_window, false);
  assert.equal(baseline.database.overdue_sample, 0);
  assert.ok(
    !baseline.secrets.some((s) =>
      ['BUSINESS_OWNED_AUTH_ENABLED', 'BUSINESS_AUTH_MAINTENANCE'].includes(String(s.name)),
    ),
  );
  const prior = await readFile('.artifacts/business-runtime/runtime.json', 'utf8');
  assert.equal(hash(prior), baseline.secrets.find((s) => s.name === 'BUSINESS_V2_CONFIG')?.value);
  const state = query(
    "begin read only;set local statement_timeout='3s';select to_regclass('business_session_private.owned_auth_mail_settings') is null missing, (select enabled from business_session_private.owned_auth_settings where singleton) guard_enabled, (select enabled from business_session_private.owned_auth_acceptance where singleton) acceptance_enabled;rollback;",
  )[0];
  assert.deepEqual(state, { missing: true, guard_enabled: false, acceptance_enabled: false });
  await mkdir(root);
  await mkdir(secure);
  execFileSync('git', ['check-ignore', `${secure}/runtime-before.json`], { stdio: 'pipe' });
  const owner = execFileSync('whoami', [], { encoding: 'utf8' }).trim();
  execFileSync(
    'icacls',
    [secure, '/inheritance:r', '/grant:r', `${owner}:(OI)(CI)F`, 'SYSTEM:(OI)(CI)F'],
    { stdio: 'pipe' },
  );
  await writeFile(`${secure}/runtime-before.json`, prior, { flag: 'wx' });
  await writeFile(
    `${secure}/pages-before.json`,
    JSON.stringify(await cf('/pages/projects/doji-business')),
    { flag: 'wx' },
  );
  await copyFile(
    '.artifacts/business-owned-release-2995nX/reset-webhook-secret.txt',
    `${secure}/reset-webhook-secret.txt`,
  );
  await copyFile(
    '.artifacts/business-owned-release-2995nX/business-mail-key.txt',
    `${secure}/business-mail-key.txt`,
  );
  await mkdir(`${root}/edge-before`);
  cli(
    [
      'functions',
      'download',
      'business-portal-v2',
      '--project-ref',
      ref,
      '--use-api',
      '--workdir',
      resolve(root, 'edge-before'),
    ],
    false,
  );
  await save('baseline', baseline);
  await writeFile(`${root}/install.sql`, install, { flag: 'wx' });
  await writeFile(`${root}/rehearse.sql`, install.replace(/commit;\n$/, 'rollback;\n'), {
    flag: 'wx',
  });
  await copyFile(
    'docs/drafts/business_owned_recovery_email_v1.rollback.sql',
    `${root}/mail-stop.sql`,
  );
  await save('prepared', {
    at: new Date().toISOString(),
    secure,
    candidate,
    installHash: hash(install),
    draftHash: hash(draft),
    rollback: await inventory(`${root}/edge-before`),
    files: manifest.files,
  });
  console.log('Fresh production baseline and protected rollback captured; no production writes.');
} else {
  const baseline = await read('baseline'),
    prepared = await read('prepared');
  assert.equal(prepared.installHash, hash(install));
  assert.deepEqual(await inventory(`${root}/edge-before`), prepared.rollback);
  async function boundaries(runtimeChanged = false) {
    assert.deepEqual(await pages(), baseline.pages);
    const oldSecrets = evidenceArray(baseline.secrets),
      currentSecrets = secrets();
    assert.equal(oldSecrets.length, currentSecrets.length);
    for (const old of oldSecrets) {
      const next = currentSecrets.find((s) => s.name === old.name);
      assert.ok(next);
      assert.deepEqual(
        runtimeChanged && String(old.name).startsWith('SUPABASE_')
          ? { ...next, updated_at: old.updated_at }
          : next,
        old,
      );
    }
    const oldFns = evidenceArray(baseline.functions),
      currentFns = functions();
    assert.equal(oldFns.length, currentFns.length);
    for (const old of oldFns) {
      const next = currentFns.find((f) => f.id === old.id);
      assert.ok(next);
      if (runtimeChanged && old.slug === 'business-portal-v2') {
        assert.equal(next.version, Number(old.version) + 1);
        assert.equal(next.verify_jwt, old.verify_jwt);
        assert.equal(next.status, 'ACTIVE');
      } else assert.deepEqual(next, old);
    }
    const db = database(),
      oldDb = evidenceRecord(baseline.database);
    assert.equal(db.event_window, false);
    assert.equal(db.overdue_sample, 0);
    for (const key of ['contracts', 'policies', 'roles']) assert.equal(db[key], oldDb[key], key);
  }
  if (mode === 'rehearse' || mode === 'install') {
    await boundaries();
    await assert.rejects(
      access(`${root}/${mode}-started.json`),
      'Inspect prior attempt before retry',
    );
    if (mode === 'install') assert.equal((await read('rehearsed')).installHash, hash(install));
    await save(`${mode}-started`, { at: new Date().toISOString(), installHash: hash(install) });
    cli([
      'db',
      'query',
      '--file',
      resolve(root, mode === 'rehearse' ? 'rehearse.sql' : 'install.sql'),
      '--linked',
      '--workdir',
      linkedWorkspace,
      '--output-format',
      'json',
    ]);
    await boundaries();
    if (mode === 'rehearse') {
      assert.equal(
        query(
          "begin read only;select to_regclass('business_session_private.owned_auth_mail_settings') is null rolled_back;rollback;",
        )[0]?.rolled_back,
        true,
      );
      await save('rehearsed', { at: new Date().toISOString(), installHash: hash(install) });
    } else {
      assert.deepEqual(
        query(
          'begin read only;select enabled_until is null disabled,(select count(*) from business_session_private.owned_auth_mail_reservations)=0 empty from business_session_private.owned_auth_mail_settings where singleton;rollback;',
        )[0],
        { disabled: true, empty: true },
      );
      await save('installed', {
        at: new Date().toISOString(),
        installHash: hash(install),
        sendingEnabled: false,
        memberEmployeeContractsUnchanged: true,
      });
    }
    console.log(`${mode} passed; sending/auth gates remain off and existing contracts unchanged.`);
  } else {
    await read('installed');
    if (mode === 'runtime') {
      await boundaries();
      await assert.rejects(
        access(`${root}/runtime-started.json`),
        'Inspect prior attempt before retry',
      );
      await writeFile(
        `${candidate}/edge/supabase/config.toml`,
        'project_id="business-recovery-disabled"\n[functions.business-portal-v2]\nverify_jwt=false\nimport_map="./functions/business-portal-v2/deno.json"\n',
        { flag: 'wx' },
      );
      await save('runtime-started', { at: new Date().toISOString(), candidate });
      cli(
        [
          'functions',
          'deploy',
          'business-portal-v2',
          '--project-ref',
          ref,
          '--use-api',
          '--workdir',
          resolve(candidate, 'edge'),
        ],
        false,
      );
    }
    await boundaries(true);
    const downloaded = `${root}/runtime-verified-${Date.now()}`;
    await mkdir(downloaded);
    cli(
      [
        'functions',
        'download',
        'business-portal-v2',
        '--project-ref',
        ref,
        '--use-api',
        '--workdir',
        resolve(downloaded),
      ],
      false,
    );
    const found = await inventory(downloaded);
    let checked = 0;
    for (const path of Object.keys(evidenceRecord(manifest.files)).filter((p) =>
      p.startsWith('edge/supabase/functions/'),
    )) {
      const matches = found.filter((f) => f.path.endsWith('/' + path.split('/').at(-1)));
      assert.equal(matches.length, 1, path);
      assert.equal(
        hash(
          (await readFile(`${downloaded}/${matches[0]!.path}`, 'utf8')).replaceAll('\r\n', '\n'),
        ),
        hash((await readFile(`${candidate}/${path}`, 'utf8')).replaceAll('\r\n', '\n')),
        path,
      );
      checked++;
    }
    const config = evidenceRecord(
      JSON.parse(await readFile(`${secure}/runtime-before.json`, 'utf8')),
    );
    for (const [path, status] of [
      ['/api/session', 401],
      ['/auth/owned/bootstrap', 404],
    ] as const) {
      const r = await fetch(String(config.endpoint) + path, {
        headers: {
          origin: String(config.origin),
          'x-doji-portal-proxy-key': String(config.proxyKey),
          'x-doji-client-ip': '192.0.2.1',
        },
        signal: AbortSignal.timeout(15000),
        redirect: 'manual',
      });
      await r.body?.cancel();
      assert.equal(r.status, status, path);
    }
    await save(`runtime-qualified-${Date.now()}`, {
      at: new Date().toISOString(),
      checked,
      health: await health(),
      ownedMode: false,
      sending: false,
      unrelatedBoundariesUnchanged: true,
    });
    console.log(
      JSON.stringify({
        runtimeVerified: true,
        sourceFiles: checked,
        ownedMode: false,
        sending: false,
      }),
    );
  }
}
