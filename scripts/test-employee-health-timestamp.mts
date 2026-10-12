import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { patchEmployeeHealthTimestamp } from './employee-health-timestamp-patch.mts';
const relative = 'supabase/functions/employee-portal-v2/runtime/employee-health.mjs';
const base = resolve('test-results/react-admin-announcements-20261009/edge-on-download');
const candidate = resolve('test-results/employee-health-timestamp-20261009/candidate');
const { createEmployeeHealth } = await import(pathToFileURL(candidate + '/' + relative).href);
function fixture(
  response: () => Response | Promise<Response> = () => Response.json([]),
  configured = true,
) {
  let time = Date.parse('2026-10-09T12:00:00Z'),
    allowed = true,
    auth = 0,
    db = 0,
    network = 0;
  const sourceStamp = '2026-10-09T11:59:50Z';
  const health = createEmployeeHealth(
    {
      authorize: async () => {
        auth++;
        return { capabilities: { operations_read: allowed } };
      },
      command: async (_: unknown, command: { name: string }) => {
        assert.equal(command.name, 'get_admin_operational_health_read_v1');
        db++;
        return { healthy: true, observed_at: sourceStamp };
      },
    },
    configured
      ? {
          token: 'synthetic-only',
          organization: 'synthetic',
          projectIds: ['123'],
          projectSlugs: ['react-native'],
        }
      : {},
    {
      now: () => time,
      upstream: async (input: string, options: RequestInit) => {
        network++;
        const url = new URL(input);
        assert.equal(url.origin, 'https://sentry.io');
        assert.equal(url.searchParams.get('limit'), '25');
        assert.equal(url.searchParams.get('statsPeriod'), '24h');
        assert.equal(url.searchParams.get('environment'), 'production');
        assert.equal(url.searchParams.get('query'), 'is:unresolved project:react-native');
        assert.equal(options.redirect, 'error');
        assert.ok(options.signal);
        return response();
      },
    },
  );
  return {
    read: (signal = new AbortController().signal) => health({}, signal),
    advance: (ms: number) => {
      time += ms;
    },
    deny: () => {
      allowed = false;
    },
    counts: () => ({ auth, db, network }),
    stamp: () => new Date(time).toISOString(),
    sourceStamp,
  };
}
test('prepared file is exactly the approved patch; changed baseline rejected', () => {
  const original = readFileSync(base + '/' + relative);
  assert.equal(
    readFileSync(candidate + '/' + relative, 'utf8'),
    patchEmployeeHealthTimestamp(original),
  );
  assert.throws(() => patchEmployeeHealthTimestamp(Buffer.concat([original, Buffer.from('\n')])));
});
test('cache loads once, timestamps completion and never re-dates a cached result', async () => {
  let finish!: (value: Response) => void;
  const f = fixture(
    () =>
      new Promise<Response>((r) => {
        finish = r;
      }),
  );
  const reads = Promise.all([f.read(), f.read()]);
  await new Promise((r) => {
    setImmediate(r);
  });
  f.advance(1000);
  finish(Response.json([]));
  const [a, b] = await reads;
  assert.equal(a.sentry.observed_at, f.stamp());
  assert.deepEqual(a.sentry, b.sentry);
  assert.equal(a.operational.observed_at, f.sourceStamp);
  f.advance(29000);
  const c = await f.read();
  assert.equal(c.sentry.observed_at, a.sentry.observed_at);
  assert.notEqual(c.generated_at, a.generated_at);
  assert.deepEqual(f.counts(), { auth: 3, db: 2, network: 1 });
});
test('Sentry expires at 60 seconds and authorization precedes every cache hit', async () => {
  const f = fixture();
  const a = await f.read();
  f.advance(59999);
  assert.equal((await f.read()).sentry.observed_at, a.sentry.observed_at);
  f.advance(1);
  assert.notEqual((await f.read()).sentry.observed_at, a.sentry.observed_at);
  assert.equal(f.counts().network, 2);
  f.deny();
  await assert.rejects(f.read(), { status: 403 });
  assert.equal(f.counts().network, 2);
});
test('errors, unconfigured reads and malformed provider responses get no success timestamp', async () => {
  for (const response of [
    () => new Response('', { status: 401 }),
    () => new Response('', { status: 429 }),
    () => Response.json(Array.from({ length: 26 }, () => ({}))),
    () => Response.json([null]),
    () => new Response('invalid'),
    () => new Response('x'.repeat(270000)),
    () => {
      throw new DOMException('Deadline', 'TimeoutError');
    },
  ]) {
    const f = fixture(response);
    for (let i = 0; i < 2; i++) {
      const result = await f.read();
      assert.equal(result.sentry.available, false);
      assert.equal(result.sentry.observed_at, undefined);
    }
    assert.equal(f.counts().network, 1);
  }
  const f = fixture(undefined, false);
  assert.equal((await f.read()).sentry.observed_at, undefined);
  assert.equal(f.counts().network, 0);
});
test('canceled caller does not receive data; recovery gets a new observation', async () => {
  let fails = true;
  const f = fixture(() => (fails ? new Response('', { status: 503 }) : Response.json([])));
  assert.equal((await f.read()).sentry.available, false);
  fails = false;
  f.advance(60000);
  assert.equal((await f.read()).sentry.observed_at, f.stamp());
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(f.read(abort.signal), { name: 'AbortError' });
  assert.equal(f.counts().network, 2);
});
