// Owner-approved, one-additional-account / two-hour business admission window.
// No schema, provider, member, employee, email policy or counter resets.
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { cli, cf, hash, inventory } from './prepare-safety-launch.mts';
import { database, pages } from './business-disabled-release-reads.mts';
import { fingerprint, windowGuard } from './business-bridge-release-guards.mts';
const root = resolve(import.meta.dirname, '..');
const [mode, input] = process.argv.slice(2);
assert.ok(['prepare', 'rehearse', 'activate', 'verify', 'freeze'].includes(mode ?? ''));
const query = (q: string) =>
  cli<{ rows: Record<string, any>[] }>([
    'db',
    'query',
    q,
    '--linked',
    '--workdir',
    'D:/ChallengeApp/DoIt',
    '--output-format',
    'json',
  ]).rows;
const stateSQL = `select jsonb_build_object(
 'session',(select to_jsonb(s) from business_session_private.settings s where singleton),
 'enrollment',(select to_jsonb(s) from portal_identity_private.business_enrollment_settings s where singleton))`;
const readState = () =>
  query(`begin read only;set local statement_timeout='5s';${stateSQL} state;rollback;`)[0]!.state;
const jsonSQL = (v: unknown) => `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`;
const folder =
  mode === 'prepare'
    ? await mkdtemp(join(root, 'test-results/react-business-migration-'))
    : resolve(root, input!);
assert.match(
  folder.replaceAll('\\', '/'),
  /\/test-results\/react-business-migration-[A-Za-z0-9]+$/,
);
const save = (name: string, data: unknown) =>
  writeFile(join(folder, `${name}.json`), JSON.stringify(data, null, 2), { flag: 'wx' });
const read = async (name: string) =>
  JSON.parse(await readFile(join(folder, `${name}.json`), 'utf8'));
