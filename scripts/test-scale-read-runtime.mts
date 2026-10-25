// Real workerd execution; all upstream traffic is intercepted with synthetic data.
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { Miniflare, Response, Log, LogLevel, convertV4MiniflareOptions } from '../infra/doji-orchestrator/node_modules/miniflare/dist/src/index.js';
import { build } from '../infra/doji-orchestrator/node_modules/esbuild/lib/main.js';

const artifact = process.argv[2];
const script = artifact ? await readFile(artifact, 'utf8') : (await build({
  entryPoints: ['infra/doji-orchestrator/src/index.ts'], bundle: true, write: false,
  format: 'esm', platform: 'neutral', external: ['cloudflare:workers'],
})).outputFiles[0]?.text;
assert.ok(script);
const secret = 'synthetic-runtime-only-secret';
const keys = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const publicKey = { ...keys.publicKey.export({ format: 'jwk' }), kid: 'synthetic-key' };
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
function token(sub: string, role = 'authenticated') {
  const body = `${encode({ alg: 'HS256' })}.${encode({ sub, role, aud: 'authenticated',
    iss: 'https://database.invalid/auth/v1', exp: Math.floor(Date.now() / 1000) + 600 })}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
let calls = 0;
let active = 0;
let maximumActive = 0;
let blockNext = false;
let blockBodyNext = false;
const stall: { release?: () => void } = {};
function releaseStall() { stall.release?.(); delete stall.release; }
let stalled: (() => void) | undefined;
let stallKeys = false;
let keyReads = 0;
const forbidden: string[] = [];
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true, script, compatibilityDate: '2026-08-11', host: '127.0.0.1',
  log: new Log(LogLevel.NONE),
  bindings: { SUPABASE_URL: 'https://database.invalid', SUPABASE_ANON_KEY: 'synthetic',
    SUPABASE_JWT_SECRET: secret, SCALE_CACHE_VERSION: 'runtime-test' },
  durableObjects: { DOJI_EVENT_ALARM: 'DojiEventAlarm', OUTBOX_RELAY_ALARM: 'OutboxRelayAlarm',
    PUSH_FANOUT_ALARM: 'PushFanoutAlarm', DATA_MAINTENANCE_ALARM: 'DataMaintenanceAlarm',
    HEALTH_MONITOR: 'HealthMonitor' },
  outboundService: async request => {
    const url = new URL(request.url);
    if (url.origin === 'https://database.invalid' && url.pathname === '/auth/v1/.well-known/jwks.json') {
      keyReads++;
      if (stallKeys) {
        stallKeys = false;
        const waiting = new Promise<void>(resolve => { stall.release = resolve; });
        stalled?.(); await waiting;
      }
      return new Response(JSON.stringify({ keys: [publicKey] }), { headers: { 'content-type': 'application/json' } });
    }
    if (url.origin !== 'https://database.invalid' || url.pathname !== '/rest/v1/rpc/get_feed_page_snapshot_v2') {
      forbidden.push(`${request.method} ${url.origin}${url.pathname}`);
      return new Response('Unmocked external request denied', { status: 599 });
    }
    assert.equal(request.method, 'POST');
    const jwt = request.headers.get('authorization')?.slice(7).split('.')[1];
    assert.ok(jwt);
    const member = JSON.parse(Buffer.from(jwt, 'base64url').toString()).sub as string;
    const args = await request.json() as { p_audience: string };
    calls++; active++; maximumActive = Math.max(maximumActive, active);
    try {
      if (blockNext) {
        blockNext = false;
        const waiting = new Promise<void>(resolve => { stall.release = resolve; });
        stalled?.(); await waiting;
      } else await new Promise(resolve => { setTimeout(resolve, 30); });
      const body = JSON.stringify([{ member, audience: args.p_audience }]);
      if (blockBodyNext) {
        blockBodyNext = false;
        return new Response(new ReadableStream({ start(controller) {
          controller.enqueue(new TextEncoder().encode(body));
          stall.release = () => controller.close(); stalled?.();
        } }), { headers: { 'content-type': 'application/json' } });
      }
      return new Response(body, { headers: { 'content-type': 'application/json' } });
    } finally { active--; }
  },
}));
const read = (member: string, event: string, audience = 'friends', role = 'authenticated') =>
  mf.dispatchFetch(`https://gateway.invalid/v1/feed/${event}?audience=${audience}`, {
    headers: { authorization: `Bearer ${token(member, role)}` },
    signal: AbortSignal.timeout(15_000),
  });
