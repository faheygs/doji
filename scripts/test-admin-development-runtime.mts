import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import {
  createDevelopmentGateway,
  createDevelopmentSql,
  createDevelopmentResources,
  developmentEndpoint,
  developmentSql,
} from '../infra/portal-identity/admin-development.mts';
import type { PortalSqlClient } from '../infra/portal-identity/restricted-sql.mts';
import type { DevelopmentInvoke } from '../infra/portal-identity/admin-development.mts';
import { createDevelopmentHealth } from '../infra/portal-identity/admin-development-health.mts';

const token = 'a'.repeat(43);
test('local health uses audited persona reads, exact staging scope and post-read revocation', async () => {
  const monitoring = {
    token: 'synthetic',
    environment: 'staging' as const,
    organization: 'doji-i0',
    projectIds: ['4512328707342336'],
    projectSlugs: ['doji-staging'],
  };
  let allowed = true,
    revokeDuringRead = false;
  const names: string[] = [];
  const upstream = async (url: string | URL | Request) => {
    assert.match(String(url), /environment=staging/);
    assert.match(String(url), /project=4512328707342336/);
    if (revokeDuringRead) allowed = false;
    return Response.json([]);
  };
  const invoke: DevelopmentInvoke = async (credential, input) => {
    assert.equal(credential, token);
    names.push(input.name);
    return {
      ok: true,
      result:
        input.name === 'get_admin_portal_session_v3'
          ? { capabilities: { operations_read: allowed } }
          : { enabled: true },
    };
  };
  const health = createDevelopmentHealth(invoke, monitoring, { upstream });
  const input = {
    persona: '98000000-0000-4000-8000-000000000001',
    name: 'portal_platform_health_v1',
    args: {},
    requestId: randomUUID(),
  };
  assert.equal(
    ((await health(token, input, AbortSignal.timeout(2000))) as { ok: boolean }).ok,
    true,
  );
  assert.ok(names.includes('get_admin_workflow_health_v1'));
  allowed = false;
  await assert.rejects(health(token, input, AbortSignal.timeout(2000)), { status: 403 });
  allowed = true;
  revokeDuringRead = true;
  await assert.rejects(
    createDevelopmentHealth(invoke, monitoring, { upstream })(
      token,
      input,
      AbortSignal.timeout(2000),
    ),
    { status: 403 },
  );
  for (const patch of [
    { environment: 'production' },
    { projectIds: ['4511550449647616'] },
    { organization: 'other' },
    { projectSlugs: ['react-native'] },
  ])
    assert.throws(() =>
      Reflect.apply(createDevelopmentHealth, undefined, [invoke, { ...monitoring, ...patch }]),
    );
  await assert.rejects(
    health(token, { ...input, args: { actor: 'other' } }, AbortSignal.timeout(2000)),
    { status: 400 },
  );
});
const persona = '98000000-0000-4000-8000-000000000001';
const call = { persona, name: 'get_admin_portal_session_v3', args: {}, requestId: randomUUID() };
const config = {
  host: 'aws-0-ca-central-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  projectRef: 'ohrcupagdoilkwhecict',
  username: 'doji_staging_development_login.ohrcupagdoilkwhecict',
  password: 'synthetic-only-'.repeat(4),
};
const request = (
  body: unknown = call,
  extra: Record<string, string> = {},
  url = developmentEndpoint,
) =>
  new Request(url, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', ...extra },
    body: JSON.stringify(body),
  });

