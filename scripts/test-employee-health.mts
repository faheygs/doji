import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmployeeHealth } from '../infra/portal-identity/employee-health.mts';
import { testEmployee, testRecord, testList, present } from './employee-test-fixtures.mts';
interface Patch {
  workflowHealthEnabled?: boolean;
  dbFails?: boolean;
  unconfigured?: boolean;
  projectSlugs?: string[];
  response?: () => Response;
  environment?: 'production' | 'staging';
}
function fixture(patch: Patch = {}) {
  let time = 100000,
    allowed = true;
  const calls: (string | { url: string; options?: RequestInit })[] = [];
  const health = createEmployeeHealth(
    {
      authorize: async () => {
        calls.push('auth');
        return { capabilities: { operations_read: allowed } };
      },
      command: async (_actor, input) => {
        if (input.name === 'get_admin_workflow_health_v1') {
          calls.push('workflow');
          if (patch.dbFails) throw Error('Synthetic unavailable');
          return {
            enabled: true,
            hours: [],
            receipts: [],
            retention_enabled: false,
            scheduler_receipt: null,
          };
        }
        calls.push('db');
        if (patch.dbFails) throw Error();
        return { healthy: true, sample_count: 3 };
      },
    },
    patch.unconfigured
      ? {}
      : {
          token: 'synthetic-not-real',
          organization: 'doji-test',
          projectIds: ['123'],
          projectSlugs: patch.projectSlugs || [],
          environment: patch.environment,
        },
    {
      now: () => time,
      workflowHealthEnabled: patch.workflowHealthEnabled,
      upstream: async (url, options) => {
        calls.push({ url: String(url), options });
        return (
          patch.response?.() ||
          Response.json([
            {
              id: '1',
              title: 'synthetic',
              count: '3',
              userCount: 2,
              permalink: 'https://doji-test.sentry.io/issues/1/',
            },
          ])
        );
      },
    },
  );
  return {
    calls,
    read: async () => {
      const result = await health(testEmployee, AbortSignal.timeout(1000));
      return {
        operational: testRecord(result.operational),
        sentry: testRecord(result.sentry),
        workflows: testRecord(result.workflows),
      };
    },
    deny: () => (allowed = false),
    advance: (ms: number) => (time += ms),
  };
}
test('workflow read defaults off, caches without refreshing timestamps, and reauthorizes', async () => {
  const off = fixture();
  assert.equal((await off.read()).workflows.available, false);
  assert.equal(off.calls.includes('workflow'), false);
  const f = fixture({ workflowHealthEnabled: true });
  const first = await f.read();
  assert.equal(first.workflows.available, true);
  f.advance(1000);
  assert.equal((await f.read()).workflows.observed_at, first.workflows.observed_at);
  assert.equal(f.calls.filter((c) => c === 'workflow').length, 1);
  f.advance(30001);
  await f.read();
  assert.equal(f.calls.filter((c) => c === 'workflow').length, 2);
  f.deny();
  await assert.rejects(f.read(), { status: 403 });
  assert.equal(f.calls.filter((c) => c === 'workflow').length, 2);
  const failed = await fixture({ workflowHealthEnabled: true, dbFails: true }).read();
  assert.equal(failed.workflows.available, false);
  assert.equal(failed.sentry.available, true);
});
test('health reads are bounded and cached with authorization on every request', async () => {
  const f = fixture();
  const [a, b] = await Promise.all([f.read(), f.read()]);
  assert.equal(a.operational.sample_count, 3);
  assert.equal(testList(b.sentry.issues).length, 1);
  assert.equal(f.calls.filter((c) => c === 'db').length, 1);
  assert.equal(f.calls.filter((c) => typeof c === 'object').length, 1);
  const request = present(f.calls.find((c) => typeof c === 'object'));
  assert.equal(new URL(request.url).searchParams.get('limit'), '25');
  assert.equal(new URL(request.url).searchParams.get('project'), '123');
  assert.equal(present(request.options).redirect, 'error');
  f.deny();
  await assert.rejects(f.read(), { status: 403 });
  assert.equal(f.calls.filter((c) => c === 'db').length, 1);
});
test('missing monitoring coverage and failed DB are not reported as healthy', async () => {
  const f = fixture({ unconfigured: true, dbFails: true });
  const result = await f.read();
  assert.equal(result.operational.available, false);
  assert.equal(result.sentry.available, false);
  assert.equal(result.sentry.configured, false);
  assert.equal(
    f.calls.some((c) => typeof c === 'object'),
    false,
  );
});

test('configured project slug preserves the existing production monitoring boundary', async () => {
  const f = fixture({ projectSlugs: ['react-native'] });
  await f.read();
  const request = present(f.calls.find((c) => typeof c === 'object'));
  const url = new URL(request.url);
  assert.equal(url.searchParams.get('query'), 'is:unresolved project:react-native');
  assert.equal(url.searchParams.get('environment'), 'production');
  assert.equal(url.searchParams.get('statsPeriod'), '24h');
  for (const projectSlugs of [['react-native OR project:other'], ['*'], [''], [null]])
    assert.throws(() => Reflect.apply(fixture, undefined, [{ projectSlugs }]));
});
test('oversized or invalid provider data fail closed; errors cache briefly', async () => {
  for (const response of [
    () => Response.json(Array.from({ length: 26 }, () => ({}))),
    () => new Response('not-json'),
    () => new Response('x'.repeat(270000)),
  ]) {
    const f = fixture({ response });
    assert.equal((await f.read()).sentry.available, false);
    assert.equal((await f.read()).sentry.available, false);
    assert.equal(f.calls.filter((c) => typeof c === 'object').length, 1);
    f.advance(60001);
    await f.read();
    assert.equal(f.calls.filter((c) => typeof c === 'object').length, 2);
  }
});
test('unexpected provider fields and external links are not forwarded', async () => {
  const f = fixture({
    response: () =>
      Response.json([
        {
          id: '1',
          title: 'test',
          password: 'not-real',
          permalink: 'https://attacker.test/',
          count: -1,
        },
      ]),
  });
  const issue = testRecord(testList((await f.read()).sentry.issues)[0]);
  assert.equal(issue.password, undefined);
  assert.equal(issue.permalink, null);
  assert.equal(issue.event_count, null);
});

test('staging reads only staging issues and does not label them production', async () => {
  const f = fixture({ environment: 'staging', response: () => Response.json([{ id: '1' }]) });
  const result = await f.read();
  const request = present(f.calls.find((c) => typeof c === 'object'));
  assert.equal(new URL(request.url).searchParams.get('environment'), 'staging');
  assert.equal(testRecord(testList(result.sentry.issues)[0]).title, 'Unhandled staging issue');
  for (const environment of ['', '*', 'production&environment=staging', null])
    assert.throws(() => Reflect.apply(fixture, undefined, [{ environment }]));
});