const results: Record<string, unknown> = {};
try {
  await mf.ready;
  const member = randomUUID();
  const event = randomUUID();
  assert.equal((await read(member, event, 'friends', 'doji_employee')).status, 401);
  assert.equal(calls, 0, 'Employee token must not reach member RPC');
  const first = await read(member, event);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), [{ member, audience: 'friends' }]);
  await new Promise(resolve => { setTimeout(resolve, 80); });
  const cached = await read(member, event);
  assert.equal(cached.headers.get('x-doji-scale-cache'), 'hit');
  assert.equal(calls, 1);
  assert.equal(cached.headers.get('cache-control'), 'private, no-store');
  results.authAndCache = 'passed';

  const body = `${encode({ alg: 'ES256', kid: publicKey.kid })}.${encode({ sub: member,
    role: 'authenticated', aud: 'authenticated', iss: 'https://database.invalid/auth/v1',
    exp: Math.floor(Date.now() / 1000) + 600 })}`;
  const signed = `${body}.${sign('sha256', Buffer.from(body), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
  const keyRead = () => mf.dispatchFetch(`https://gateway.invalid/v1/feed/${event}`, {
    headers: { authorization: `Bearer ${signed}` }, signal: AbortSignal.timeout(15_000),
  });
  stallKeys = true;
  const keyEntered = new Promise<void>(resolve => { stalled = resolve; });
  const keyStarted = performance.now();
  const slowKey = keyRead();
  await Promise.race([keyEntered, slowKey.then(() => { throw new Error('JWKS stall was not reached'); })]);
  assert.equal((await keyRead()).status, 200);
  assert.equal((await slowKey).status, 503);
  const keyElapsedMs = Math.round(performance.now() - keyStarted);
  assert.ok(keyElapsedMs >= 4900 && keyElapsedMs < 6500);
  releaseStall();
  assert.equal((await keyRead()).status, 200);
  assert.equal(keyReads, 2, 'Only completed keys may be shared across invocations');
  results.publicKeyRecovery = { keyReads, keyElapsedMs };

  for (const phase of ['headers', 'body']) {
    const occurrence = randomUUID();
    blockNext = phase === 'headers'; blockBodyNext = phase === 'body';
    const entered = new Promise<void>(resolve => { stalled = resolve; });
    const started = performance.now();
    const pending = read(member, occurrence);
    await Promise.race([entered, pending.then(() => { throw new Error('Stall fixture was not reached'); })]);
    const recoveryStarted = performance.now();
    const independent = await read(member, occurrence);
    assert.equal(independent.status, 200);
    await independent.text();
    const recoveryMs = Math.round(performance.now() - recoveryStarted);
    assert.ok(recoveryMs < 2000, 'Second invocation must not wait behind stalled I/O');
    const bounded = await pending;
    const elapsedMs = Math.round(performance.now() - started);
    assert.equal(bounded.status, 503);
    assert.ok(elapsedMs >= 5900 && elapsedMs < 7500, `Deadline outside budget: ${elapsedMs}`);
    assert.equal(bounded.headers.get('cache-control'), 'private, no-store');
    releaseStall();
    assert.equal((await read(member, occurrence)).status, 200);
    results[phase] = { status: bounded.status, elapsedMs, recoveryMs };
  }

  const before = calls;
  maximumActive = 0;
  const members = Array.from({ length: 20 }, () => randomUUID());
  const burstEvent = randomUUID();
  const start = performance.now();
  await Promise.all(members.flatMap(owner => ['friends', 'everyone'].map(async audience => {
    const response = await read(owner, burstEvent, audience);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [{ member: owner, audience }]);
  })));
  assert.equal(calls - before, 40);
  results.syntheticBurst = { requests: 40, originCalls: calls - before, maximumActive,
    elapsedMs: Math.round(performance.now() - start) };
  await new Promise(resolve => { setTimeout(resolve, 80); });
  await Promise.all(members.map(async owner => assert.equal((await read(owner, burstEvent)).headers.get('x-doji-scale-cache'), 'hit')));
  assert.equal(calls - before, 40, 'Warm reads must not amplify upstream traffic');
  assert.deepEqual(forbidden, [], 'No unmocked network or unrelated service calls');
  console.log(JSON.stringify({ runtime: 'workerd', artifact: artifact ?? 'current source', results }, null, 2));
} finally {
  releaseStall();
  await mf.dispose();
}