test('development resources reuse permission checks and pin staging providers', async () => {
  const operations: string[] = [];
  const origin = 'https://ohrcupagdoilkwhecict.supabase.co';
  const keyName = 'eVKl2g.synthetic';
  let revoked = false,
    denied = false,
    signed = 0;
  const invoke: DevelopmentInvoke = async (credential, input) => {
    assert.equal(credential, token);
    assert.equal(input.persona, persona);
    assert.equal(input.requestId, call.requestId);
    operations.push(input.name);
    if (revoked) throw Object.assign(Error('revoked'), { status: 401 });
    if (denied) return { ok: false, code: '42501' };
    return {
      ok: true,
      result:
        input.name === 'get_admin_portal_session_v3'
          ? { user_id: persona, capabilities: { moderation_read: false } }
          : input.name === 'get_admin_staff_event_channels_v1'
            ? ['staff:workflow:ideas']
            : { bucket: input.args.p_bucket, path: input.args.p_path, expiresIn: 300 },
    };
  };
  const config = {
    storageOrigin: origin,
    realtimeKeyName: keyName,
    signStorage: async ({ bucket, path }: { bucket: string; path: string }) => {
      signed++;
      return `${origin}/storage/v1/object/sign/${bucket}/${path}?token=synthetic`;
    },
    signRealtime: async (grant: {
      clientId: string;
      ttl: number;
      capability: Record<string, string[]>;
    }) => {
      signed++;
      assert.equal(grant.clientId, persona);
      assert.equal(grant.ttl, 900000);
      assert.deepEqual(grant.capability, { 'staff:workflow:ideas': ['subscribe'] });
      return { keyName, ...grant };
    },
  };
  const resources = createDevelopmentResources(invoke, config);
  const signal = new AbortController().signal;
  const media = {
    ...call,
    name: 'portal_sign_evidence_v1',
    args: { bucket: 'post-media', path: 'synthetic.jpg' },
  };
  const realtime = { ...call, name: 'portal_realtime_token_v1' };
  assert.deepEqual(await resources(token, media, signal), {
    ok: true,
    result: {
      signedUrl: `${origin}/storage/v1/object/sign/post-media/synthetic.jpg?token=synthetic`,
      expiresIn: 300,
    },
  });
  assert.deepEqual(operations, ['portal_evidence_authorization_v1', 'get_admin_portal_session_v3']);
  operations.length = 0;
  await resources(token, realtime, signal);
  assert.deepEqual(operations, [
    'get_admin_portal_session_v3',
    'get_admin_staff_event_channels_v1',
    'get_admin_portal_session_v3',
  ]);
  assert.equal(signed, 2);
  const gateway = createDevelopmentGateway(resources);
  const channels = { ...call, name: 'get_admin_staff_event_channels_v1' };
  const listed = await gateway(request(channels));
  assert.equal(listed.status, 200);
  assert.deepEqual(await listed.json(), ['staff:workflow:ideas']);
  assert.equal(signed, 2);
  denied = true;
  assert.equal((await gateway(request(channels))).status, 403);
  for (const input of [media, realtime])
    await assert.rejects(resources(token, input, signal), { status: 403 });
  denied = false;
  for (const name of ['portal_evidence_authorization_v1', 'get_admin_realtime_token_capabilities'])
    await assert.rejects(resources(token, { ...call, name }, signal), { status: 403 });
  await assert.rejects(resources(token, { ...realtime, persona: null }, signal), { status: 403 });
  for (const path of ['../secret', 'a%2fb', 'a\\b', 'a?b'])
    await assert.rejects(
      resources(token, { ...media, args: { bucket: 'post-media', path } }, signal),
      { status: 400 },
    );
  assert.equal(signed, 2);
  await resources(token, call, signal);
  assert.throws(() =>
    createDevelopmentResources(invoke, {
      ...config,
      storageOrigin: 'https://tvixsmqxotuvyjqzmjla.supabase.co',
    }),
  );
  assert.throws(() =>
    createDevelopmentResources(invoke, { ...config, realtimeKeyName: 'BBDaog.synthetic' }),
  );
  const wrongKey = createDevelopmentResources(invoke, {
    ...config,
    signRealtime: async () => ({ keyName: 'BBDaog.synthetic' }),
  });
  await assert.rejects(wrongKey(token, realtime, signal), { status: 503 });
  const revokedWhileSigning = createDevelopmentResources(invoke, {
    ...config,
    signStorage: async () => {
      revoked = true;
      return `${origin}/storage/v1/object/sign/post-media/synthetic.jpg?token=synthetic`;
    },
  });
  await assert.rejects(revokedWhileSigning(token, media, signal), { status: 401 });
  revoked = false;
  const controller = new AbortController();
  const aborted = createDevelopmentResources(invoke, {
    ...config,
    signRealtime: async () => {
      controller.abort();
      return { keyName };
    },
  });
  await assert.rejects(aborted(token, realtime, controller.signal));
});
test('development ingress denies browser/prod/malformed requests before SQL', async () => {
  let calls = 0;
  const handler = createDevelopmentGateway(async () => {
    calls++;
    return { ok: true, result: { user_id: persona } };
  });
  for (const r of [
    request(call, { origin: 'http://127.0.0.1:4313' }),
    request(call, { cookie: 'x=y' }),
    request(call, { 'sec-fetch-site': 'same-origin' }),
    request(call, { authorization: '' }),
    request({ ...call, extra: true }),
    request(call, {}, developmentEndpoint.replace('ohrcupagdoilkwhecict', 'tvixsmqxotuvyjqzmjla')),
  ])
    assert.ok((await handler(r)).status >= 400);
  assert.equal(calls, 0);
  const ok = await handler(request());
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), null);
  assert.deepEqual(await ok.json(), { user_id: persona });
  assert.equal(calls, 1);
  assert.equal(
    (await handler(request(call, {}, 'http://ohrcupagdoilkwhecict.supabase.co/admin-development')))
      .status,
    200,
  );
});
test('gateway maps denials, hides raw errors and bounds concurrent SQL', async () => {
  for (const [code, status] of [
    ['42501', 403],
    ['22023', 400],
    ['PT409', 409],
    ['XX000', 503],
  ] as const) {
    const response = await createDevelopmentGateway(async () => ({ ok: false, code }))(request());
    assert.equal(response.status, status);
  }
  const failure = await createDevelopmentGateway(async () => {
    throw Error(token);
  })(request());
  assert.equal(failure.status, 503);
  assert.ok(!(await failure.text()).includes(token));
  let release!: (v: unknown) => void;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const handler = createDevelopmentGateway(async () => pending);
  const first = handler(request()),
    second = handler(request());
  assert.equal((await handler(request())).status, 503);
  release({ ok: true, result: {} });
  await Promise.all([first, second]);
});
test('restricted SQL verifies login, binds digest and closes once without retry', async () => {
  const queries: Parameters<PortalSqlClient['query']>[0][] = [];
  let ended = 0;
  const execute = createDevelopmentSql(config, (options) => {
    assert.deepEqual(options.ssl, { rejectUnauthorized: true });
    assert.equal(options.port, 6543);
    return {
      connect: async () => {},
      end: async () => {
        ended++;
      },
      query: async (input) => {
        queries.push(input);
        if (typeof input === 'string' && input.startsWith('select session_user'))
          return {
            rows: [
              {
                login: 'doji_staging_development_login',
                current_role: 'doji_staging_development_login',
                privileged: false,
                permitted: true,
              },
            ],
          };
        return { rows: [{ result: { ok: true, result: {} } }] };
      },
    };
  });
  await execute(token, call, new AbortController().signal);
  const query = queries.find((q) => typeof q !== 'string');
  assert.equal(typeof query, 'object');
  if (typeof query !== 'object') throw Error('Missing parameter query');
  assert.equal(query.text, developmentSql);
  assert.equal(query.values[0], createHash('sha256').update(token).digest('hex'));
  assert.ok(!JSON.stringify(queries).includes(token));
  assert.equal(queries.at(-1), 'commit');
  assert.equal(ended, 1);
  assert.throws(() =>
    createDevelopmentSql({ ...config, projectRef: 'tvixsmqxotuvyjqzmjla' }, () => {
      throw Error('Must not connect');
    }),
  );
});
test('incorrect SQL identity never invokes a command; aborted calls never connect', async () => {
  let invoked = 0,
    connected = 0,
    ended = 0;
  const execute = createDevelopmentSql(config, () => ({
    connect: async () => {
      connected++;
    },
    end: async () => {
      ended++;
    },
    query: async (input) => {
      if (typeof input !== 'string') invoked++;
      return { rows: [{ login: 'postgres', privileged: true }] };
    },
  }));
  await assert.rejects(execute(token, call, new AbortController().signal));
  assert.equal(invoked, 0);
  assert.equal(connected, 1);
  assert.equal(ended, 1);
  await assert.rejects(execute(token, call, AbortSignal.abort()));
  assert.equal(connected, 1);
});