if (mode === 'prepare') {
  const before = await pages();
  assert.equal(
    (before['doji-business'] as { id: string }).id,
    '36a323ad-2955-4c12-a7d3-d17694cf37ba',
  );
  const previous = join(root, 'test-results/react-business-migration-k7dAwl/site');
  const source = await readFile(
    join(previous, 'react-business/20261010a/release-config.js'),
    'utf8',
  );
  assert.ok(source.includes('2026-10-07T23:59:59.000Z'));
  const prior = readState();
  assert.equal(prior.session.enabled, true);
  assert.equal(prior.enrollment.enabled, true);
  assert.ok(Date.parse(prior.session.registration_until) < Date.now());
  assert.ok(Date.parse(prior.enrollment.admission_until) < Date.now());
  assert.equal(prior.session.registrations_used, 1);
  assert.equal(prior.enrollment.accounts_used, 1);
  const db = database();
  assert.equal(db.event_window, false);
  assert.equal(db.overdue_sample, 0);
  const until = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const planned = structuredClone(prior);
  Object.assign(planned.session, {
    registration_enabled: true,
    registration_until: until,
    registration_limit: prior.session.registrations_used + 1,
  });
  Object.assign(planned.enrollment, {
    admission_until: until,
    account_limit: prior.enrollment.accounts_used + 1,
  });
  const configHashes: Record<string, string> = {};
  for (const name of Object.keys(before))
    configHashes[name] = hash(
      JSON.stringify(
        (await cf<{ deployment_configs: unknown }>(`/pages/projects/${name}`)).deployment_configs,
      ),
    );
  const site = join(folder, 'site');
  await cp(previous, site, { recursive: true, errorOnExist: true });
  await writeFile(
    join(site, 'react-business/20261010a/release-config.js'),
    `window.DOJI_REACT_BUSINESS_CONFIG = Object.freeze(${JSON.stringify({ registrationUntil: until })});\n`,
  );
  const baseline = await inventory(previous),
    assets = await inventory(site);
  assert.deepEqual(
    assets.filter((a, i) => a.sha256 !== baseline[i]?.sha256).map((a) => a.path),
    ['react-business/20261010a/release-config.js'],
  );
  const signature = query(
    `begin read only;set local statement_timeout='5s';${fingerprint} value;rollback;`,
  )[0]!.value;
  await save('admission-before', {
    at: new Date().toISOString(),
    prior,
    planned,
    until,
    db,
    signature,
  });
  await save('prepared', {
    at: new Date().toISOString(),
    kind: 'business',
    project: 'doji-business',
    before,
    previous,
    expected: '36a323ad-2955-4c12-a7d3-d17694cf37ba',
    configHashes,
    baseline,
    assets,
    registration: {
      registration_enabled: true,
      registration_until: until.replace('.000Z', '+00:00').replace('Z', '+00:00'),
      registration_limit: planned.session.registration_limit,
      registrations_used: prior.session.registrations_used,
    },
    deploymentReady: false,
  });
  console.log(JSON.stringify({ folder, until, additionalRegistrations: 1, sharedWrites: false }));
} else {
  const capture = await read('admission-before');
  const prepared = await read('prepared');
  const { prior, planned, until, signature } = capture;
  assert.equal(planned.session.registration_limit, prior.session.registrations_used + 1);
  assert.equal(planned.enrollment.account_limit, prior.enrollment.accounts_used + 1);
  const protectedCheck = () => {
    const db = database();
    for (const key of ['contracts', 'policies', 'roles'])
      assert.equal(db[key], capture.db[key], key);
    assert.equal(
      query(`begin read only;set local statement_timeout='5s';${fingerprint} value;rollback;`)[0]!
        .value,
      signature,
    );
  };
  protectedCheck();
  const invariant = `do $$begin if (${fingerprint}) is distinct from '${signature}' then raise exception 'Protected contracts/settings changed';end if;end$$;`;
  const start = `begin;set local lock_timeout='2s';set local statement_timeout='8s';
    select singleton from business_session_private.settings where singleton for update;
    select singleton from portal_identity_private.business_enrollment_settings where singleton for update;`;
  const checks = `do $$begin ${windowGuard}
    if (${stateSQL}) is distinct from ${jsonSQL(prior)} then raise exception 'Admission baseline changed';end if;
    if clock_timestamp()>='${until}'::timestamptz - interval '15 minutes' then raise exception 'Window too short: prepare again';end if;end$$;`;
  const changes = `update business_session_private.settings set registration_enabled=true,registration_until='${until}',registration_limit=${planned.session.registration_limit} where singleton;
    update portal_identity_private.business_enrollment_settings set admission_until='${until}',account_limit=${planned.enrollment.account_limit} where singleton;`;
  const restore = `update business_session_private.settings set registration_enabled=${prior.session.registration_enabled},registration_until='${prior.session.registration_until}',registration_limit=${prior.session.registration_limit} where singleton;
    update portal_identity_private.business_enrollment_settings set admission_until='${prior.enrollment.admission_until}',account_limit=${prior.enrollment.account_limit} where singleton;`;
  const freezeGuard = `do $$begin
    if not exists(select 1 from business_session_private.settings where singleton and generation='${prior.session.generation}'::uuid and registration_until='${until}'::timestamptz and registration_limit=${planned.session.registration_limit})
      or not exists(select 1 from portal_identity_private.business_enrollment_settings where singleton and admission_until='${until}'::timestamptz and account_limit=${planned.enrollment.account_limit})
      then raise exception 'Newer admission policy; do not overwrite';end if;end$$;`;
  if (mode === 'rehearse') {
    assert.deepEqual(await pages(), prepared.before);
    const a = randomBytes(32).toString('hex'),
      b = randomBytes(32).toString('hex'),
      c = randomBytes(32).toString('hex');
    const exercise = `do $$begin
      if business_session_private.reserve_registration('${'0'.repeat(64)}','${a}','${b}') then raise exception 'Wrong scope accepted';end if;
      if not business_session_private.reserve_registration('${prior.session.scope_hash}','${a}','${b}') then raise exception 'Approved slot denied';end if;
      if not business_session_private.reserve_registration('${prior.session.scope_hash}','${a}','${b}') then raise exception 'Replay denied';end if;
      if business_session_private.reserve_registration('${prior.session.scope_hash}','${a}','${c}') then raise exception 'Changed replay accepted';end if;
      if business_session_private.reserve_registration('${prior.session.scope_hash}','${c}','${b}') then raise exception 'Additional slot accepted';end if;
      if (select registrations_used from business_session_private.settings where singleton)<>${planned.session.registration_limit} then raise exception 'Counter mismatch';end if;
      update business_session_private.settings set registration_until=clock_timestamp()-interval '1 second' where singleton;
      if business_session_private.reserve_registration('${prior.session.scope_hash}','${a}','${b}') then raise exception 'Expired admission accepted';end if;
    end$$;`;
    query(start + checks + invariant + changes + exercise + invariant + 'rollback;');
    assert.deepEqual(readState(), prior);
    // Rehearse retaining rollback without changing counters or existing accounts.
    query(
      start +
        checks +
        changes +
        freezeGuard +
        restore +
        invariant +
        `do $$begin if (${stateSQL}) is distinct from ${jsonSQL(prior)} then raise exception 'Rollback mismatch';end if;end$$;rollback;`,
    );
    assert.deepEqual(readState(), prior);
    protectedCheck();
    await save('admission-rehearsed', {
      at: new Date().toISOString(),
      wrongScopeDenied: true,
      oneSlot: true,
      replay: true,
      changedReplayDenied: true,
      excessDenied: true,
      expiryDenied: true,
      rollbackExact: true,
      persistentWrites: false,
    });
    console.log(
      'Admission scope/cap/replay/expiry and exact rollback rehearsals passed; no persistent records.',
    );
  } else if (mode === 'activate') {
    await read('admission-rehearsed');
    const qualified = await read('qualified');
    assert.equal(
      qualified.packageHash,
      hash(JSON.stringify(await inventory(join(folder, 'site')))),
    );
    assert.deepEqual(await pages(), prepared.before);
    for (const name of Object.keys(prepared.before))
      assert.equal(
        hash(
          JSON.stringify(
            (await cf<{ deployment_configs: unknown }>(`/pages/projects/${name}`))
              .deployment_configs,
          ),
        ),
        prepared.configHashes[name],
      );
    await writeFile(
      join(folder, 'freeze-admission.sql'),
      start + freezeGuard + restore + invariant + 'commit;',
      { flag: 'wx' },
    );
    await save('admission-activation-started', {
      at: new Date().toISOString(),
      until,
      oneAdditionalAccount: true,
    });
    query(start + checks + invariant + changes + invariant + 'commit;');
    const now = readState();
    assert.equal(Date.parse(now.session.registration_until), Date.parse(until));
    assert.equal(Date.parse(now.enrollment.admission_until), Date.parse(until));
    assert.equal(now.session.registrations_used, prior.session.registrations_used);
    assert.equal(now.enrollment.accounts_used, prior.enrollment.accounts_used);
    assert.equal(now.session.registration_limit, planned.session.registration_limit);
    assert.equal(now.enrollment.account_limit, planned.enrollment.account_limit);
    protectedCheck();
    // Align the SQL timestamp serialization only; asset hashes remain untouched.
    prepared.registration.registration_until = now.session.registration_until;
    await writeFile(join(folder, 'prepared.json'), JSON.stringify(prepared, null, 2));
    await save('admission-activated', {
      at: new Date().toISOString(),
      state: now,
      memberEmployeeContractsUnchanged: true,
    });
    console.log(JSON.stringify({ open: true, until, additionalRegistrations: 1 }));
  } else if (mode === 'freeze') {
    await read('admission-activated');
    query(await readFile(join(folder, 'freeze-admission.sql'), 'utf8'));
    protectedCheck();
    await save('admission-frozen', {
      at: new Date().toISOString(),
      state: readState(),
      countersPreserved: true,
    });
    console.log('Admission closed with the prior expired policy; counters/accounts retained.');
  } else {
    await read('admission-activated');
    const now = readState();
    assert.equal(Date.parse(now.session.registration_until), Date.parse(until));
    assert.equal(Date.parse(now.enrollment.admission_until), Date.parse(until));
    assert.equal(now.session.registration_limit, planned.session.registration_limit);
    assert.equal(now.enrollment.account_limit, planned.enrollment.account_limit);
    assert.ok(
      now.session.registrations_used >= prior.session.registrations_used &&
        now.session.registrations_used <= planned.session.registration_limit,
    );
    assert.ok(
      now.enrollment.accounts_used >= prior.enrollment.accounts_used &&
        now.enrollment.accounts_used <= planned.enrollment.account_limit,
    );
    await save('admission-verified', {
      at: new Date().toISOString(),
      state: now,
      memberEmployeeContractsUnchanged: true,
    });
    console.log(
      JSON.stringify({
        until,
        remainingRegistrations: planned.session.registration_limit - now.session.registrations_used,
        remainingAccounts: planned.enrollment.account_limit - now.enrollment.accounts_used,
      }),
    );
  }
}
