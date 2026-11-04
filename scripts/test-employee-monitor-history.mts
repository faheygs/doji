import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmployeeMonitorHistory } from '../infra/portal-identity/employee-monitor-history.mts';
import { createEmployeeApplicationAdapter } from '../infra/portal-identity/employee-application-adapter.mts';
import { createEmployeeHealth } from '../infra/portal-identity/employee-health.mts';
import { employeeMonitorHistorySql } from '../infra/portal-identity/employee-health-contracts.mts';
import { testEmployee } from './employee-test-fixtures.mts';
import { createDevelopmentHealth } from '../infra/portal-identity/admin-development-health.mts';
const signal = new AbortController().signal;
const authority = (allowed = true) => ({ capabilities: { operations_read: allowed } });
const value = { enabled: true, latest: [{ monitor: 'worker', observed_at: '2026-11-04T01:00:00Z' }, { monitor: 'watchdog', observed_at: null }], incidents: [] };
test('monitor read defaults off, requires operations and performs one fixed bounded read', async () => {
  let calls = 0, allowed = true;
  const app = { authorize: async () => authority(allowed), command: async (_actor: unknown, input: { name: string; args: Record<string, unknown> }) => {
    calls++; assert.equal(input.name, 'get_admin_monitor_history_v1'); assert.deepEqual(input.args, {}); return value;
  } };
  assert.deepEqual(await createEmployeeMonitorHistory(app)(testEmployee, signal), { enabled: false, available: false });
  assert.equal(calls, 0);
  const read = createEmployeeMonitorHistory(app, true);
  assert.deepEqual(await read(testEmployee, signal), { ...value, available: true, recent_limit: 25 });
  assert.equal(calls, 1);
  allowed = false;
  await assert.rejects(read(testEmployee, signal), { status: 403 }); assert.equal(calls, 1);
});
test('revocation and cancellation fence in-flight history; SQL errors stay unavailable not empty', async () => {
  let allowed = true;
  const revoked = createEmployeeMonitorHistory({ authorize: async () => authority(allowed), command: async () => { allowed = false; return value; } }, true);
  await assert.rejects(revoked(testEmployee, signal), { status: 403 });
  const failed = createEmployeeMonitorHistory({ authorize: async () => authority(), command: async () => { throw Error('private database error'); } }, true);
  assert.deepEqual(await failed(testEmployee, signal), { enabled: true, available: false });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(failed(testEmployee, controller.signal));
  for (const bad of [null, {}, { ...value, incidents: Array(26).fill({}) }, { ...value, latest: [] }, { ...value, private: 'a'.repeat(33000) }]) {
    const read = createEmployeeMonitorHistory({ authorize: async () => authority(), command: async () => bad }, true);
    assert.deepEqual(await read(testEmployee, signal), { enabled: true, available: false });
  }
});
test('adapter pins read-only SQL, empty arguments, MFA and immutable default-off gate', async () => {
  let calls = 0;
  const options = { monitorHistoryEnabled: false };
  const execute = async (role: string, sql: string) => { calls++; assert.equal(role, 'doji_employee_application'); assert.equal(sql, employeeMonitorHistorySql); return value; };
  const off = createEmployeeApplicationAdapter(execute, options); options.monitorHistoryEnabled = true;
  const command = { name: 'get_admin_monitor_history_v1', args: {} };
  await assert.rejects(off.command(testEmployee, command, signal), { status: 403 });
  const on = createEmployeeApplicationAdapter(execute, options);
  await on.command(testEmployee, command, signal);
  await assert.rejects(on.command(testEmployee, { ...command, args: { p_limit: 500 } }, signal), { status: 400 });
  await assert.rejects(Reflect.apply(on.command, on, [{ ...testEmployee, mfaVerified: false }, command, signal]), { status: 403 });
  assert.equal(calls, 1);
});
test('cached health connects retained history only when separately enabled; no aggregate fallback', async () => {
  const calls: string[] = [];
  const app = { authorize: async () => authority(), command: async (_actor: unknown, input: { name: string }) => {
    calls.push(input.name);
    if (input.name === 'get_admin_health_snapshot_v1') return { enabled: true };
    assert.equal(input.name, 'get_admin_monitor_history_v1'); return value;
  } };
  const read = createEmployeeHealth(app, {}, { healthSnapshotEnabled: true, monitorHistoryEnabled: true });
  const result = await read(testEmployee, signal);
  assert.deepEqual(calls, ['get_admin_health_snapshot_v1', 'get_admin_monitor_history_v1']);
  assert.deepEqual(result.monitor_history, { ...value, available: true, recent_limit: 25 });
});
test('local parity retains developer/persona authority, disabled defaults and revocation fences', async () => {
  const monitoring = { token: 'synthetic', environment: 'staging' as const, organization: 'doji-i0', projectIds: ['4512328707342336'], projectSlugs: ['doji-staging'] };
  for (const enabled of [false, true]) {
    let allowed = true;
    const calls: string[] = [];
    const invoke = createDevelopmentHealth(async (token, call) => {
      assert.equal(token, 'synthetic'); assert.equal(call.persona, 'synthetic-persona'); calls.push(call.name);
      return { ok: true, result: call.name === 'get_admin_portal_session_v3' ? authority(allowed)
        : call.name === 'get_admin_monitor_history_v1' ? value : { enabled: false } };
    }, monitoring, { healthSnapshotEnabled: true, monitorHistoryEnabled: enabled });
    const call = { persona: 'synthetic-persona', name: 'portal_platform_health_v1', args: {}, requestId: 'synthetic' };
    const result = await invoke('synthetic', call, signal);
    assert.equal(calls.includes('get_admin_monitor_history_v1'), enabled);
    assert.equal(JSON.stringify(result).includes('recent_limit'), enabled);
    allowed = false;
    await assert.rejects(invoke('synthetic', call, signal), { status: 403 });
  }
});
