import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmployeeHealthSummary } from '../infra/portal-identity/employee-health-summary.mts';
import { createEmployeeHealth } from '../infra/portal-identity/employee-health.mts';
import { createEmployeeApplicationAdapter } from '../infra/portal-identity/employee-application-adapter.mts';
import { employeeHealthSnapshotSql } from '../infra/portal-identity/employee-health-contracts.mts';
import { createDevelopmentHealth } from '../infra/portal-identity/admin-development-health.mts';
import { testEmployee } from './employee-test-fixtures.mts';
const signal = new AbortController().signal;
const operator = (allowed = true) => ({ capabilities: { operations_read: allowed } });
test('cached Operations preserves source age, shares Sentry reads, and never falls back to aggregate scans', async () => {
  let now = Date.parse('2026-11-03T12:00:00Z'),
    provider = 0,
    allowed = true;
  let value: Record<string, unknown> = {
    enabled: true,
    available: true,
    operational: { available: true, healthy: true, checked_at: '2026-11-03T11:58:00Z' },
    workflows: { available: true, observed_at: '2026-11-03T11:58:00Z' },
  };
  const calls: string[] = [];
  const app = {
    authorize: async () => operator(allowed),
    command: async (_actor: unknown, input: { name: string; args: Record<string, unknown> }) => {
      calls.push(input.name);
      assert.equal(input.name, 'get_admin_health_snapshot_v1');
      assert.deepEqual(input.args, { p_summary: false });
      return value;
    },
  };
  const read = createEmployeeHealth(
    app,
    { token: 'synthetic', organization: 'synthetic', projectIds: ['1'] },
    {
      healthSnapshotEnabled: true,
      now: () => now,
      upstream: async () => {
        provider++;
        return new Response('[]');
      },
    },
  );
  const [first, second] = await Promise.all([
    read(testEmployee, signal),
    read(testEmployee, signal),
  ]);
  assert.equal(provider, 1);
  assert.deepEqual(first, second);
  assert.equal((first.operational as Record<string, unknown>).checked_at, '2026-11-03T11:58:00Z');
  const sourceTime = (first.sentry as Record<string, unknown>).observed_at;
  now += 30000;
  assert.equal(
    ((await read(testEmployee, signal)).sentry as Record<string, unknown>).observed_at,
    sourceTime,
  );
  now += 30001;
  await read(testEmployee, signal);
  assert.equal(provider, 2);
  value = { enabled: false };
  now += 60001;
  const disabled = await read(testEmployee, signal);
  assert.equal(disabled.health_snapshot_enabled, false);
  assert.deepEqual(disabled.operational, { available: false });
  assert.equal(provider, 2);
  allowed = false;
  const before = calls.length;
  await assert.rejects(read(testEmployee, signal), { status: 403 });
  assert.equal(calls.length, before);
  assert.throws(() =>
    createEmployeeHealth(app, {}, { healthSnapshotEnabled: true, healthEventsEnabled: true }),
  );
});
test('revocation while Sentry is pending fences the full cached result', async () => {
  let allowed = true;
  const read = createEmployeeHealth(
    { authorize: async () => operator(allowed), command: async () => ({ enabled: true }) },
    { token: 'synthetic', organization: 'synthetic' },
    {
      healthSnapshotEnabled: true,
      upstream: async () => {
        allowed = false;
        return new Response('[]');
      },
    },
  );
  await assert.rejects(read(testEmployee, signal), { status: 403 });
});
test('summary defaults off and never performs a snapshot/provider read', async () => {
  const read = createEmployeeHealthSummary({
    authorize: async () => operator(),
    command: async () => assert.fail('No SQL read'),
  });
  assert.deepEqual(await read(testEmployee, signal), { enabled: false });
});
test('summary reauthorizes before and after the fixed cached read and preserves timestamps', async () => {
  const calls: string[] = [];
  const value = { enabled: true, available: true, observed_at: '2026-11-03T00:00:00Z' };
  const read = createEmployeeHealthSummary(
    {
      authorize: async () => {
        calls.push('authorize');
        return operator();
      },
      command: async (_actor, input) => {
        calls.push(input.name);
        assert.deepEqual(input.args, { p_summary: true });
        return value;
      },
    },
    true,
  );
  assert.equal(await read(testEmployee, signal), value);
  assert.deepEqual(calls, ['authorize', 'get_admin_health_snapshot_v1', 'authorize']);
});
test('summary rejects missing permission, revocation, cancellation and malformed/oversized replies', async () => {
  let allowed = false;
  const abort = new AbortController();
  const read = createEmployeeHealthSummary(
    {
      authorize: async () => operator(allowed),
      command: async () => {
        allowed = false;
        return { enabled: true };
      },
    },
    true,
  );
  await assert.rejects(read(testEmployee, signal), { status: 403 });
  allowed = true;
  await assert.rejects(read(testEmployee, signal), { status: 403 });
  allowed = true;
  abort.abort();
  await assert.rejects(read(testEmployee, abort.signal));
  for (const value of [null, {}, { enabled: true, unexpected: 'x'.repeat(4097) }]) {
    await assert.rejects(
      createEmployeeHealthSummary(
        { authorize: async () => operator(), command: async () => value },
        true,
      )(testEmployee, signal),
      { status: 503 },
    );
  }
});
test('snapshot adapter uses only its new restricted SQL bridge with strict arguments', async () => {
  let count = 0;
  const adapter = createEmployeeApplicationAdapter(async (role, sql, args) => {
    count++;
    assert.equal(role, 'doji_employee_application');
    assert.equal(sql, employeeHealthSnapshotSql);
    assert.equal(args[6], '{"p_summary":true}');
    return { enabled: false };
  });
  await adapter.command(
    testEmployee,
    { name: 'get_admin_health_snapshot_v1', args: { p_summary: true } },
    signal,
  );
  for (const args of [{}, { p_summary: 'true' }, { p_summary: true, actor: 'other' }]) {
    await assert.rejects(
      adapter.command(testEmployee, { name: 'get_admin_health_snapshot_v1', args }, signal),
      { status: 400 },
    );
  }
  assert.equal(count, 1);
});
test('missing or rolled-back bridge reports unavailable without a permission-restore loop', async () => {
  await assert.rejects(
    createEmployeeHealthSummary(
      {
        authorize: async () => operator(),
        command: async () => {
          throw Object.assign(Error('synthetic grant unavailable'), { status: 403 });
        },
      },
      true,
    )(testEmployee, signal),
    { status: 503 },
  );
});
test('local impersonation uses the same cache read with developer reauthorization, never fabricated MFA', async () => {
  const calls: string[] = [];
  let providerCalls = 0;
  const monitor = {
    token: 'synthetic',
    environment: 'staging' as const,
    organization: 'doji-i0',
    projectIds: ['4512328707342336'],
    projectSlugs: ['doji-staging'],
  };
  const invoke = createDevelopmentHealth(
    async (token, input) => {
      assert.equal(token, 'synthetic');
      calls.push(input.name);
      return {
        ok: true,
        result:
          input.name === 'get_admin_portal_session_v3'
            ? operator()
            : { enabled: true, available: false },
      };
    },
    monitor,
    {
      healthSnapshotEnabled: true,
      upstream: async () => {
        providerCalls++;
        throw Error('No provider call');
      },
    },
  );
  const result = await invoke(
    'synthetic',
    {
      persona: 'synthetic-persona',
      name: 'portal_platform_health_summary_v1',
      args: {},
      requestId: 'synthetic-request',
    },
    signal,
  );
  assert.deepEqual(result, { ok: true, result: { enabled: true, available: false } });
  assert.equal(providerCalls, 0);
  assert.deepEqual(calls, [
    'get_admin_portal_session_v3',
    'get_admin_health_snapshot_v1',
    'get_admin_portal_session_v3',
  ]);
  assert.throws(() =>
    createDevelopmentHealth(async () => ({}), monitor, {
      healthSnapshotEnabled: true,
      healthEventsEnabled: true,
    }),
  );
});