test('malformed ingress and SQL results fail closed without leaking data', async () => {
  let calls = 0;
  const handler = createDevelopmentGateway(async () => {
    calls++;
    return { ok: true, result: {} };
  });
  const missingToken = request();
  missingToken.headers.delete('authorization');
  for (const invalid of [
    missingToken,
    request(call, { 'content-type': 'text/plain' }),
    request({ ...call, args: { oversized: 'x'.repeat(17000) } }),
    new Request(developmentEndpoint, { method: 'GET' }),
    new Request(developmentEndpoint, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: '{',
    }),
  ]) {
    const response = await handler(invalid);
    assert.ok(response.status >= 400);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(calls, 0);
  for (const result of [null, [], { ok: false }, { ok: false, code: 123 }])
    assert.equal((await createDevelopmentGateway(async () => result)(request())).status, 503);
  const directory = {
    developer: 'synthetic-developer',
    personas: [{ id: persona, label: 'Employee' }],
  };
  const response = await createDevelopmentGateway(async () => directory)(
    request({ ...call, name: 'personas', persona: null }),
  );
  assert.deepEqual(await response.json(), directory);
});

test('SQL configuration and input validation precede connections', async () => {
  for (const change of [
    { port: 5432 },
    { database: 'other' },
    { host: 'attacker.invalid' },
    { username: 'postgres' },
    { password: 'short' },
    { ca: 'invalid' },
  ])
    assert.throws(() => createDevelopmentSql({ ...config, ...change }, () => assert.fail()));
  const execute = createDevelopmentSql(config, () => assert.fail('Must not construct SQL client'));
  await assert.rejects(execute('bad', call, new AbortController().signal), { status: 400 });
  await assert.rejects(
    execute(token, { ...call, args: { value: 'x'.repeat(16001) } }, new AbortController().signal),
    { status: 400 },
  );
});

