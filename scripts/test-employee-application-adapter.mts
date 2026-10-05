import test from 'node:test';
import assert from 'node:assert/strict';
import { employeeRouteContracts } from '../infra/portal-identity-candidate/employee-route-contracts.mts';
import {
  createEmployeeApplicationAdapter,
  employeeOperations,
} from '../infra/portal-identity-candidate/employee-application-adapter.mts';
import type { PortalExecute } from '../infra/portal-identity-candidate/employee-contracts.mts';
import { testEmployee as actor, present, testRecord } from './employee-test-fixtures.mts';
const parse = (value: unknown): unknown => {
  assert.equal(typeof value, 'string');
  if (typeof value !== 'string') throw Error('Expected JSON parameter');
  return JSON.parse(value);
};
const signal = () => AbortSignal.timeout(2000);
test('session uses fixed role, SQL and verified subject, not browser ID', async () => {
  const calls: Parameters<PortalExecute>[] = [];
  const a = createEmployeeApplicationAdapter(async (...args) => {
    calls.push(args);
    return { user_id: 'resolved' };
  });
  assert.deepEqual(await a.authorize(actor, signal()), { user_id: 'resolved' });
  const first = present(calls[0]);
  assert.equal(first[0], 'doji_employee_application');
  assert.equal(
    first[1],
    'select portal_identity_private.employee_rpc_v1($1,$2,$3,$4,$5,$6,$7::jsonb) as result',
  );
  assert.deepEqual(first[2], [
    actor.issuer,
    actor.audience,
    actor.subject,
    actor.sessionId,
    true,
    'get_admin_portal_session_v3',
    '{}',
  ]);
});
for (const [label, patch] of Object.entries({
  business: { realm: 'business' },
  noMfa: { mfaVerified: false },
  wrongIssuer: { issuer: 'https://attacker.invalid' },
  badSubject: { subject: 'uuid' },
  badSession: { sessionId: 'session_;sql' },
  badAudience: { audience: 'member' },
}))
  test(`rejects ${label} before SQL`, async () => {
    const a = createEmployeeApplicationAdapter(() => assert.fail('must not execute'));
    await assert.rejects(Reflect.apply(a.authorize, a, [{ ...actor, ...patch }, signal()]), {
      status: 403,
    });
  });
for (const name of [
  'delete_account',
  'resolve_identity',
  'constructor',
  '__proto__',
  'get_admin_portal_session_v3;select 1',
])
  test(`rejects operation ${name}`, async () => {
    const a = createEmployeeApplicationAdapter(() => assert.fail('must not execute'));
    await assert.rejects(a.command(actor, { name, args: {} }, signal()), { status: 403 });
  });
test('rejects caller claim/ID injection and missing fields', async () => {
  const a = createEmployeeApplicationAdapter(() => assert.fail('must not execute'));
  for (const args of [{ sub: 'victim' }, { p_report_id: 'x', actor_id: 'victim' }, {}])
    await assert.rejects(a.command(actor, { name: 'get_admin_report_case_v3', args }, signal()), {
      status: 400,
    });
});
test('each allowlisted command preserves one SQL call and arguments', async () => {
  for (const [name, fields] of Object.entries(employeeOperations)) {
    let count = 0;
    const args = Object.fromEntries(fields.map((k) => [k, null]));
    const a = createEmployeeApplicationAdapter(async (_role, _sql, p) => {
      count++;
      assert.equal(p[5], name);
      assert.deepEqual(parse(p[6]), args);
      return true;
    });
    assert.equal(await a.command(actor, { name, args }, signal()), true);
    assert.equal(count, 1);
  }
});
test('sanitizes database error details', async () => {
  for (const [code, status] of [
    ['42501', 403],
    ['PT409', 409],
    ['23505', 503],
  ]) {
    const a = createEmployeeApplicationAdapter(() => {
      throw Object.assign(Error('secret database body'), { code });
    });
    await assert.rejects(
      a.authorize(actor, signal()),
      (e: unknown) =>
        testRecord(e).status === status && e instanceof Error && !e.message.includes('secret'),
    );
  }
});
test('aborted request never starts SQL', async () => {
  const a = createEmployeeApplicationAdapter(() => assert.fail('must not execute'));
  await assert.rejects(a.authorize(actor, AbortSignal.abort()), { status: 503 });
});

test('omitted optional arguments use captured RPC defaults, not invented values', async () => {
  for (const [name, contract] of Object.entries(employeeRouteContracts)) {
    const required = Object.fromEntries(
      contract.fields.filter((k) => !Object.hasOwn(contract.defaults, k)).map((k) => [k, null]),
    );
    const a = createEmployeeApplicationAdapter(async (_role, _sql, p) => parse(p[6]));
    assert.deepEqual(await a.command(actor, { name, args: required }, signal()), {
      ...contract.defaults,
      ...required,
    });
  }
});
test('invalid typed arguments and unbounded requests are rejected before SQL', async () => {
  const a = createEmployeeApplicationAdapter(() => assert.fail('must not execute'));
  const cases = [
    ['get_admin_report_case_v3', { p_report_id: 'not-a-uuid' }],
    ['get_admin_event_health_history_v1', { p_limit: 51 }],
    ['get_admin_event_health_history_v1', { p_limit: 0 }],
    ['get_admin_event_health_history_v1', { p_limit: 1.5 }],
    ['get_admin_event_health_history_v1', { p_limit: '10' }],
    ['get_admin_safety_removals_v1', { p_closed: 'false' }],
    ['get_admin_audit_page_v2', { p_before_occurred_at: 'invalid' }],
    ['get_admin_audit_page_v2', { p_search: 'x'.repeat(17000) }],
    ['get_admin_audit_page_v2', { p_search: 'x\0y' }],
  ] as const;
  for (const [name, args] of cases)
    await assert.rejects(a.command(actor, { name, args }, signal()), { status: 400 });
});
test('contracts and nested defaults cannot be changed by a consumer', () => {
  assert.throws(() => {
    const defaults = present(employeeRouteContracts.get_admin_event_health_history_v1).defaults;
    Object.defineProperty(defaults, 'p_limit', { value: 500 });
  }, TypeError);
  assert.throws(() => {
    Reflect.apply(Array.prototype.push, present(employeeOperations.get_admin_portal_session_v3), [
      'sub',
    ]);
  }, TypeError);
});
