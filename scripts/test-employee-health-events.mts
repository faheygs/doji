import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmployeeHealth } from '../infra/portal-identity-candidate/employee-health.mts';
import { createEmployeeResources } from '../infra/portal-identity-candidate/employee-resources.mts';
import { healthVersions } from '../infra/portal-identity-candidate/employee-health-contracts.mts';
import { createHealthHintFilter } from '../website/admin-portal/health-model.mts';
import { recordEmployeeHealthObservation } from '../supabase/functions/operational-health/employee-health-observation.ts';
import { testEmployee } from './employee-test-fixtures.mts';
import { createEmployeeApplicationAdapter } from '../infra/portal-identity-candidate/employee-application-adapter.mts';
import { employeeHealthSql } from '../infra/portal-identity-candidate/employee-health-contracts.mts';
const at = '2026-10-06T12:00:00Z';
const feed = (revision = '1') => ({
  enabled: true,
  sources: [{ source: 'delivery', revision, observed_at: at }],
});
const hint = (source: string, revision: unknown) => ({
  name: 'staff.health.changed',
  data: { source, revision },
});
test('health metadata uses only the fixed employee bridge and rejects injected arguments', async () => {
  let calls = 0;
  const adapter = createEmployeeApplicationAdapter(async (role, sql, args) => {
    calls++;
    assert.equal(role, 'doji_employee_application');
    assert.equal(sql, employeeHealthSql);
    assert.deepEqual(args, [
      testEmployee.issuer,
      testEmployee.audience,
      testEmployee.subject,
      testEmployee.sessionId,
      true,
      'get_admin_health_feed_v1',
      '{}',
    ]);
    return feed();
  });
  await adapter.command(
    testEmployee,
    { name: 'get_admin_health_feed_v1', args: {} },
    AbortSignal.timeout(1000),
  );
  await assert.rejects(
    adapter.command(
      testEmployee,
      { name: 'get_admin_health_feed_v1', args: { actor_id: 'other' } },
      AbortSignal.timeout(1000),
    ),
    { status: 400 },
  );
  assert.equal(calls, 1);
});

test('health hints reject malformed, duplicate, delayed and unrelated messages with bounded source state', () => {
  const accept = createHealthHintFilter();
  assert.equal(accept(hint('delivery', '2')), true);
  for (const message of [
    null,
    {},
    hint('delivery', '2'),
    hint('delivery', '1'),
    hint('delivery', 3),
    hint('delivery', '-1'),
    hint('delivery', '9'.repeat(99)),
    hint('member', '3'),
    { name: 'staff.case.changed', data: { source: 'delivery', revision: '3' } },
  ])
    assert.equal(accept(message), false);
  assert.equal(accept(hint('history', '1')), true);
  assert.equal(accept(hint('sentry', '1')), true);
  assert.equal(accept(hint('delivery', '3')), true);
  assert.equal(createHealthHintFilter()(hint('delivery', '1')), true);
});
test('server revisions fail closed for disabled, malformed and duplicate sources', () => {
  assert.deepEqual(healthVersions(feed()), { delivery: '1', history: '0', sentry: '0' });
  for (const value of [
    { enabled: false, sources: [] },
    { enabled: true, sources: {} },
    { enabled: true, sources: [...feed().sources, ...feed().sources] },
    feed('not-a-version'),
    { enabled: true, sources: [{ source: 'member', revision: '1', observed_at: at }] },
  ])
    assert.throws(() => healthVersions(value));
});
test('producer gate, malformed observation and writer failure never schedule or retry work', async () => {
  let calls = 0;
  const write = async () => {
    calls++;
    return { error: null };
  };
  assert.equal(await recordEmployeeHealthObservation(false, { checked_at: at }, write), false);
  assert.equal(await recordEmployeeHealthObservation(true, {}, write), false);
  assert.equal(calls, 0);
  assert.equal(
    await recordEmployeeHealthObservation(true, { checked_at: at }, async (args) => {
      assert.deepEqual(args, {
        p_source: 'delivery',
        p_observed_at: at,
        p_event_key: `delivery:${at}`,
      });
      return write();
    }),
    true,
  );
  assert.equal(calls, 1);
  assert.equal(
    await recordEmployeeHealthObservation(true, { checked_at: at }, async () => {
      calls++;
      throw Error('synthetic');
    }),
    false,
  );
  assert.equal(calls, 2);
  assert.equal(
    await recordEmployeeHealthObservation(true, { checked_at: at }, async () => ({
      error: 'synthetic',
    })),
    false,
  );
});
for (const allowed of [true, false])
  test(`operations-only channel admission: ${allowed}`, async () => {
    let signed: unknown;
    const resource = createEmployeeResources(
      {
        authorize: async () => ({
          user_id: '11111111-1111-4111-8111-111111111111',
          capabilities: { moderation_read: false, operations_read: allowed },
        }),
        command: async (_, input) => {
          assert.equal(input.name, 'get_admin_health_feed_v1');
          return feed();
        },
      },
      {
        healthEventsEnabled: true,
        storageOrigin: 'https://abcdefghijklmnopqrst.supabase.co',
        signStorage: async () => '',
        signRealtime: async (value) => {
          signed = value;
          return value;
        },
      },
    );
    const request = resource.command(
      testEmployee,
      { name: 'portal_realtime_token_v1', args: {} },
      AbortSignal.timeout(1000),
    );
    if (!allowed) {
      await assert.rejects(request);
      assert.equal(signed, undefined);
      return;
    }
    await request;
    assert.deepEqual((signed as { capability: unknown }).capability, {
      'staff:health:operations': ['subscribe'],
    });
  });