test('SQL rejects malformed identity/results and maps revocation without retry or commit', async () => {
  const identity = {
    rows: [
      {
        login: 'doji_staging_development_login',
        current_role: 'doji_staging_development_login',
        privileged: false,
        permitted: true,
      },
    ],
  };
  for (const scenario of ['identity', 'null', 'rows', 'count', 'row', 'revoked', 'close-fails']) {
    let ended = 0;
    const queries: string[] = [];
    const execute = createDevelopmentSql(
      { ...config, ca: '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----' },
      (options) => {
        assert.deepEqual(options.ssl, {
          rejectUnauthorized: true,
          ca: '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----',
        });
        return {
          connect: async () => {},
          end: async () => {
            ended++;
            if (scenario === 'close-fails') throw Error('synthetic close');
          },
          query: async (input) => {
            queries.push(typeof input === 'string' ? input : input.text);
            if (typeof input === 'string' && input.startsWith('select session_user'))
              return scenario === 'identity' ? {} : identity;
            if (typeof input === 'string') return {};
            if (scenario === 'revoked')
              throw Object.assign(Error('private SQL'), { code: '42501' });
            return scenario === 'null'
              ? null
              : scenario === 'rows'
                ? {}
                : scenario === 'count'
                  ? { rows: [] }
                  : { rows: [null] };
          },
        };
      },
    );
    await assert.rejects(execute(token, call, new AbortController().signal), {
      status: scenario === 'revoked' ? 401 : 503,
    });
    assert.equal(ended, 1);
    assert.ok(!queries.includes('commit'));
    assert.ok(queries.filter((query) => query === developmentSql).length <= 1);
  }
});
