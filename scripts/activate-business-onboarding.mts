// Owner-approved business-only activation. No schema, member or employee writes.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { cli, hash } from './prepare-safety-launch.mts';
import { database, pages, health, linkedWorkspace } from './business-disabled-release-reads.mts';
import { fingerprint, windowGuard } from './business-bridge-release-guards.mts';
import { evidenceRecord, evidenceRows } from './release-evidence.mts';
const root = 'test-results/business-onboarding-activation-20261005';
const client = 'client_01M3T51363MDZZK6X8DB7NS32N';
const issuer = `https://api.workos.com/user_management/${client}`;
const scope = hash(`https://business.dojipro.com|${client}`);
const until = '2026-10-07T23:59:59Z';
const mode = process.argv[2];
assert.ok(mode && ['prepare', 'rehearse', 'activate', 'verify'].includes(mode));
const save = (name: string, value: unknown) =>
  writeFile(`${root}/${name}.json`, JSON.stringify(value, null, 2), { flag: 'wx' });
const read = async (name: string) =>
  evidenceRecord(JSON.parse(await readFile(`${root}/${name}.json`, 'utf8')));
const quote = (v: unknown) => `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`;
function sql(query: string) {
  return evidenceRows(
    cli([
      'db',
      'query',
      query,
      '--linked',
      '--workdir',
      linkedWorkspace,
      '--output-format',
      'json',
    ]),
  );
}
const settings = [
  ['session', 'business_session_private.settings'],
  ['enrollment', 'portal_identity_private.business_enrollment_settings'],
  ['reads', 'portal_identity_private.business_read_settings'],
  ['commands', 'portal_identity_private.business_command_settings'],
  ['privacy', 'portal_identity_private.business_privacy_settings'],
] as const;
const state = `select jsonb_build_object(
 ${settings.map(([key, table]) => `'${key}',(select to_jsonb(s) from ${table} s where singleton)`).join(',')},
 'realm',(select to_jsonb(r) from portal_identity_private.realms r where realm='business'),
 'accounts',(select count(*) from (select 1 from business_private.accounts limit 11) a),
 'principals',(select count(*) from (select 1 from portal_identity_private.principals where realm='business' limit 11) p)
 )`;
const readState = () =>
  evidenceRecord(
    sql(`begin read only;set local statement_timeout='5s';${state} as state;rollback;`)[0]?.state,
  );
