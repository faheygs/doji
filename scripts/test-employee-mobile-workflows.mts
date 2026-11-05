import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mobileWorkflowRead as readSummary } from '../infra/portal-identity/mobile-workflow-read.mts';
import { projectMobileWorkflowHours } from '../infra/portal-identity/employee-mobile-workflows.mts';
import {
  workflowPhases,
  workflowOutcomes,
  validWorkflowPair,
} from '../contracts/mobileWorkflowTelemetry.ts';
import { createEmployeeMobileWorkflows } from '../infra/portal-identity/employee-mobile-workflows.mts';
import { createEmployeeApplicationAdapter } from '../infra/portal-identity/employee-application-adapter.mts';
import { employeeMobileWorkflowsSql } from '../infra/portal-identity/employee-health-contracts.mts';
import { createEmployeeHealth } from '../infra/portal-identity/employee-health.mts';
import { createDevelopmentHealth } from '../infra/portal-identity/admin-development-health.mts';
import { testEmployee } from './employee-test-fixtures.mts';

const checked = '2026-11-04T23:30:00.000Z';
const mobileWorkflowRead = (value: unknown, hourly = false) =>
  hourly ? projectMobileWorkflowHours(value) : readSummary(value);
const row = {
  hour: '2026-11-04T23:00:00Z',
  platform: 'ios',
  phase: 'submit',
  outcome: 'confirmed',
  count: 2,
  capped: false,
  received_at: checked,
};
const value = { source: 'device_reported', enabled: true, checked_at: checked, rows: [row] };
const signal = new AbortController().signal;
const authority = (allowed = true) => ({ capabilities: { operations_read: allowed } });

test('bounded hourly counts roll up without private fields, rate claims or refreshed observation times', () => {
  const result = mobileWorkflowRead(
    {
      ...value,
      actor_hash: 'private',
      rows: [
        { ...row, actor: 'private' },
        {
          ...row,
          hour: '2026-11-04T22:00:00Z',
          received_at: '2026-11-04T22:30:00Z',
          capped: true,
          count: 3,
        },
      ],
    },
    true,
  );
  assert.equal(result.status, 'ready');
  assert.equal(result.rows[0]?.count, 5);
  assert.equal(result.rows[0]?.capped, true);
  assert.equal(result.rows[0]?.received_at, checked);
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.deepEqual(
    mobileWorkflowRead({
      source: 'device_reported',
      enabled: true,
      checked_at: result.checked_at,
      rows: result.rows,
    }),
    result,
  );
  assert.equal(mobileWorkflowRead({ ...value, rows: [] }, true).status, 'ready');
  assert.equal(mobileWorkflowRead({ ...value, enabled: false }).rows.length, 0);
  assert.equal(mobileWorkflowRead({ ...value, enabled: false }).status, 'disabled');
});

test('invalid, duplicate, out-of-window and oversized rows remain unavailable, not zero', () => {
  for (const bad of [
    null,
    [],
    {},
    { ...value, source: 'server_confirmed' },
    { ...value, enabled: 'true' },
    { ...value, checked_at: 'invalid' },
    { ...value, rows: {} },
    { ...value, rows: Array(1441).fill(row) },
    { ...value, rows: [row, row] },
    ...[
      null,
      [],
      { ...row, platform: 'web' },
      { ...row, phase: ['submit'] },
      { ...row, outcome: 'rendered' },
      { ...row, count: -1 },
      { ...row, count: 1.2 },
      { ...row, count: 1000000001 },
      { ...row, capped: 'false' },
      { ...row, received_at: null },
      { ...row, received_at: '2026-11-05T00:00:00Z' },
      { ...row, received_at: '2026-11-03T23:00:00Z' },
      { ...row, hour: null },
      { ...row, hour: '2026-11-04T23:01:00Z' },
      { ...row, hour: '2026-11-03T23:00:00Z' },
      { ...row, hour: '2026-11-05T00:00:00Z' },
      { ...row, received_at: '2026-11-04T22:59:59Z' },
      { ...row, hour: '2026-11-04T22:00:00Z' },
    ].map((entry) => ({ ...value, rows: [entry] })),
  ])
    assert.equal(mobileWorkflowRead(bad, true).status, 'unavailable');
  assert.equal(mobileWorkflowRead({ ...value, rows: Array(61).fill(row) }).status, 'unavailable');
  assert.equal(mobileWorkflowRead({ ...value, rows: [row, row] }).status, 'unavailable');
});

