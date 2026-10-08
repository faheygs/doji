import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { recordEmployeeHealthObservation } from '../supabase/functions/operational-health/employee-health-observation.ts';
const source = readFileSync('supabase/functions/operational-health/index.ts', 'utf8').replace(
  /^import .*;\r?\n/gm,
  '',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
function fixture(enabled: boolean, failSource = false, failSidecar = false, failRuntime = false) {
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
      if (name === 'record_employee_health_change_v1')
        return {
          abortSignal: (signal: AbortSignal) => {
            assert.ok(signal instanceof AbortSignal);
            return failSidecar
              ? Promise.reject(Error('synthetic'))
              : Promise.resolve({ error: null });
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
