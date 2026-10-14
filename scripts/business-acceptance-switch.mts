// Owner-approved exact-alias acceptance only. No public signup or member writes.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, cp, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import type * as Pg from 'pg';
import { cli, cf, ref, account, hash, inventory } from './prepare-safety-launch.mts';
import {
  functions,
  secrets,
  pages,
  database,
  linkedWorkspace,
} from './business-disabled-release-reads.mts';
import { evidenceRecord, evidenceRows, evidenceArray } from './release-evidence.mts';

const root = 'test-results/business-owned-switch-20261011';
const secure = '.artifacts/business-recovery-acceptance-20261011';
const candidate = 'test-results/business-owned-candidate-AH5Z8a';
const source = 'test-results/business-owned-pages-1eMwaE';
const mode = process.argv[2];
assert.equal(process.argv.length, 3);
assert.ok(mode && ['prepare', 'rehearse', 'pause', 'qualify-pause', 'cutover', 'enable', 'verify', 'stop'].includes(mode));
const read = async (name: string) =>
  evidenceRecord(JSON.parse(await readFile(`${root}/${name}.json`, 'utf8')));
const save = (name: string, value: unknown) =>
  writeFile(`${root}/${name}.json`, JSON.stringify(value, null, 2), { flag: 'wx' });
const query = (sql: string) =>
  evidenceRows(
    cli(['db', 'query', sql, '--linked', '--workdir', linkedWorkspace, '--output-format', 'json']),
  );
const config = evidenceRecord(JSON.parse(await readFile(`${secure}/runtime-staged.json`, 'utf8')));
const owned = evidenceRecord(config.ownedAuth);
const scope = createHash('sha256').update(`${config.origin}|${config.clientId}`).digest('hex');
assert.equal(config.origin, 'https://business.dojipro.com');
assert.equal(config.clientId, 'client_01M3T51363MDZZK6X8DB7NS32N');
const stateSql = `select jsonb_build_object(
 'session',(select to_jsonb(s) from business_session_private.settings s where singleton),
 'enrollment',(select to_jsonb(s) from portal_identity_private.business_enrollment_settings s where singleton),
 'guard',(select to_jsonb(s) from business_session_private.owned_auth_settings s where singleton),
 'acceptance',(select to_jsonb(s) from business_session_private.owned_auth_acceptance s where singleton),
 'mail',(select to_jsonb(s) from business_session_private.owned_auth_mail_settings s where singleton)) state`;
const state = () =>
  evidenceRecord(
    query(`begin read only;set local statement_timeout='3s';${stateSql};rollback;`)[0]?.state,
  );
const jsonSql = (v: unknown) => `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`;
const guardSql = `do $$begin
 if not pg_try_advisory_xact_lock(hashtextextended('doji-business-owned-auth-v1',0)) then raise exception 'Concurrent business release';end if;
 if exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '25 minutes' and fires_at+interval '15 minutes'>clock_timestamp() limit 1)
 or exists(select 1 from public.domain_event_outbox where published_at is null and available_at<clock_timestamp()-interval '60 seconds' limit 1) then raise exception 'Protected delivery window';end if;
end$$;`;
const cutoverSql = `revoke execute on function business_session_private.put_bound_session(text,text,text,integer,text,text,text,text),business_session_private.execute_store(text,text,text,text,text,integer,text,text),business_session_private.admit_owned_auth_v1(text,text,text,text,text) from doji_business_session;`;
const noLegacySql = `do $$begin
 if has_function_privilege('doji_business_session','business_session_private.put_bound_session(text,text,text,integer,text,text,text,text)','execute')
 or has_function_privilege('doji_business_session','business_session_private.execute_store(text,text,text,text,text,integer,text,text)','execute')
 or has_function_privilege('doji_business_session','business_session_private.admit_owned_auth_v1(text,text,text,text,text)','execute') then raise exception 'Legacy or unrestricted installer reachable';end if;
end$$;`;
const prepared = evidenceRecord(JSON.parse(await readFile(`${source}/prepared.json`, 'utf8')));
assert.deepEqual(await inventory(`${source}/site`), prepared.assets);
const manifest = evidenceRecord(JSON.parse(await readFile(`${candidate}/manifest.json`, 'utf8')));
for (const [path, expected] of Object.entries(evidenceRecord(manifest.files))) {
  assert.match(path, /^[A-Za-z0-9_./-]+$/);
  assert.ok(!path.startsWith('/') && !path.split('/').includes('..'));
  assert.equal(hash(await readFile(`${candidate}/${path}`)), expected, path);
}
// Runtime and proxy source must match the already-qualified disabled deployment.
const deployedManifest = evidenceRecord(
  JSON.parse(await readFile('test-results/business-owned-candidate-UbWsa8/manifest.json', 'utf8')),
);
for (const [path, value] of Object.entries(evidenceRecord(manifest.files)))
  if (path.startsWith('edge/') || path.startsWith('pages-components/'))
    assert.equal(value, evidenceRecord(deployedManifest.files)[path], path);

