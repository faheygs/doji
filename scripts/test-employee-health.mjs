import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmployeeHealth } from '../infra/portal-identity-candidate/employee-health.mjs';
function fixture(patch = {}) {
  let time = 100000,
    allowed = true;
  const calls = [];
  const health = createEmployeeHealth(
    {
      authorize: async () => {
        calls.push('auth');
        return { capabilities: { operations_read: allowed } };
      },
      command: async () => {
        calls.push('db');
        if (patch.dbFails) throw Error();
        return { healthy: true, sample_count: 3 };
      },
    },
    patch.unconfigured
      ? {}
      : { token: 'synthetic-not-real', organization: 'doji-test', projectIds: ['123'], projectSlugs: patch.projectSlugs || [] },
    {
      now: () => time,
      upstream: async (url, options) => {
        calls.push({ url, options });
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
    read: () => health({}, AbortSignal.timeout(1000)),
    deny: () => (allowed = false),
    advance: (ms) => (time += ms),
  };
}
test('health reads are bounded and cached with authorization on every request', async () => {
  const f = fixture();
  const [a, b] = await Promise.all([f.read(), f.read()]);
  assert.equal(a.operational.sample_count, 3);
  assert.equal(b.sentry.issues.length, 1);
  assert.equal(f.calls.filter((c) => c === 'db').length, 1);
  assert.equal(f.calls.filter((c) => typeof c === 'object').length, 1);
  const request = f.calls.find((c) => typeof c === 'object');
  assert.equal(new URL(request.url).searchParams.get('limit'), '25');
  assert.equal(new URL(request.url).searchParams.get('project'), '123');
  assert.equal(request.options.redirect, 'error');
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
  const f=fixture({projectSlugs:['react-native']});
  await f.read();
  const request=f.calls.find(c=>typeof c==='object');
  const url=new URL(request.url);
  assert.equal(url.searchParams.get('query'),'is:unresolved project:react-native');
  assert.equal(url.searchParams.get('environment'),'production');
  assert.equal(url.searchParams.get('statsPeriod'),'24h');
  for(const projectSlugs of [['react-native OR project:other'],['*'],[''],[null]])
    assert.throws(()=>fixture({projectSlugs}));
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
  const issue = (await f.read()).sentry.issues[0];
  assert.equal(issue.password, undefined);
  assert.equal(issue.permalink, null);
  assert.equal(issue.event_count, null);
});
