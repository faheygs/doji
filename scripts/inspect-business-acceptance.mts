// Bounded read-only acceptance diagnostics; no identity, token or request content.
import { cli } from './prepare-safety-launch.mts';
import { evidenceRows } from './release-evidence.mts';
import { readFile } from 'node:fs/promises';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import type * as Pg from 'pg';
import { createRestrictedSql } from '../infra/portal-identity/restricted-sql.mts';
import { createBusinessOwnedGuard } from '../infra/portal-identity/business-owned-guard.mts';
import { createBusinessRuntime } from '../infra/portal-identity/business-runtime.mts';
const sql = `begin read only;set local statement_timeout='3s';
select jsonb_build_object(
 'acceptance',(select jsonb_build_object('enabled',enabled,'started',started_at,'expires',expires_at,'reserved',reserved_at) from business_session_private.owned_auth_acceptance where singleton),
 'tickets',(select coalesce(jsonb_agg(q),'[]'::jsonb) from (select action,count(*)::int total from business_session_private.owned_auth_tickets group by action) q)
) state;rollback;`;
console.log(
  JSON.stringify(
    evidenceRows(
      cli([
        'db',
        'query',
        sql,
        '--linked',
        '--workdir',
        'D:/ChallengeApp/DoIt',
        '--output-format',
        'json',
      ]),
    ),
  ),
);
if (process.argv[2] === 'rehearse-admission') {
  const config = JSON.parse(
    await readFile('.artifacts/business-recovery-acceptance-20261011/runtime-staged.json', 'utf8'),
  );
  const email = (
    await readFile('.artifacts/business-recovery-acceptance-20261011/acceptance-email.txt', 'utf8')
  )
    .trim()
    .toLowerCase();
  const scope = createHash('sha256').update(`${config.origin}|${config.clientId}`).digest('hex');
  const identity = createHmac('sha256', Buffer.from(config.ownedAuth.admissionHmacKey, 'hex'))
    .update(`${scope}|identity|${email}`)
    .digest('hex');
  const pg: typeof Pg = createRequire(import.meta.url)(
    '../infra/portal-identity/node_modules/pg/lib/index.js',
  );
  const db = config.database;
  const client = new pg.Client({
    host: db.host,
    port: db.port,
    user: db.username,
    password: db.password,
    database: db.database,
    ssl: { rejectUnauthorized: true, ca: db.ca },
    connectionTimeoutMillis: 3000,
    statement_timeout: 3000,
    application_name: 'doji-business-acceptance-diagnostic',
  });
  try {
    await client.connect();
    await client.query('begin isolation level read committed;set local role doji_business_session');
    const result = await client.query(
      'select business_session_private.admit_owned_acceptance_v1($1,$2,$3,$4,$5) as result',
      [
        scope,
        'register',
        randomBytes(32).toString('hex'),
        identity,
        randomBytes(32).toString('hex'),
      ],
    );
    console.log(JSON.stringify({ restrictedAdmission: result.rows[0]?.result?.state }));
  } catch (error) {
    const e = error as { code?: string };
    console.log(
      JSON.stringify({ restrictedAdmission: 'failed', sqlstate: e.code || 'connection' }),
    );
  } finally {
    await client.query('rollback').catch(() => {});
    await client.end();
  }
}
if (['invalid-proof', 'invalid-proof-direct'].includes(process.argv[2] || '')) {
  const origin = 'https://business.dojipro.com';
  const config = JSON.parse(
    await readFile('.artifacts/business-recovery-acceptance-20261011/runtime-staged.json', 'utf8'),
  );
  const direct = process.argv[2] === 'invalid-proof-direct';
  const base = direct
    ? 'https://tvixsmqxotuvyjqzmjla.supabase.co/functions/v1/business-portal-v2'
    : origin;
  const trusted: Record<string, string> = direct
    ? { 'x-doji-portal-proxy-key': config.proxyKey, 'x-doji-client-ip': '192.0.2.11' }
    : {};
  const bootstrap = await fetch(base + '/auth/owned/bootstrap', {
    headers: { origin, ...trusted },
    signal: AbortSignal.timeout(15000),
  });
  const payload = await bootstrap.json();
  const binding = bootstrap.headers
    .getSetCookie()
    .find((c) => c.startsWith('__Host-doji_business_owned_binding='))
    ?.split(';')[0];
  if (bootstrap.status !== 200 || !binding || typeof payload.csrf !== 'string')
    throw Error('Bootstrap unavailable');
  const email = (
    await readFile('.artifacts/business-recovery-acceptance-20261011/acceptance-email.txt', 'utf8')
  ).trim();
  const response = await fetch(base + '/auth/owned/recover', {
    method: 'POST',
    headers: {
      origin,
      ...trusted,
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
      'x-doji-csrf': payload.csrf,
      cookie: binding,
    },
    body: JSON.stringify({ email, proof: 'invalid-controlled-acceptance-proof' }),
    signal: AbortSignal.timeout(15000),
  });
  console.log(JSON.stringify({ invalidProofStatus: response.status }));
  await response.body?.cancel();
  console.log(
    JSON.stringify(
      evidenceRows(
        cli([
          'db',
          'query',
          sql,
          '--linked',
          '--workdir',
          'D:/ChallengeApp/DoIt',
          '--output-format',
          'json',
        ]),
      ),
    ),
  );
}
if (process.argv[2] === 'actual-adapter') {
  const config = JSON.parse(
    await readFile('.artifacts/business-recovery-acceptance-20261011/runtime-staged.json', 'utf8'),
  );
  const email = (
    await readFile('.artifacts/business-recovery-acceptance-20261011/acceptance-email.txt', 'utf8')
  ).trim();
  const pg: typeof Pg = createRequire(import.meta.url)(
    '../infra/portal-identity/node_modules/pg/lib/index.js',
  );
  const execute = createRestrictedSql(
    { ...config.database, realm: 'business', ownedBusinessAuth: true },
    (options) => new pg.Client(options),
  );
  const guard = createBusinessOwnedGuard(
    { ...config, ...config.ownedAuth, enabled: true },
    execute,
  );
  try {
    await guard.admit('recover', guard.identityKey(email), '192.0.2.12', AbortSignal.timeout(5000));
    console.log('Actual guarded SQL adapter: allowed (no provider call)');
  } catch {
    console.log('Actual guarded SQL adapter: denied');
    process.exitCode = 1;
  }
}
if (process.argv[2] === 'actual-runtime') {
  const config = JSON.parse(
    await readFile('.artifacts/business-recovery-acceptance-20261011/runtime-staged.json', 'utf8'),
  );
  const email = (
    await readFile('.artifacts/business-recovery-acceptance-20261011/acceptance-email.txt', 'utf8')
  ).trim();
  const pg: typeof Pg = createRequire(import.meta.url)(
    '../infra/portal-identity/node_modules/pg/lib/index.js',
  );
  const runtime = createBusinessRuntime(
    {
      ...config,
      enabled: true,
      signupEnabled: false,
      ownedAuth: { ...config.ownedAuth, enabled: true, sendingEnabled: true },
    },
    {
      createClient: (options) => new pg.Client(options),
      upstream: async () => {
        console.log('Proof boundary reached; external HTTP suppressed');
        return Response.json({ success: false });
      },
    },
  );
  const headers = {
    origin: config.origin,
    'x-doji-portal-proxy-key': config.proxyKey,
    'x-doji-client-ip': '192.0.2.13',
  };
  const base = config.endpoint;
  const b = await runtime(new Request(base + '/auth/owned/bootstrap', { headers }));
  const p = await b.json();
  const binding = b.headers
    .getSetCookie()
    .find((c) => c.startsWith('__Host-doji_business_owned_binding='))
    ?.split(';')[0];
  if (b.status !== 200 || !binding) throw Error('Local bootstrap unavailable');
  const r = await runtime(
    new Request(base + '/auth/owned/recover', {
      method: 'POST',
      headers: {
        ...headers,
        'content-type': 'application/json',
        'x-doji-csrf': p.csrf,
        cookie: binding,
      },
      body: JSON.stringify({ email, proof: 'invalid-controlled-proof' }),
    }),
  );
  console.log(JSON.stringify({ localRuntimeStatus: r.status }));
}