async function protectedChecks() {
  const baseline = await read('baseline');
  const db = database(),
    priorDb = evidenceRecord(baseline.database);
  if (mode !== 'stop') {
    assert.equal(db.event_window, false);
    assert.equal(db.overdue_sample, 0);
  }
  for (const k of ['contracts', 'policies', 'roles']) assert.equal(db[k], priorDb[k], k);
  const currentPages = await pages(),
    priorPages = evidenceRecord(baseline.pages);
  for (const name of ['doji-admin', 'doji-site'])
    assert.deepEqual(currentPages[name], priorPages[name]);
  const currentFns = functions();
  const refreshes = await read('secret-refreshes').catch(() => ({ count: 0 }));
  assert.ok(Number.isInteger(refreshes.count) && Number(refreshes.count) >= 0);
  for (const old of evidenceArray(baseline.functions))
    if (old.slug !== 'business-portal-v2')
      assert.deepEqual(
        currentFns.find((f) => f.id === old.id),
        { ...old, version: Number(old.version) + Number(refreshes.count) },
      );
  assert.equal(currentFns.length, evidenceArray(baseline.functions).length);
  const currentSecrets = secrets();
  const allowed = [
    'BUSINESS_V2_CONFIG',
    'BUSINESS_OWNED_AUTH_ENABLED',
    'BUSINESS_AUTH_MAINTENANCE',
  ];
  const before = evidenceArray(baseline.secrets).filter((s) => !allowed.includes(String(s.name)));
  const after = currentSecrets.filter((s) => !allowed.includes(String(s.name)));
  assert.equal(before.length, after.length);
  for (const old of before) {
    const current = after.find((s) => s.name === old.name);
    assert.ok(current);
    assert.equal(current.value, old.value);
  }
  assert.deepEqual(
    state().session,
    evidenceRecord(baseline.state).session,
    'Public signup settings/counters changed',
  );
}
async function runtime(maintenance: boolean, sending: boolean, expires = 0) {
  const next = {
    ...config,
    signupEnabled: false,
    ownedAuth: {
      ...owned,
      enabled: true,
      sendingEnabled: sending,
      recoveryEmail: {
        ...evidenceRecord(owned.recoveryEmail),
        enabled: sending,
        workosDefaultEmailDisabled: sending,
        trackingDisabled: sending,
        capacityApprovedUntil: expires,
      },
    },
  };
  const path = `${secure}/switch-runtime-${maintenance ? 'pause' : 'acceptance'}-${Date.now()}.env`;
  await writeFile(
    path,
    `BUSINESS_V2_CONFIG=${JSON.stringify(next)}\nBUSINESS_OWNED_AUTH_ENABLED=true\nBUSINESS_AUTH_MAINTENANCE=${maintenance}\n`,
    { flag: 'wx', mode: 0o600 },
  );
  const beforeRefreshAll = functions();
  const beforeRefresh = beforeRefreshAll.filter(f => f.slug !== 'business-portal-v2');
  cli(['secrets', 'set', '--env-file', resolve(path), '--project-ref', ref], false);
  // Supabase refreshes every Edge deployment generation when project secrets change.
  // Verify only that generation advanced once: code hashes, JWT policy, timestamps,
  // paths and all other metadata must remain byte-for-byte identical.
  const afterRefresh = functions();
  for (const old of beforeRefresh)
    assert.deepEqual(afterRefresh.find(f => f.id === old.id), {...old, version:Number(old.version)+1});
  const refreshes = await read('secret-refreshes').catch(() => ({count:0}));
  await writeFile(`${root}/secret-refreshes.json`, JSON.stringify({count:Number(refreshes.count)+1,at:new Date().toISOString(),unchangedCodeAndMetadata:true}));
  const edge = `${root}/edge`;
  if (maintenance && mode !== 'stop') {
    await cp(`${candidate}/edge`, edge, { recursive: true, errorOnExist: true });
    await writeFile(
      `${edge}/supabase/config.toml`,
      'project_id="business-acceptance"\n[functions.business-portal-v2]\nverify_jwt=false\nimport_map="./functions/business-portal-v2/deno.json"\n',
      { flag: 'wx' },
    );
  }
  if (mode === 'stop') {
    // A retaining stop changes gates, never downgrades a newer qualified runtime.
    // In particular, signed reset recovery must retain the Buffer compatibility fix.
    const priorBusiness = beforeRefreshAll.find(f => f.slug === 'business-portal-v2');
    assert.ok(priorBusiness);
    assert.deepEqual(afterRefresh.find(f => f.id === priorBusiness.id), {
      ...priorBusiness, version: Number(priorBusiness.version) + 1,
    });
  } else cli(
    [
      'functions',
      'deploy',
      'business-portal-v2',
      '--project-ref',
      ref,
      '--use-api',
      '--workdir',
      resolve(edge),
    ],
    false,
  );
  const installed = secrets();
  assert.equal(
    installed.find((s) => s.name === 'BUSINESS_V2_CONFIG')?.value,
    hash(JSON.stringify(next)),
  );
  assert.equal(
    installed.find((s) => s.name === 'BUSINESS_AUTH_MAINTENANCE')?.value,
    hash(String(maintenance)),
  );
  assert.equal(
    installed.find((s) => s.name === 'BUSINESS_OWNED_AUTH_ENABLED')?.value,
    hash('true'),
  );
}
async function publish(maintenance: boolean, until?: string, label = maintenance ? 'paused' : 'acceptance') {
  const baseline = await read('baseline');
  const p = evidenceRecord(await cf('/pages/projects/doji-business'));
  const settings = evidenceRecord(p.deployment_configs),
    production = evidenceRecord(settings.production);
  const privateBefore = evidenceRecord(
    JSON.parse(await readFile(`${secure}/pages-switch-before.json`, 'utf8')),
  );
  const priorSettings = evidenceRecord(privateBefore.deployment_configs);
  assert.deepEqual(settings.preview, priorSettings.preview);
  const env = evidenceRecord(production.env_vars);
  const nextEnv = {
    ...env,
    BUSINESS_V2_PROXY_KEY: { type: 'secret_text', value: config.proxyKey },
    BUSINESS_OWNED_AUTH_ENABLED: { type: 'plain_text', value: 'true' },
    BUSINESS_AUTH_MAINTENANCE: { type: 'plain_text', value: String(maintenance) },
  };
  await cf('/pages/projects/doji-business', {
    method: 'PATCH',
    body: JSON.stringify({ deployment_configs: { production: { env_vars: nextEnv } } }),
  });
  const site = `${root}/${label}`;
  await cp(`${source}/site`, site, { recursive: true, errorOnExist: true });
  const releaseConfig = {
    ...evidenceRecord(prepared.config),
    ownedAuthEnabled: true,
    maintenanceEnabled: maintenance,
    ...(until ? { acceptanceUntil: until } : {}),
  };
  await writeFile(
    `${site}/react-business/owned-20261010/release-config.js`,
    `window.DOJI_REACT_BUSINESS_CONFIG = Object.freeze(${JSON.stringify(releaseConfig)});\n`,
  );
  try {
    execFileSync(
      process.execPath,
      [
        'infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js',
        'pages',
        'deploy',
        resolve(site),
        '--project-name',
        'doji-business',
        '--branch',
        'main',
        '--commit-dirty=true',
        '--commit-message',
        maintenance
          ? 'Business access controlled maintenance'
          : 'Business exact-identity acceptance',
      ],
      {
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 180000,
        maxBuffer: 4e6,
      },
    );
  } catch {
    throw Error('Pages deployment outcome uncertain; inspect before retry');
  }
  const after = await pages();
  assert.notEqual(
    evidenceRecord(after['doji-business']).id,
    evidenceRecord(evidenceRecord(baseline.pages)['doji-business']).id,
  );
  const expectedConfig = await readFile(`${site}/react-business/owned-20261010/release-config.js`, 'utf8');
  let propagated = false;
  const propagationDeadline = AbortSignal.timeout(45000);
  // Bounded deploy-time verification only; never shipped as portal polling.
  for (let attempt=0;attempt<8;attempt++) {
    const r = await fetch(`${config.origin}/react-business/owned-20261010/release-config.js`, {
      cache: 'no-store', signal: AbortSignal.any([propagationDeadline,AbortSignal.timeout(10000)]),
    });
    propagated = r.status === 200 && await r.text() === expectedConfig;
    if (propagated) break;
    if (attempt<7) await delay(3000,undefined,{signal:propagationDeadline});
  }
  assert.equal(propagated,true,'Public release configuration not yet propagated; inspect without redeploying');
  await save(`pages-${label}`, {
    at: new Date().toISOString(),
    deployment: after['doji-business'],
    assets: await inventory(site),
    releaseConfig,
  });
}
async function boundary(path: string, expected: number) {
  const r = await fetch(`${config.origin}${path}`, {
    headers: { origin: String(config.origin) },
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  });
  await r.body?.cancel();
  assert.equal(r.status, expected, path);
}

