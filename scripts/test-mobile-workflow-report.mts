import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMobileWorkflowReport } from '../supabase/functions/mobile-workflow-report/handler.ts';
import { validWorkflowBatch } from '../contracts/mobileWorkflowTelemetry.ts';
const now = 1793760000000;
const batch = {
  id: 'wf:synthetic-batch-0001',
  issuedAt: now,
  platform: 'ios' as const,
  rows: [{ phase: 'feed_read' as const, outcome: 'confirmed' as const, count: 2, capped: false }],
};
const deny = () => {
  throw Error('Unexpected boundary call');
};
const config = {
  enabled: 'true',
  environment: 'staging',
  url: 'https://ohrcupagdoilkwhecict.supabase.co',
  now: () => now,
  authenticate: async () => '99100000-0000-4000-8000-000000000001',
  record: async () => 'accepted',
};
const request = (body: unknown = batch, headers: Record<string, string> = {}) =>
  new Request('https://local.test/mobile-workflow-report', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      authorization: 'Bearer synthetic-member-token-0001',
      'content-type': 'application/json',
      ...headers,
    },
  });
test('disabled and mixed environment requests never authenticate or touch database', async () => {
  for (const patch of [
    { enabled: undefined },
    { environment: 'unknown' },
    { url: 'https://tvixsmqxotuvyjqzmjla.supabase.co' },
  ])
    assert.equal(
      (
        await handleMobileWorkflowReport(request(), {
          ...config,
          ...patch,
          authenticate: deny,
          record: deny,
        })
      ).status,
      404,
    );
  assert.equal(
    (await handleMobileWorkflowReport(new Request('https://local.test/'), config)).status,
    405,
  );
  assert.equal(
    (
      await handleMobileWorkflowReport(request(batch, { authorization: 'bad' }), {
        ...config,
        authenticate: deny,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await handleMobileWorkflowReport(request(batch, { 'content-type': 'text/plain' }), {
        ...config,
        authenticate: deny,
      })
    ).status,
    415,
  );
});
test('strict fixed batches reject extra/private data, repeats, overflow and clock skew', async () => {
  for (const value of [
    null,
    [],
    {},
    { ...batch, actor: 'private' },
    { ...batch, id: 'bad' },
    { ...batch, issuedAt: now - 300001 },
    { ...batch, issuedAt: now + 30001 },
    { ...batch, platform: 'web' },
    { ...batch, rows: [] },
    { ...batch, rows: [...batch.rows, ...batch.rows] },
    ...[
      { count: 0 },
      { count: 15001 },
      { count: 1.5 },
      { capped: 'false' },
      { phase: 'answer-text' },
      { outcome: 'rendered' },
      { private: 'data' },
    ].map((patch) => ({ ...batch, rows: [{ ...batch.rows[0], ...patch }] })),
  ]) {
    assert.equal(validWorkflowBatch(value, now), false);
    assert.equal(
      (await handleMobileWorkflowReport(request(value), { ...config, authenticate: deny })).status,
      400,
    );
  }
  assert.equal(
    (
      await handleMobileWorkflowReport(request({ padding: 'a'.repeat(9000) }), {
        ...config,
        authenticate: deny,
      })
    ).status,
    413,
  );
});
test('only verified actor reaches fixed ingestion once; no body or raw failure escapes', async () => {
  for (const outcome of ['accepted', 'duplicate', 'limited', 'disabled', 'unavailable']) {
    let calls = 0;
    const response = await handleMobileWorkflowReport(request(), {
      ...config,
      record: async (actor, value) => {
        calls++;
        assert.equal(actor, await config.authenticate());
        assert.deepEqual(value, batch);
        return outcome;
      },
    });
    assert.equal(calls, 1);
    assert.equal(
      response.status,
      ['accepted', 'duplicate'].includes(outcome) ? 204 : outcome === 'limited' ? 429 : 503,
    );
    assert.equal(await response.text(), '');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  for (const actor of [null, 'invalid'])
    assert.equal(
      (
        await handleMobileWorkflowReport(request(), {
          ...config,
          authenticate: async () => actor,
          record: deny,
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await handleMobileWorkflowReport(request(), {
        ...config,
        authenticate: async () => {
          throw Error('private-token');
        },
        record: deny,
      })
    ).status,
    503,
  );
});
test('authentication and database stalls share one deadline and never retry', async () => {
  for (const phase of ['auth', 'database']) {
    let authCalls = 0,
      recordCalls = 0;
    const response = await handleMobileWorkflowReport(request(), {
      ...config,
      authenticate: () => {
        authCalls++;
        return phase === 'auth' ? new Promise(() => {}) : config.authenticate();
      },
      record: () => {
        recordCalls++;
        return new Promise(() => {});
      },
    });
    assert.equal(response.status, 503);
    assert.equal(authCalls, 1);
    assert.equal(recordCalls, phase === 'auth' ? 0 : 1);
  }
});