test('all 1440 valid hour/platform/category slots aggregate into at most 60 records', () => {
  const rows = [];
  for (let h = 0; h < 24; h++)
    for (const platform of ['ios', 'android'])
      for (const phase of workflowPhases)
        for (const outcome of workflowOutcomes) {
          if (!validWorkflowPair(phase, outcome)) continue;
          const hour = new Date(Date.parse('2026-11-04T23:00:00Z') - h * 3600000).toISOString();
          rows.push({
            hour,
            received_at: hour,
            platform,
            phase,
            outcome,
            count: 1000000000,
            capped: true,
          });
        }
  assert.equal(rows.length, 1440);
  const result = mobileWorkflowRead({ ...value, rows }, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.rows.length, 60);
  assert.ok(result.rows.every((entry) => entry.count === 24000000000));
});

test('gate, failed reads, aborts and permission loss do not release retained counts', async () => {
  let calls = 0,
    checks = 0;
  const app = {
    authorize: async () => authority(++checks < 2),
    command: async () => {
      calls++;
      return value;
    },
  };
  const off = createEmployeeMobileWorkflows(app);
  assert.equal((await off(testEmployee, signal)).enabled, false);
  assert.equal(calls, 0);
  checks = 0;
  await assert.rejects(createEmployeeMobileWorkflows(app, true)(testEmployee, signal), {
    status: 403,
  });
  const failed = createEmployeeMobileWorkflows(
    {
      authorize: async () => authority(),
      command: async () => {
        throw Error('private database diagnostic');
      },
    },
    true,
  );
  assert.deepEqual(await failed(testEmployee, signal), {
    source: 'device_reported',
    enabled: true,
  });
  await assert.rejects(failed(testEmployee, AbortSignal.abort()));
  const good = createEmployeeMobileWorkflows(
    { authorize: async () => authority(), command: async () => value },
    true,
  );
  assert.equal((await good(testEmployee, signal)).rows?.[0]?.count, 2);
  const disabled = createEmployeeMobileWorkflows(
    { authorize: async () => authority(), command: async () => ({ ...value, enabled: false }) },
    true,
  );
  assert.equal((await disabled(testEmployee, signal)).enabled, false);
});

test('adapter freezes default-off policy and pins MFA, empty arguments and exact read-only SQL', async () => {
  let calls = 0;
  const options = { mobileWorkflowReadsEnabled: false };
  const execute = async (role: string, sql: string) => {
    calls++;
    assert.equal(role, 'doji_employee_application');
    assert.equal(sql, employeeMobileWorkflowsSql);
    return value;
  };
  const off = createEmployeeApplicationAdapter(execute, options);
  options.mobileWorkflowReadsEnabled = true;
  const command = { name: 'get_admin_mobile_workflows_v1', args: {} };
  await assert.rejects(off.command(testEmployee, command, signal), { status: 403 });
  const on = createEmployeeApplicationAdapter(execute, options);
  await on.command(testEmployee, command, signal);
  await assert.rejects(
    on.command(testEmployee, { ...command, args: { actor: 'injected' } }, signal),
    { status: 400 },
  );
  await assert.rejects(
    Reflect.apply(on.command, on, [{ ...testEmployee, mfaVerified: false }, command, signal]),
    { status: 403 },
  );
  assert.equal(calls, 1);
});

test('cached health and local persona read the same optional data without legacy/provider fallbacks', async () => {
  for (const enabled of [false, true]) {
    const calls: string[] = [];
    const app = {
      authorize: async () => authority(),
      command: async (_actor: unknown, input: { name: string }) => {
        calls.push(input.name);
        return input.name === 'get_admin_mobile_workflows_v1' ? value : { enabled: false };
      },
    };
    const read = createEmployeeHealth(
      app,
      {},
      { healthSnapshotEnabled: true, mobileWorkflowReadsEnabled: enabled },
    );
    const result = await read(testEmployee, signal);
    assert.equal(calls.includes('get_admin_mobile_workflows_v1'), enabled);
    assert.equal(Object.hasOwn(result, 'mobile_workflows'), enabled);
    let allowed = true;
    const local = createDevelopmentHealth(
      async (token, call) => {
        assert.equal(token, 'synthetic');
        assert.equal(call.persona, 'persona');
        return {
          ok: true,
          result:
            call.name === 'get_admin_portal_session_v3'
              ? authority(allowed)
              : call.name === 'get_admin_mobile_workflows_v1'
                ? value
                : { enabled: false },
        };
      },
      {
        token: 'synthetic',
        environment: 'staging',
        organization: 'doji-i0',
        projectIds: ['4512328707342336'],
        projectSlugs: ['doji-staging'],
      },
      { healthSnapshotEnabled: true, mobileWorkflowReadsEnabled: enabled },
    );
    const call = {
      persona: 'persona',
      name: 'portal_platform_health_v1',
      args: {},
      requestId: 'synthetic',
    };
    assert.deepEqual(
      await local('synthetic', call, signal).then(
        (v) => (v as { result: Record<string, unknown> }).result.mobile_workflows,
      ),
      result.mobile_workflows,
    );
    allowed = false;
    await assert.rejects(local('synthetic', call, signal), { status: 403 });
  }
});