async function receiverBoundary() {
  const r = await fetch(`${config.origin}/auth/owned/reset-events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  });
  await r.body?.cancel();
  assert.equal(r.status, 401, 'Unsigned reset evidence must reach the signature verifier and be denied');
}

async function restrictedGrantCheck() {
  const pg: typeof Pg = createRequire(import.meta.url)('../infra/portal-identity/node_modules/pg/lib/index.js');
  const db=evidenceRecord(config.database);
  assert.ok(typeof db.host==='string' && /^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(db.host));
  assert.equal(db.username,`doji_business_portal_login.${ref}`);
  assert.equal(db.port,6543);assert.equal(db.database,'postgres');
  assert.ok(typeof db.password==='string' && db.password.length>=32);
  assert.ok(db.ca===undefined || typeof db.ca==='string');
  const client=new pg.Client({host:db.host,port:6543,database:'postgres',user:String(db.username),password:db.password,
    ssl:{rejectUnauthorized:true,...(db.ca?{ca:db.ca}:{})},connectionTimeoutMillis:3000,statement_timeout:3000,
    application_name:'doji-business-acceptance-read'});
  try {
    await client.connect();await client.query('begin read only; set local role doji_business_session');
    const result=await client.query(`select current_user::text role,
      has_function_privilege(current_user,'business_session_private.execute_store(text,text,text,text,text,integer,text,text)','execute') legacy,
      has_function_privilege(current_user,'business_session_private.put_bound_session(text,text,text,integer,text,text,text,text)','execute') installer,
      has_function_privilege(current_user,'business_session_private.admit_owned_auth_v1(text,text,text,text,text)','execute') unrestricted,
      has_function_privilege(current_user,'business_session_private.admit_owned_acceptance_v1(text,text,text,text,text)','execute') acceptance`);
    assert.deepEqual(result.rows,[{role:'doji_business_session',legacy:false,installer:false,unrestricted:false,acceptance:true}]);
    await client.query('rollback');
  } catch { throw Error('Actual business connection grant check failed; remain paused'); }
  finally {await client.end().catch(()=>{});}
}

if (mode === 'prepare') {
  await mkdir(root);
  const baseline = {
    at: new Date().toISOString(),
    database: database(),
    functions: functions(),
    secrets: secrets(),
    pages: await pages(),
    state: state(),
    stagedConfigHash: hash(await readFile(`${secure}/runtime-staged.json`)),
  };
  assert.equal(baseline.database.event_window, false);
  assert.equal(baseline.database.overdue_sample, 0);
  assert.equal(evidenceRecord(baseline.state.guard).enabled, false);
  assert.equal(evidenceRecord(baseline.state.acceptance).enabled, false);
  assert.equal(evidenceRecord(baseline.state.acceptance).reserved_at, null);
  assert.equal(evidenceRecord(baseline.state.mail).enabled_until, null);
  assert.equal(evidenceRecord(baseline.state.session).scope_hash, scope);
  assert.ok(
    Date.parse(String(evidenceRecord(baseline.state.session).registration_until)) < Date.now(),
  );
  assert.ok(
    Date.parse(String(evidenceRecord(baseline.state.enrollment).admission_until)) < Date.now(),
  );
  await writeFile(
    `${secure}/pages-switch-before.json`,
    JSON.stringify(await cf('/pages/projects/doji-business')),
    { flag: 'wx', mode: 0o600 },
  );
  await save('baseline', baseline);
  await save('package', { source, candidate, assets: prepared.assets, files: manifest.files });
  console.log(
    'Fresh switch baseline captured. No maintenance, sending, or acceptance window enabled.',
  );
} else {
  const baseline = await read('baseline');
  assert.equal(baseline.stagedConfigHash, hash(await readFile(`${secure}/runtime-staged.json`)));
  await protectedChecks();
  if (mode === 'rehearse') {
    const before = baseline.state;
    const allowed = randomBytes(32).toString('hex'),
      other = randomBytes(32).toString('hex'),
      attempt = randomBytes(32).toString('hex');
    const sql = `begin;set local lock_timeout='2s';set local statement_timeout='8s';${guardSql}
  do $$begin if (${stateSql.replace('select ', '').replace(/ state$/, '')}) is distinct from ${jsonSql(before)} then raise exception 'Baseline changed';end if;end$$;
  ${cutoverSql}${noLegacySql}
  update business_session_private.owned_auth_settings set enabled=true,scope_hash='${scope}',epoch=epoch+1 where singleton;
  update business_session_private.owned_auth_acceptance set enabled=true,scope_hash='${scope}',identity_hmac='${allowed}',started_at=clock_timestamp(),expires_at=clock_timestamp()+interval '1 hour' where singleton;
  -- The managed deployment login cannot SET ROLE to the restricted business role.
  -- Check its exact grants without broadening membership; SECURITY DEFINER commands
  -- use identical internal role semantics for this rolled-back behavior rehearsal.
  do $$begin if not has_function_privilege('doji_business_session','business_session_private.admit_owned_acceptance_v1(text,text,text,text,text)','execute')
   or not has_function_privilege('doji_business_session','business_session_private.reserve_owned_acceptance_v1(text,text,text,text)','execute') then raise exception 'Acceptance grant missing';end if;end$$;
  do $$begin
   if business_session_private.admit_owned_acceptance_v1('${scope}','register','${attempt}','${other}','${other}')->>'state'<>'denied' then raise exception 'Wrong identity admitted';end if;
   if business_session_private.admit_owned_acceptance_v1('${scope}','register','${attempt}','${allowed}','${other}')->>'state'<>'allowed' then raise exception 'Test identity denied';end if;
   if not business_session_private.reserve_owned_acceptance_v1('${scope}','${allowed}','${attempt}','${other}') then raise exception 'Test slot unavailable';end if;
   if business_session_private.reserve_owned_acceptance_v1('${scope}','${allowed}','${attempt}','${other}') then raise exception 'Duplicate slot';end if;
  end$$;rollback;`;
    try {
      const output = execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'db', 'query', sql, '--linked', '--workdir', linkedWorkspace, '--output-format', 'json'], {encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:90000});
      evidenceRows(JSON.parse(output.slice(output.indexOf('{'))));
    } catch (error) {
      const result = error as { stdout?: string; stderr?: string };
      const diagnostic = `${result.stdout || ''}\n${result.stderr || ''}`;
      await writeFile(`${secure}/rehearsal-failure-${Date.now()}.txt`, diagnostic, {flag:'wx',mode:0o600});
      const safe = diagnostic.split('\n').filter(line => /ERROR:|error:|SQLSTATE|permission denied|syntax error|FAIL:/.test(line)).map(line => line.replace(/[a-f0-9]{32,}/gi,'[digest]')).join('\n').slice(0,800);
      throw Error(safe || 'Rehearsal failed; protected diagnostic captured');
    }
    assert.deepEqual(state(), before);
    await protectedChecks();
    await save('rehearsed', {
      at: new Date().toISOString(),
      rolledBack: true,
      exactIdentity: true,
      legacyDenied: true,
      singleSlot: true,
    });
    console.log('Acceptance grant/identity/slot rehearsal passed and rolled back.');
  } else if (mode === 'pause') {
    await read('rehearsed');
    await assert.rejects(access(`${root}/pause-started.json`), 'Inspect earlier attempt');
    assert.deepEqual(await pages(), baseline.pages);
    assert.deepEqual(state(), baseline.state);
    await save('pause-started', { at: new Date().toISOString() });
    await runtime(true, false);
    await publish(true);
    await boundary('/api/session', 503);
    await boundary('/auth/owned/bootstrap', 503);
    await receiverBoundary();
    await protectedChecks();
    await save('paused', { at: new Date().toISOString(), sending: false });
    console.log('Business-only maintenance verified at runtime and Pages; sending remains off.');
  } else if (mode === 'cutover') {
    await read('paused');
    await boundary('/api/session', 503);
    await boundary('/auth/owned/bootstrap', 503);
    await assert.rejects(access(`${root}/cutover-started.json`), 'Inspect earlier attempt');
    await save('cutover-started', { at: new Date().toISOString() });
    query(
      `begin;set local lock_timeout='2s';set local statement_timeout='8s';${guardSql}${cutoverSql}${noLegacySql}commit;`,
    );
    const drained = query(
      "begin read only;set local statement_timeout='3s';select count(*)::integer remaining from pg_stat_activity where pid<>pg_backend_pid() and (application_name='doji-business-portal' or usename='doji_business_portal_login') and (state='active' or xact_start is not null);rollback;",
    )[0];
    assert.equal(
      drained?.remaining,
      0,
      'Business transactions remain: stay paused, do not kill shared sessions',
    );
    await restrictedGrantCheck();
    await protectedChecks();
    await save('cutover', {
      at: new Date().toISOString(),
      legacyDenied: true,
      businessTransactions: 0,
    });
    console.log('Legacy business installers revoked; no active business transactions remain.');
  } else if (mode === 'qualify-pause') {
    // Read-only recovery after a successful upload outpaced custom-domain propagation.
    await read('pause-started');
    assert.deepEqual(state(), baseline.state);
    const site = `${root}/paused`;
    const expected = await readFile(`${site}/react-business/owned-20261010/release-config.js`, 'utf8');
    const r = await fetch(`${config.origin}/react-business/owned-20261010/release-config.js`, {
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    assert.equal(r.status, 200);
    assert.equal(await r.text(), expected);
    await boundary('/api/session',503);
    await boundary('/auth/owned/bootstrap',503);
    await receiverBoundary();
    await protectedChecks();
    const after = await pages();
    await save('pages-paused',{at:new Date().toISOString(),deployment:after['doji-business'],assets:await inventory(site),releaseConfig:{...evidenceRecord(prepared.config),ownedAuthEnabled:true,maintenanceEnabled:true}});
    await save('paused',{at:new Date().toISOString(),sending:false,propagationQualified:true});
    console.log('Public business maintenance and unsigned webhook rejection verified after propagation.');
  } else if (mode === 'enable') {
    await read('cutover');
    const provider = await read('provider-ready');
    assert.equal(provider.environment, 'environment_01M3T5131BPKBR7F6P2MAG6SBJ');
    assert.equal(provider.defaultResetEmailDisabled, true);
    assert.equal(provider.webhookEnabled, true);
    assert.equal(provider.resetUrl, `${config.origin}/business-portal/access/?mode=reset`);
    assert.equal(provider.trackingConfigured, false);
    assert.equal(provider.tls, 'Enforced');
    assert.ok(Date.now() - Date.parse(String(provider.at)) < 3600000);
    const qualified = await read('browser-qualified');
    assert.equal(qualified.package, `${source}/site`);
    assert.equal(qualified.passed, 22);
    assert.equal(qualified.failed, 0);
    assert.equal(qualified.skipped, 0);
    await assert.rejects(access(`${root}/enable-started.json`), 'Inspect earlier attempt');
    await boundary('/api/session', 503);
    const alias = (await readFile(`${secure}/acceptance-email.txt`, 'utf8')).trim();
    assert.match(alias, /^[^\s<>@]+\+doji-business-test@gmail\.com$/);
    const identity = createHmac('sha256', Buffer.from(String(owned.admissionHmacKey), 'hex'))
      .update(`${scope}|identity|${alias}`)
      .digest('hex');
    const current = state(),
      enrollment = evidenceRecord(current.enrollment),
      limit = Number(enrollment.accounts_used) + 1;
    assert.deepEqual(current.enrollment, evidenceRecord(baseline.state).enrollment);
    assert.ok(Number.isInteger(limit) && limit <= 100);
    assert.equal(evidenceRecord(current.acceptance).reserved_at, null);
    const until = new Date(Date.now() + 7200000).toISOString();
    await save('enable-started', {
      at: new Date().toISOString(),
      until,
      maximumEmails: 5,
      additionalAccounts: 1,
    });
    query(`begin;set local lock_timeout='2s';set local statement_timeout='8s';${guardSql}${noLegacySql}
  update business_session_private.owned_auth_settings set enabled=true,scope_hash='${scope}',epoch=epoch+1 where singleton and not enabled;
  update business_session_private.owned_auth_acceptance set enabled=true,scope_hash='${scope}',identity_hmac='${identity}',started_at=clock_timestamp(),expires_at='${until}' where singleton and not enabled and reserved_at is null;
  update portal_identity_private.business_enrollment_settings set admission_until='${until}',account_limit=${limit} where singleton and enabled and accounts_used=${limit - 1};
  update business_session_private.owned_auth_mail_settings set enabled_until='${until}' where singleton;
  do $$begin
   if not exists(select 1 from business_session_private.owned_auth_settings where singleton and enabled and scope_hash='${scope}')
   or not exists(select 1 from business_session_private.owned_auth_acceptance where singleton and enabled and scope_hash='${scope}' and identity_hmac='${identity}' and expires_at='${until}'::timestamptz and reserved_at is null)
   or not exists(select 1 from portal_identity_private.business_enrollment_settings where singleton and enabled and admission_until='${until}'::timestamptz and account_limit=${limit} and accounts_used=${limit-1})
   or not exists(select 1 from business_session_private.owned_auth_mail_settings where singleton and enabled_until='${until}'::timestamptz)
   then raise exception 'Acceptance bounds were not installed';end if;
  end$$;
  commit;`);
    await runtime(false, true, Date.parse(until));
    await publish(false, until);
    await boundary('/auth/owned/bootstrap', 200);
    await boundary('/api/session', 401);
    await boundary('/auth/callback', 404);
    await protectedChecks();
    await save('enabled', { at: new Date().toISOString(), until, publicSignup: false });
    console.log(
      JSON.stringify({
        acceptanceEnabled: true,
        until,
        publicSignup: false,
        emailsSentByRelease: 0,
      }),
    );
  } else if (mode === 'stop') {
    await read('paused');
    const previousEnrollment=evidenceRecord(evidenceRecord(baseline.state).enrollment);
    const oldUntil=String(previousEnrollment.admission_until);
    assert.ok(Number.isFinite(Date.parse(oldUntil)) && Date.parse(oldUntil)<Date.now());
    query(`begin;set local lock_timeout='2s';set local statement_timeout='8s';
      update business_session_private.owned_auth_acceptance set enabled=false where singleton;
      update business_session_private.owned_auth_mail_settings set enabled_until=null where singleton;
      update portal_identity_private.business_enrollment_settings set admission_until='${new Date(oldUntil).toISOString()}' where singleton;
      commit;`);
    await runtime(true,false);await publish(true,undefined,`stopped-${Date.now()}`);
    await boundary('/api/session',503);
    await save(`stopped-${Date.now()}`,{at:new Date().toISOString(),ownedModeRetained:true,receiptsFencesKeysRetained:true,sending:false});
    console.log('Business acceptance stopped; signed reset reconciliation, keys and fences retained.');
  } else {
    await read('enabled');
    await boundary('/auth/owned/bootstrap', 200);
    await protectedChecks();
    console.log('Business acceptance boundaries verified. No email or account mutation issued.');
  }
}