test('disabled feed cannot issue an operations channel token', async () => {
  let signed = false;
  const resource = createEmployeeResources(
    {
      authorize: async () => ({
        user_id: '11111111-1111-4111-8111-111111111111',
        capabilities: { moderation_read: false, operations_read: true },
      }),
      command: async () => ({ enabled: false, sources: [] }),
    },
    {
      healthEventsEnabled: true,
      storageOrigin: 'https://abcdefghijklmnopqrst.supabase.co',
      signStorage: async () => '',
      signRealtime: async () => {
        signed = true;
        return {};
      },
    },
  );
  await assert.rejects(
    resource.command(
      testEmployee,
      { name: 'portal_realtime_token_v1', args: {} },
      AbortSignal.timeout(1000),
    ),
  );
  assert.equal(signed, false);
});
function cachedFixture() {
  let revision = '1',
    reads = 0,
    versionReads = 0,
    allowed = true,
    time = Date.parse(at),
    drift = false;
  const health = createEmployeeHealth(
    {
      authorize: async () => ({ capabilities: { operations_read: allowed } }),
      command: async (_, input) => {
        if (input.name === 'get_admin_health_feed_v1') {
          versionReads++;
          if (drift) revision = String(Number(revision) + 1);
          return feed(revision);
        }
        reads++;
        return { healthy: true, checked_at: new Date(time).toISOString(), value: revision };
      },
    },
    {},
    { healthEventsEnabled: true, now: () => time },
  );
  return {
    read: () => health(testEmployee, AbortSignal.timeout(1000)),
    reads: () => reads,
    versions: () => versionReads,
    advance: () => {
      time += 1000;
    },
    change: () => {
      revision = String(Number(revision) + 1);
    },
    deny: () => {
      allowed = false;
    },
    drift: () => {
      drift = true;
    },
  };
}
test('new server revision invalidates cache without a browser force-refresh parameter', async () => {
  const f = cachedFixture();
  await f.read();
  await f.read();
  assert.equal(f.reads(), 1);
  f.change();
  await f.read();
  assert.equal(f.reads(), 2);
  f.deny();
  await assert.rejects(f.read(), { status: 403 });
  assert.equal(f.reads(), 2);
});
test('cached source observation time is not relabelled by a fresh response envelope', async () => {
  const f = cachedFixture();
  const first = await f.read();
  f.advance();
  const second = await f.read();
  assert.notEqual(first.generated_at, second.generated_at);
  assert.equal(
    (first.operational as Record<string, unknown>).observed_at,
    (second.operational as Record<string, unknown>).observed_at,
  );
});
test('continuously changing revision stops after two bounded attempts', async () => {
  const f = cachedFixture();
  f.drift();
  await assert.rejects(f.read(), { status: 503 });
  assert.equal(f.reads(), 2);
  assert.equal(f.versions(), 4);
});
test('revision changed during a slow read discards that response and reconciles once', async () => {
  let revision = '1',
    reads = 0;
  const health = createEmployeeHealth(
    {
      authorize: async () => ({ capabilities: { operations_read: true } }),
      command: async (_, input) => {
        if (input.name === 'get_admin_health_feed_v1') return feed(revision);
        reads++;
        const value = revision;
        revision = '2';
        return { healthy: true, value };
      },
    },
    {},
    { healthEventsEnabled: true },
  );
  const result = await health(testEmployee, AbortSignal.timeout(1000));
  assert.equal((result.operational as Record<string, unknown>).value, '2');
  assert.equal(reads, 2);
});