function closed(s: Record<string, unknown>) {
  assert.equal(s.realm, null);
  assert.equal(s.accounts, 0);
  assert.equal(s.principals, 0);
  for (const [key] of settings) assert.equal(evidenceRecord(s[key]).enabled, false, key);
  assert.equal(evidenceRecord(s.session).registration_enabled, false);
  assert.equal(evidenceRecord(s.session).registrations_used, 0);
  assert.equal(evidenceRecord(s.enrollment).accounts_used, 0);
}
function opened(s: Record<string, unknown>) {
  for (const [key] of settings) assert.equal(evidenceRecord(s[key]).enabled, true, key);
  assert.deepEqual(s.realm, { realm: 'business', enabled: true, issuer, audience: client });
  const session = evidenceRecord(s.session),
    enrollment = evidenceRecord(s.enrollment);
  assert.equal(session.scope_hash, scope);
  assert.equal(session.registration_enabled, true);
  assert.equal(session.registration_limit, 10);
  assert.equal(enrollment.account_limit, 10);
  assert.equal(Date.parse(String(session.registration_until)), Date.parse(until));
  assert.equal(Date.parse(String(enrollment.admission_until)), Date.parse(until));
  assert.ok(Number(session.registrations_used) <= 10 && Number(enrollment.accounts_used) <= 10);
}
await mkdir(root, { recursive: true });
if (mode === 'prepare') {
  const provider = evidenceRecord(
    JSON.parse(
      await readFile('test-results/business-v2-runtime-20261005/workos-provider-test.json', 'utf8'),
    ),
  );
  assert.equal(provider.providerGeneratedRequest, true);
  assert.equal(provider.result, 'Succeeded');
  assert.equal(provider.clientId, client);
  const s = readState();
  closed(s);
  const db = database();
  assert.equal(db.event_window, false);
  assert.equal(db.overdue_sample, 0);
  const before = {
    at: new Date().toISOString(),
    state: s,
    database: db,
    pages: await pages(),
    fingerprint: sql(`${fingerprint} as value`)[0]?.value,
  };
  await save('before', before);
  console.log(JSON.stringify({ state: s, prepared: true }));
} else {
  const before = await read('before');
  const unchanged = async () => {
    assert.deepEqual(await pages(), before.pages);
    const now = database(),
      old = evidenceRecord(before.database);
    for (const key of ['contracts', 'policies', 'roles']) assert.equal(now[key], old[key], key);
    assert.equal(sql(`${fingerprint} as value`)[0]?.value, before.fingerprint);
  };
  await unchanged();
  if (mode !== 'verify') {
    const prior = evidenceRecord(before.state);
    closed(readState());
    const checks = `do $$begin
      ${windowGuard}
      if (${state}) is distinct from ${quote(prior)} then raise exception 'Business activation state changed'; end if;
      if (${fingerprint}) is distinct from '${String(before.fingerprint)}' then raise exception 'Existing contracts changed'; end if;
      if not (select enabled and not realtime_enabled from business_private.settings where singleton)
        then raise exception 'Existing business feature state changed'; end if;
      if clock_timestamp()>='${until}'::timestamptz then raise exception 'Admission period expired';end if;
    end$$;`;
    const change = `insert into portal_identity_private.realms(realm,enabled,issuer,audience)
       values('business',true,'${issuer}','${client}');
      update business_session_private.settings set enabled=true,scope_hash='${scope}',
       registration_enabled=true,registration_until='${until}',registration_limit=10 where singleton;
      update portal_identity_private.business_enrollment_settings set enabled=true,
       admission_until='${until}',account_limit=10 where singleton;
      update portal_identity_private.business_read_settings set enabled=true where singleton;
      update portal_identity_private.business_command_settings set enabled=true where singleton;
      update portal_identity_private.business_privacy_settings set enabled=true where singleton;`;
    const invariant = `do $$begin if (${fingerprint}) is distinct from '${String(before.fingerprint)}'
      then raise exception 'Unrelated settings/contracts changed';end if;end$$;`;
    const activation = `begin;set local lock_timeout='2s';set local statement_timeout='8s';
      ${settings.map(([, table]) => `select singleton from ${table} where singleton for update;`).join('\n')}
      ${checks}${change}${invariant}${state} as state;`;
    if (mode === 'rehearse') {
      const a = 'a'.repeat(64),
        b = 'b'.repeat(64),
        c = 'c'.repeat(64);
      const exercise = `do $$begin
        if business_session_private.reserve_registration('${a}','${a}','${b}') then raise exception 'Wrong scope accepted';end if;
        if not business_session_private.reserve_registration('${scope}','${a}','${b}') then raise exception 'Admission failed';end if;
        if not business_session_private.reserve_registration('${scope}','${a}','${b}') then raise exception 'Replay failed';end if;
        if business_session_private.reserve_registration('${scope}','${a}','${c}') then raise exception 'Changed replay accepted';end if;
        if (select registrations_used from business_session_private.settings where singleton)<>1 then raise exception 'Admission counter incorrect';end if;
      end$$;`;
      const result = sql(activation + exercise + 'rollback;');
      opened(evidenceRecord(result.find((r) => r.state)?.state));
      assert.deepEqual(readState(), prior);
      await unchanged();
      await save('rehearsed', {
        at: new Date().toISOString(),
        admission: true,
        replay: true,
        wrongScopeDenied: true,
        rollbackExact: true,
      });
      console.log(
        'Business activation/replay/denial rehearsal passed; exact disabled state restored.',
      );
    } else {
      await read('rehearsed');
      await save('activation-started', { at: new Date().toISOString() });
      // Preserve accounts, receipts and consumed caps on freeze; never reset counters.
      const freeze = `begin;set local lock_timeout='2s';set local statement_timeout='8s';
        do $$begin if not exists(select 1 from portal_identity_private.realms where realm='business'
          and issuer='${issuer}' and audience='${client}') then raise exception 'Directory drift';end if;
          if not exists(select 1 from business_session_private.settings where singleton and scope_hash='${scope}'
            and generation='${String(evidenceRecord(prior.session).generation)}'::uuid and registration_limit=10
            and registration_until='${until}'::timestamptz) then raise exception 'Newer policy; review freeze';end if;end$$;
        update portal_identity_private.realms set enabled=false where realm='business';
        update business_session_private.settings set enabled=false,registration_enabled=false where singleton;
        ${settings
          .filter(([key]) => key !== 'session')
          .map(([, table]) => `update ${table} set enabled=false where singleton;`)
          .join('\n')}
        commit;`;
      await writeFile(`${root}/freeze-business-only.sql`, freeze, { flag: 'wx' });
      const result = sql(activation + 'commit;');
      opened(evidenceRecord(result.find((r) => r.state)?.state));
      await save('activated', { at: new Date().toISOString(), state: readState() });
      console.log('Business-only activation committed; limits retained; no accounts created.');
    }
  } else {
    await read('activated');
    const s = readState();
    opened(s);
    await save('verified', {
      at: new Date().toISOString(),
      state: s,
      health: await health(),
      pages: await pages(),
      memberEmployeeContractsUnchanged: true,
    });
    console.log(
      'Live business gates verified; member/employee contracts and other deployments unchanged.',
    );
  }
}
