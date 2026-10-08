import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmployeeApplicationAdapter } from '../infra/portal-identity-candidate/employee-application-adapter.mts';
import {
  employeeWorkflowContracts,
  employeeWorkflowSql,
} from '../infra/portal-identity-candidate/employee-workflow-contracts.mts';
import {
  createRestrictedSql,
  type RestrictedSqlConfig,
} from '../infra/portal-identity-candidate/restricted-sql.mts';
import { testEmployee as actor } from './employee-test-fixtures.mts';
import type { PortalExecute } from '../infra/portal-identity-candidate/employee-contracts.mts';

const id = '99000000-0000-4000-8000-000000000001';
const examples: Record<string, Record<string, unknown>> = {
  get_admin_safety_work_page_v1: { p_queue: 'moderation' },
  get_admin_staff_work_page_v1: {},
  get_admin_staff_event_channels_v1: {},
  get_admin_case_ownership_v1: { p_kind: 'suggestion', p_id: id },
  get_admin_owned_work_page_v1: {},
  get_admin_case_assignees_v1: { p_kind: 'business_application', p_id: id },
  admin_case_ownership_command_v1: {
    p_kind: 'suggestion',
    p_id: id,
    p_revision: 3,
    p_source_version: 'abc',
    p_action: 'claim',
    p_target: null,
    p_request_id: id,
  },
};
for (const [name, args] of Object.entries(examples)) {
  test(`${name}: one fixed bridge call, unchanged identity and explicit defaults`, async () => {
    const calls: Parameters<PortalExecute>[] = [];
    const adapter = createEmployeeApplicationAdapter(async (...params) => {
      calls.push(params);
      return { ok: true };
    });
    const signal = AbortSignal.timeout(1000);
    await adapter.command(actor, { name, args }, signal);
    assert.equal(calls.length, 1);
    const call = calls[0]!;
    assert.equal(call[0], 'doji_employee_application');
    assert.equal(call[1], employeeWorkflowSql);
    assert.equal(call[3], signal);
    assert.deepEqual(call[2], [
      actor.issuer,
      actor.audience,
      actor.subject,
      actor.sessionId,
      true,
      name,
      JSON.stringify({ ...employeeWorkflowContracts[name]!.defaults, ...args }),
    ]);
  });
  test(`${name}: no actor/role injection, missing authentication or automatic retry`, async () => {
    const denied = createEmployeeApplicationAdapter(() => assert.fail('must not execute'));
    await assert.rejects(
      denied.command(actor, { name, args: { ...args, actor_id: id } }, AbortSignal.timeout(1000)),
      { status: 400 },
    );
    await assert.rejects(
      Reflect.apply(denied.command, denied, [
        { ...actor, mfaVerified: false },
        { name, args },
        AbortSignal.timeout(1000),
      ]),
      { status: 403 },
    );
    let calls = 0;
    const uncertain = createEmployeeApplicationAdapter(async () => {
      calls++;
      throw Error('private connection detail');
    });
    await assert.rejects(uncertain.command(actor, { name, args }, AbortSignal.timeout(1000)), {
      status: 503,
      message: 'Employee operation unavailable',
    });
    assert.equal(calls, 1);
  });
}
test('workflow contracts reject malformed revisions, IDs, page limits and timestamps before SQL', async () => {
  const adapter = createEmployeeApplicationAdapter(() => assert.fail('must not execute'));
  const cases: [string, Record<string, unknown>][] = [
    [
      'admin_case_ownership_command_v1',
      { ...examples.admin_case_ownership_command_v1, p_revision: 1.5 },
    ],
    [
      'admin_case_ownership_command_v1',
      { ...examples.admin_case_ownership_command_v1, p_request_id: 'bad' },
    ],
    ['get_admin_case_assignees_v1', { ...examples.get_admin_case_assignees_v1, p_limit: 51 }],
    ['get_admin_owned_work_page_v1', { p_after_at: 'not-a-timestamp' }],
    ['get_admin_owned_work_page_v1', { p_after_key: 'x'.repeat(17000) }],
  ];
  for (const [name, args] of cases)
    await assert.rejects(adapter.command(actor, { name, args }, AbortSignal.timeout(1000)), {
      status: 400,
    });
});
test('workflow contract tables and every nested specification are immutable', () => {
  assert.ok(Object.isFrozen(employeeWorkflowContracts));
  for (const value of Object.values(employeeWorkflowContracts))
    for (const part of [value, value.fields, value.types, value.defaults])
      assert.ok(Object.isFrozen(part));
});

const config: RestrictedSqlConfig = {
  realm: 'employee',
  host: 'aws-0-test.pooler.supabase.com',
  projectRef: 'a'.repeat(20),
  port: 6543,
  database: 'postgres',
  username: 'doji_employee_portal_login.' + 'a'.repeat(20),
  password: 'synthetic-only-'.repeat(4),
};
test('workflow SQL allowed only in employee application role; business cannot open a socket', async () => {
  let connections = 0;
  const queries: unknown[] = [];
  const execute = createRestrictedSql(config, () => ({
    async connect() {
      connections++;
    },
    async end() {},
    async query(input) {
      queries.push(input);
      if (typeof input === 'string' && input.startsWith('begin isolation'))
        return [
          {},
          {},
          {},
          {},
          {
            rows: [
              {
                login: 'doji_employee_portal_login',
                current_role: 'doji_employee_portal_login',
                privileged: false,
                inherits: false,
                permitted: true,
              },
            ],
          },
        ];
      return typeof input === 'object' ? { rows: [{ result: { ok: true } }] } : { rows: [] };
    },
  }));
  const params = [
    actor.issuer,
    actor.audience,
    actor.subject,
    actor.sessionId,
    true,
    'get_admin_owned_work_page_v1',
    '{}',
  ];
  assert.deepEqual(
    await execute(
      'doji_employee_application',
      employeeWorkflowSql,
      params,
      AbortSignal.timeout(1000),
    ),
    { ok: true },
  );
  assert.equal(connections, 1);
  assert.deepEqual(queries[2], { text: employeeWorkflowSql, values: params });
  assert.equal(queries[3], 'commit');
  for (const [role, sql] of [
    ['doji_employee_session', employeeWorkflowSql],
    ['doji_employee_application', employeeWorkflowSql + '; select 1'],
  ])
    await assert.rejects(execute(role!, sql!, params, AbortSignal.timeout(1000)));
  assert.equal(connections, 1);
  const business = createRestrictedSql(
    { ...config, realm: 'business', username: 'doji_business_portal_login.' + 'a'.repeat(20) },
    () => assert.fail('must not open socket'),
  );
  await assert.rejects(
    business('doji_employee_application', employeeWorkflowSql, params, AbortSignal.timeout(1000)),
  );
});
