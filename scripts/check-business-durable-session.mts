// Focused release check of the NEW durable adapter, not a broad regression run.
// Uses only a disposable database in the existing network-disabled local container.
import { execFile, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createBusinessSessionStore } from '../infra/portal-identity-candidate/business-session-store.mts';
import { createBusinessHttp } from '../infra/portal-identity-candidate/business-http.mts';
import { createBusinessRegistrationAction } from '../infra/portal-identity-candidate/business-registration-action.mts';
import { createHmac } from 'node:crypto';
import { engine as podman, container } from './database/owned-target.mts';
import { offlineContainer } from './database/contracts.mts';
import { present, testRecord } from './employee-test-fixtures.mts';
import type { BusinessStoreConfig } from '../infra/portal-identity-candidate/business-session-store.mts';
import type { BusinessHttpDependencies } from '../infra/portal-identity-candidate/business-http-contracts.mts';
const inspected = offlineContainer(
  JSON.parse(execFileSync(podman, ['inspect', container], { encoding: 'utf8' })),
);
assert.equal(inspected.HostConfig.NetworkMode, 'none');
assert.equal(Object.keys(inspected.HostConfig.PortBindings || {}).length, 0);
const db = `business_session_qa_${Date.now()}`;
assert.match(db, /^business_session_qa_[0-9]+$/);
const args = (database: string) => [
  'exec',
  '-i',
  container,
  'psql',
  '-X',
  '-qAt',
  '-U',
  'postgres',
  '-d',
  database,
  '-v',
  'ON_ERROR_STOP=1',
];
const sync = (sql: string, database = db) =>
  execFileSync(podman, args(database), {
    input: sql,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
const sqlString = (value: string | number | null) =>
  value === null
    ? 'null'
    : typeof value === 'number'
      ? String(value)
      : "'" + value.replaceAll("'", "''") + "'";
const execute = (
  role: 'doji_business_session' | 'doji_business_registration',
  sql: string,
  params: (string | number | null)[],
  signal: AbortSignal,
): Promise<unknown> => {
  assert.ok(['doji_business_session', 'doji_business_registration'].includes(role));
  assert.equal(
    sql,
    role === 'doji_business_session'
      ? 'select business_session_private.execute_store($1,$2,$3,$4,$5,$6::integer,$7,$8) as result'
      : 'select business_session_private.reserve_registration($1,$2,$3) as result',
  );
  signal?.throwIfAborted();
  // Test-only psql transport. Production must use a restricted parameterized driver.
  return new Promise((resolve, reject) => {
    const child = execFile(
      podman,
      args(db),
      { encoding: 'utf8', signal, timeout: 6000 },
      (error, stdout, stderr) => {
        if (error) {
          console.error('Synthetic SQL diagnostic:', stderr.trim());
          reject(Error('Local session SQL failed'));
        } else {
          try {
            resolve(JSON.parse(stdout.trim()));
          } catch {
            reject(Error('Invalid local result'));
          }
        }
      },
    );
    present(child.stdin ?? undefined).end(
      "begin;set local statement_timeout='3s';set local lock_timeout='1s';set local role " +
        role +
        ';select to_json(result) from (' +
        sql.replace(/\$(\d+)/g, (_: string, n: string) =>
          sqlString(present(params[Number(n) - 1])),
        ) +
        ') as checked;commit;',
    );
  });
};
const cfg: BusinessStoreConfig = {
  enabled: true,
  realm: 'business',
  origin: 'https://business.test',
  clientId: 'client_business',
};
const scope = createHash('sha256').update(`${cfg.origin}|${cfg.clientId}`).digest('hex');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const envelope = 'A'.repeat(64),
  changed = 'B'.repeat(64);
let created = false,
  roleCreated = false,
  registrationRoleCreated = false,
  checks = 0;
const pass = (message: string) => {
  checks++;
  console.log('PASS: ' + message);
};
try {
  assert.equal(
    sync(
      "select count(*) from pg_roles where rolname in('doji_business_session','doji_business_registration');select count(*) from vault.secrets;select count(*) from auth.users where email is null or email not like '%@test.invalid';",
      'postgres',
    ),
    '0\n0\n0',
  );
  // Private session/registration tables have no dependency on member schemas.
  // Keep the member baseline in postgres and verify it without cloning workers.
  sync(`create database ${db} template template0;`, 'postgres');
  created = true;
  const fingerprintSql =
    "select md5(string_agg(p.oid::text||pg_get_functiondef(p.oid)||coalesce(p.proacl::text,''),'' order by p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','auth','business_private') and p.prokind='f';";
  const before = sync(fingerprintSql, 'postgres');
  sync(readFileSync('docs/drafts/business_session_store_v1.sql', 'utf8'));
  roleCreated = true;
  sync('grant doji_business_session to postgres;'); // Local harness only; removed with this run's role.
  const store = createBusinessSessionStore(cfg, execute);
  await assert.rejects(store.putFlow(hash('disabled'), envelope, Date.now() + 5000));
  pass('store defaults off');
  sync(`update business_session_private.settings set enabled=true,scope_hash='${scope}';`);
  await assert.rejects(
    createBusinessSessionStore({ ...cfg, clientId: 'client_other' }, execute).putFlow(
      hash('wrong-scope'),
      envelope,
      Date.now() + 5000,
    ),
  );
  pass('other origin or client scope cannot use store');
  await store.putFlow(hash('flow'), envelope, Date.now() + 300000);
  assert.equal(await store.consumeFlow(hash('flow'), () => false), null);
  const consumed = await Promise.all([
    store.consumeFlow(hash('flow'), () => true),
    store.consumeFlow(hash('flow'), () => true),
  ]);
  assert.equal(consumed.filter(Boolean).length, 1);
  pass('wrong binding preserves flow and concurrent consume has one winner');
  await store.putSession(hash('restart'), envelope, Date.now() + 60000);
  const second = createBusinessSessionStore(cfg, execute);
  await second.withSession(hash('restart'), async (cell) => {
    assert.equal(cell.value, envelope);
  });
  pass('separate adapter instance reads persisted session');
  let release: () => void = () => assert.fail('Uninitialized lease release'),
    started: () => void = () => assert.fail('Uninitialized lease signal');
  const held = new Promise<void>((r) => {
    release = r;
  });
  const ready = new Promise<void>((r) => {
    started = r;
  });
  const first = store.withSession(hash('restart'), async (cell) => {
    started();
    await held;
    assert.notEqual(cell.value, null);
    if (cell.value === null) throw Error('Expected held session');
    await cell.replace(changed);
  });
  await ready;
  await assert.rejects(
    second.withSession(hash('restart'), () => assert.fail('must not enter')),
    { status: 409 },
  );
  assert.equal(
    sync(
      `select count(*) from pg_stat_activity where datname='${db}' and state='idle in transaction';`,
    ),
    '0',
  );
  release();
  await first;
  await second.withSession(hash('restart'), async (cell) => assert.equal(cell.value, changed));
  pass('concurrent instance is fenced without an open DB transaction');
  await assert.rejects(
    store.withSession(hash('restart'), () => {
      throw Object.assign(Error('stale'), { status: 409 });
    }),
    { status: 409 },
  );
  await second.withSession(hash('restart'), async (cell) => assert.equal(cell.value, changed));
  pass('ordinary stale-record rejection preserves the login');
  await store.withSession(hash('restart'), async (cell) => {
    assert.notEqual(cell.value, null);
    if (cell.value === null) throw Error('Expected held session');
    await cell.remove();
    await assert.rejects(cell.replace(envelope));
  });
  await second.withSession(hash('restart'), async (cell) => assert.equal(cell.value, null));
  pass('logout persists and cannot be undone by a late replace');
  await store.putSession(hash('crash'), envelope, Date.now() + 60000);
  sync(
    `update business_session_private.records set lease_hash='${hash('crashed-owner')}',lease_until=clock_timestamp()-interval '1 second' where key_hash='${hash('crash')}';`,
  );
  await second.withSession(hash('crash'), async (cell) => assert.equal(cell.value, null));
  pass('expired crash lease requires sign-in rather than refresh takeover');
  await store.putFlow(hash('expired'), envelope, Date.now() + 5000);
  sync(
    `update business_session_private.records set expires_at=clock_timestamp()-interval '1 second' where key_hash='${hash('expired')}';`,
  );
  assert.equal(await store.consumeFlow(hash('expired'), () => true), null);
  pass('server expiry denies and removes old flow');
  sync('update business_session_private.settings set flow_limit=1;');
  await store.putFlow(hash('capacity'), envelope, Date.now() + 5000);
  await assert.rejects(store.putFlow(hash('overflow'), envelope, Date.now() + 5000), {
    status: 429,
  });
  sync('update business_session_private.settings set flow_limit=100;');
  pass('durable capacity is enforced');
  assert.equal(
    sync(
      "select has_schema_privilege('authenticated','business_session_private','usage');select has_table_privilege('doji_business_session','business_session_private.records','select,insert,update,delete');select has_function_privilege('authenticated','business_session_private.execute_store(text,text,text,text,text,integer,text,text)','execute');select pg_has_role('authenticator','doji_business_session','member');",
    ),
    'f\nf\nf\nf',
  );
  pass('no member API, table access or authenticator membership');

  const actor = {
    realm: 'business',
    audience: cfg.clientId,
    issuer: `https://api.workos.com/user_management/${cfg.clientId}`,
    subject: 'user_synthetic',
    sessionId: 'session_synthetic',
    expiresAtSeconds: Date.now() / 1000 + 600,
    mfaVerified: false,
  };
  const provider: BusinessHttpDependencies['provider'] = {
    authorizationUrl: (fields) =>
      'https://api.workos.com/user_management/authorize?' +
      new URLSearchParams(Object.entries(fields).map(([key, value]) => [key, String(value)])),
    exchange: async () => ({
      subject: actor.subject,
      accessToken: 'synthetic-access',
      refreshToken: 'synthetic-refresh',
    }),
    revoke: async () => {},
    refresh: async () => assert.fail('Unexpected refresh in callback/restore test'),
  };
  const application: BusinessHttpDependencies['application'] = {
    authorize: async () => {},
    read: async () => ({ id: 'synthetic', state: 'draft', revision: 1, details: {} }),
    command: async () => assert.fail('Unexpected business write in session test'),
    enroll: async () => assert.fail('Unexpected enrollment in restore test'),
  };
  const handler = () =>
    createBusinessHttp(
      {
        ...cfg,
        encryptionKey: 'ab'.repeat(32),
        signupEnabled: false,
        termsVersion: 'synthetic-v1',
        privacyVersion: 'synthetic-v1',
      },
      {
        store: createBusinessSessionStore(cfg, execute),
        provider,
        application,
        verify: async () => actor,
        admission: async () => true,
      },
    );
  const request = (
    h: ReturnType<typeof handler>,
    path: string,
    {
      cookie = '',
      method = 'GET',
      body,
      csrf,
    }: { cookie?: string; method?: string; body?: unknown; csrf?: string } = {},
  ) =>
    h(
      new Request(cfg.origin + path, {
        method,
        headers: {
          origin: cfg.origin,
          cookie,
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(csrf ? { 'x-doji-csrf': csrf } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
  const h1 = handler();
  const start = await request(h1, '/auth/start', { method: 'POST', body: { signup: false } });
  assert.equal(start.status, 200);
  const startData = testRecord(await start.json());
  assert.equal(typeof startData.authorizationUrl, 'string');
  const state = new URL(String(startData.authorizationUrl)).searchParams.get('state');
  const callback = await request(
    handler(),
    '/auth/callback?state=' + state + '&code=synthetic_code',
    { cookie: present(start.headers.getSetCookie()[0]).split(';')[0] },
  );
  assert.equal(callback.status, 303);
  const cookie = present(
    callback.headers.getSetCookie().find((x) => x.startsWith('__Host-doji_business=')),
  ).split(';')[0];
  const session = await request(handler(), '/api/session', { cookie });
  assert.equal(session.status, 200);
  const sessionData = testRecord(await session.json());
  assert.equal(typeof sessionData.csrf, 'string');
  const csrf = String(sessionData.csrf);
  const logout = await request(handler(), '/auth/logout', {
    cookie,
    method: 'POST',
    body: {},
    csrf,
  });
  assert.equal(logout.status, 200);
  assert.equal((await request(handler(), '/api/session', { cookie })).status, 401);
  pass('HTTP login callback, restore and logout work across fresh handlers with durable state');

  sync(readFileSync('docs/drafts/business_registration_gate_v1.sql', 'utf8'));
  registrationRoleCreated = true;
  sync('grant doji_business_registration to postgres;');
  const actionSecret = 'synthetic-secret-never-used-with-provider';
  const signer = (text: string, secret = actionSecret) =>
    createHmac('sha256', secret).update(text).digest('hex');
  const registration = createBusinessRegistrationAction({ ...cfg, actionSecret }, execute);
  const sendAction = async (
    id: string,
    options: { email?: string; offset?: number; secret?: string } = {},
  ) => {
    const raw = JSON.stringify({
      id,
      object: 'user_registration_action_context',
      user_data: { object: 'user_data', email: options.email || 'synthetic@doji-isolation.test' },
    });
    const timestamp = Date.now() + (options.offset || 0);
    return registration(
      new Request(cfg.origin + '/auth/workos-registration', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'workos-signature': `t=${timestamp},v1=${signer(`${timestamp}.${raw}`, options.secret)}`,
        },
        body: raw,
      }),
    );
  };
  const payload = async (response: Response) =>
    testRecord(testRecord(await response.json()).payload);
  assert.equal((await payload(await sendAction('action_closed'))).verdict, 'Deny');
  sync(
    "update business_session_private.settings set registration_enabled=true,registration_limit=1,registration_until=clock_timestamp()+interval '1 hour';",
  );
  for (const options of [
    { secret: 'wrong-employee-directory-secret' },
    { offset: -31000 },
    { offset: 31000 },
  ])
    assert.equal((await sendAction('action_bad', options)).status, 401);
  assert.equal(sync('select registrations_used from business_session_private.settings;'), '0');
  pass(
    'registration denies disabled, wrong-secret and stale/future signed requests before reservation',
  );
  const actions = await Promise.all([sendAction('action_once'), sendAction('action_once')]);
  for (const response of actions) {
    const result = testRecord(await response.json());
    const signedPayload = testRecord(result.payload);
    assert.equal(signedPayload.verdict, 'Allow');
    assert.equal(
      result.signature,
      signer(`${signedPayload.timestamp}.${JSON.stringify(signedPayload)}`),
    );
  }
  assert.equal(sync('select registrations_used from business_session_private.settings;'), '1');
  pass('signed provider retries share one durable reservation and signed response');
  assert.equal(
    (await payload(await sendAction('action_once', { email: 'other@doji-isolation.test' })))
      .verdict,
    'Deny',
  );
  assert.equal((await payload(await sendAction('action_overflow'))).verdict, 'Deny');
  pass('changed payload replay and capacity overflow cannot register');
  assert.equal(
    sync(
      "select has_function_privilege('authenticated','business_session_private.reserve_registration(text,text,text)','execute');select has_function_privilege('doji_business_session','business_session_private.reserve_registration(text,text,text)','execute');select has_table_privilege('doji_business_registration','business_session_private.registration_receipts','select,insert,update,delete');",
    ),
    'f\nf\nf',
  );
  sync(readFileSync('docs/drafts/business_registration_gate_v1.rollback.sql', 'utf8'));
  assert.equal((await payload(await sendAction('action_once'))).verdict, 'Deny');
  assert.equal(sync('select registrations_used from business_session_private.settings;'), '1');
  pass('registration privilege boundary and rollback retain spent capacity');
  await store.putSession(hash('freeze'), envelope, Date.now() + 60000);
  sync(readFileSync('docs/drafts/business_session_store_v1.rollback.sql', 'utf8'));
  await assert.rejects(store.withSession(hash('freeze'), () => assert.fail('frozen')));
  sync(
    'update business_session_private.settings set enabled=true;grant execute on function business_session_private.execute_store(text,text,text,text,text,integer,text,text) to doji_business_session;',
  );
  await second.withSession(hash('freeze'), async (cell) => assert.equal(cell.value, null));
  assert.equal(sync(fingerprintSql, 'postgres'), before);
  pass('rollback invalidates prior sessions and existing function contracts remain unchanged');
  console.log(`${checks} focused durable-session checks passed; synthetic local database only.`);
} finally {
  if (created) {
    sync(`drop database ${db};`, 'postgres');
    console.log('Removed only this run’s temporary database; restored baseline retained.');
  }
  if (roleCreated) sync('drop role doji_business_session;', 'postgres');
  if (registrationRoleCreated) sync('drop role doji_business_registration;', 'postgres');
}
