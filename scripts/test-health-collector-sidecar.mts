import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { recordEmployeeHealthObservation } from '../supabase/functions/operational-health/employee-health-observation.ts';
import { captureEmployeeHealthSnapshot } from '../supabase/functions/operational-health/employee-health-snapshot.ts';
import { handleMonitorHistoryRequest } from '../supabase/functions/operational-health/monitor-history.ts';
const source = readFileSync('supabase/functions/operational-health/index.ts', 'utf8').replace(
  /^import .*;\r?\n/gm,
  '',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
function fixture(
  enabled: boolean,
  failSource = false,
  failSidecar = false,
  failRuntime = false,
  snapshot = false,
) {
  let handler: ((r: Request) => Promise<Response>) | undefined;
  const calls: string[] = [],
    pending: Promise<unknown>[] = [],
    warnings: string[] = [];
  const database = {
    rpc: (name: string) => {
      calls.push(name);
      const value = {
        data:
          name === 'get_operational_health'
            ? { checked_at: new Date().toISOString(), healthy: true }
            : name === 'get_repairable_doji_alarms'
              ? []
              : 0,
        error:
          failSource && name === 'get_operational_health'
            ? { message: 'synthetic health unavailable' }
            : null,
      };
      if (
        ['record_employee_health_change_v1', 'capture_employee_health_snapshot_v1'].includes(name)
      )
        return {
          abortSignal: (signal: AbortSignal) => {
            assert.ok(signal instanceof AbortSignal);
            return failSidecar
              ? Promise.reject(Error('synthetic'))
              : Promise.resolve({ error: null, data: true });
          },
        };
      return Promise.resolve(value);
    },
  };
  const deno = {
    env: {
      get: (key: string) =>
        ({
          OUTBOX_RELAY_SECRET: 'synthetic-secret',
          EMPLOYEE_HEALTH_EVENTS_ENABLED: String(enabled),
          EMPLOYEE_HEALTH_SNAPSHOT_ENABLED: String(snapshot),
          EMPLOYEE_HEALTH_SNAPSHOT_ENVIRONMENT: 'staging',
          SUPABASE_URL: 'https://ohrcupagdoilkwhecict.supabase.co',
        })[key as 'OUTBOX_RELAY_SECRET'],
    },
    serve: (fn: typeof handler) => {
      handler = fn;
    },
  };
  new Function(
    'Deno',
    'createClient',
    'EdgeRuntime',
    'recordEmployeeHealthObservation',
    'captureEmployeeHealthSnapshot',
    'handleMonitorHistoryRequest',
    'console',
    compiled,
  )(
    deno,
    () => database,
    {
      waitUntil: (p: Promise<unknown>) => {
        pending.push(p);
        if (failRuntime) throw Error('synthetic unavailable');
      },
    },
    recordEmployeeHealthObservation,
    captureEmployeeHealthSnapshot,
    handleMonitorHistoryRequest,
    { warn: (s: string) => warnings.push(s) },
  );
  return {
    calls,
    pending,
    warnings,
    run: (authorized = true) => {
      assert.ok(handler);
      return handler(
        new Request('https://local.test/', {
          headers: authorized ? { 'x-outbox-secret': 'synthetic-secret' } : {},
        }),
      );
    },
  };
}
test('collector default-off retains its exact three bounded reads and no sidecar', async () => {
  const f = fixture(false);
  const result = await f.run();
  assert.equal(result.status, 200);
  assert.deepEqual(f.calls, [
    'get_operational_health',
    'get_repairable_doji_alarms',
    'refresh_daily_event_health_snapshots_v1',
  ]);
  assert.equal(f.pending.length, 0);
});
test('collector rejects unauthorized request before any database work', async () => {
  const f = fixture(true);
  assert.equal((await f.run(false)).status, 401);
  assert.equal(f.calls.length, 0);
});
test('collector does not publish when the authoritative health read fails', async () => {
  const f = fixture(true, true);
  assert.equal((await f.run()).status, 500);
  assert.equal(f.pending.length, 0);
});
for (const runtime of [false, true])
  test(`sidecar failure does not fail original repair response; runtime failure=${runtime}`, async () => {
    const f = fixture(true, false, true, runtime);
    const response = await f.run();
    assert.equal(response.status, 200);
    const body = (await response.json()) as { healthy: boolean; alarm_repairs: unknown[] };
    assert.equal(body.healthy, true);
    assert.deepEqual(body.alarm_repairs, []);
    await Promise.all(f.pending);
    assert.equal(f.calls.filter((c) => c === 'record_employee_health_change_v1').length, 1);
    assert.deepEqual(f.warnings, runtime ? ['employee_health_sidecar_unavailable'] : []);
  });
test('snapshot collector adds one write, no new health scans or event publications', async () => {
  const f = fixture(false, false, false, false, true);
  assert.equal((await f.run()).status, 200);
  await Promise.all(f.pending);
  assert.deepEqual(f.calls, [
    'get_operational_health',
    'get_repairable_doji_alarms',
    'refresh_daily_event_health_snapshots_v1',
    'capture_employee_health_snapshot_v1',
  ]);
});
test('conflicting health modes fail closed without breaking member recovery', async () => {
  const f = fixture(true, false, false, false, true);
  assert.equal((await f.run()).status, 200);
  assert.equal(f.pending.length, 0);
  assert.equal(f.calls.length, 3);
  assert.deepEqual(f.warnings, ['employee_health_modes_conflict']);
});
test('snapshot failures cannot change recovery response or retry the write', async () => {
  const f = fixture(false, false, true, false, true);
  assert.equal((await f.run()).status, 200);
  await Promise.all(f.pending);
  assert.equal(f.calls.filter((c) => c === 'capture_employee_health_snapshot_v1').length, 1);
});
test('snapshot sidecar runtime failure cannot alter recovery, and failed/unauthorized reads never capture', async () => {
  const f = fixture(false, false, false, true, true);
  assert.equal((await f.run()).status, 200);
  await Promise.all(f.pending);
  assert.deepEqual(f.warnings, ['employee_health_snapshot_sidecar_unavailable']);
  const failed = fixture(false, true, false, false, true);
  assert.equal((await failed.run()).status, 500);
  assert.equal(failed.pending.length, 0);
  const unauthorized = fixture(false, false, false, false, true);
  assert.equal((await unauthorized.run(false)).status, 401);
  assert.equal(unauthorized.calls.length, 0);
});
const snapshotConfig = {
  enabled: true,
  eventsEnabled: false,
  environment: 'staging',
  supabaseUrl: 'https://ohrcupagdoilkwhecict.supabase.co',
};
test('snapshot rejects disabled, mixed-environment, ambiguous modes before SQL', async () => {
  for (const patch of [
    { enabled: false },
    { eventsEnabled: true },
    { environment: 'development' },
    { environment: 'production' },
    { supabaseUrl: 'https://tvixsmqxotuvyjqzmjla.supabase.co' },
    { supabaseUrl: snapshotConfig.supabaseUrl + '/untrusted' },
  ]) {
    assert.equal(
      await captureEmployeeHealthSnapshot({ ...snapshotConfig, ...patch }, {}, () => {
        assert.fail('No database call permitted');
      }),
      false,
    );
  }
});
test('snapshot requires a definite stored acknowledgment; no retries on uncertain failure', async () => {
  for (const result of [{ data: true }, { data: false }, { data: true, error: 'synthetic' }, {}]) {
    let calls = 0;
    const stored = await captureEmployeeHealthSnapshot(
      snapshotConfig,
      { healthy: true },
      (args, signal) => {
        calls++;
        assert.equal(args.p_project_ref, 'ohrcupagdoilkwhecict');
        assert.deepEqual(args.p_health, { healthy: true });
        assert.equal(signal.aborted, false);
        return Promise.resolve(result);
      },
    );
    assert.equal(calls, 1);
    assert.equal(stored, result.data === true && !('error' in result));
  }
  assert.equal(
    await captureEmployeeHealthSnapshot(snapshotConfig, {}, () => {
      throw Error('synthetic');
    }),
    false,
  );
});
test('snapshot deadline also bounds a database transport ignoring abort', async () => {
  let observed: AbortSignal | undefined;
  let finish: ((value: { data: boolean }) => void) | undefined;
  const result = await captureEmployeeHealthSnapshot(snapshotConfig, {}, (_args, signal) => {
    observed = signal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  assert.equal(result, false);
  assert.equal(observed?.aborted, true);
  finish?.({ data: true });
});
