import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmployeeApplicationAdapter } from '../infra/portal-identity-candidate/employee-application-adapter.mts';
import { employeeDirectRoute } from '../infra/portal-identity-candidate/employee-direct-routes.mts';
import { employeeHistorySql } from '../infra/portal-identity-candidate/employee-history-contracts.mts';
import { testEmployee } from './employee-test-fixtures.mts';
const personal = {
  name: 'get_admin_personal_work_page_v1',
  args: { p_kind: 'all', p_state: 'completed', p_limit: 5, p_after_at: null, p_after_key: null },
};
const announcement = {
  name: 'get_admin_announcement_lifecycle_page_v1',
  args: { p_filter: 'active', p_limit: 25, p_before_at: null, p_before_id: null },
};
test('history requires browser and immutable server gates; legacy routes stay unchanged', async () => {
  for (const path of ['/staff-workflow/personal', '/announcements/lifecycle']) {
    assert.throws(() => employeeDirectRoute(path, 'POST', {}), { status: 403 });
    assert.ok(
      employeeDirectRoute(path, 'POST', { historyReadsEnabled: true, staffWorkflowEnabled: true }),
    );
    assert.throws(() => employeeDirectRoute(path, 'GET', { historyReadsEnabled: true }), {
      status: 400,
    });
  }
  const options = { historyReadsEnabled: false };
  const adapter = createEmployeeApplicationAdapter(async () => assert.fail('No SQL'), options);
  options.historyReadsEnabled = true;
  for (const input of [personal, announcement])
    await assert.rejects(adapter.command(testEmployee, input, new AbortController().signal), {
      status: 403,
    });
});
test('history uses only the new fixed employee read bridge', async () => {
  let calls = 0;
  const adapter = createEmployeeApplicationAdapter(
    async (role, sql, args) => {
      calls++;
      assert.equal(role, 'doji_employee_application');
      assert.equal(sql, employeeHistorySql);
      assert.equal(args[2], testEmployee.subject);
      return {};
    },
    { historyReadsEnabled: true },
  );
  for (const input of [personal, announcement])
    await adapter.command(testEmployee, input, new AbortController().signal);
  assert.equal(calls, 2);
  for (const args of [
    { ...personal.args, p_filter: 'all' },
    { ...personal.args, actor_id: 'forged' },
    { ...personal.args, p_limit: 26 },
    { ...personal.args, p_limit: null },
    { ...personal.args, p_limit: 5.5 },
  ]) {
    await assert.rejects(
      adapter.command(testEmployee, { ...personal, args }, new AbortController().signal),
      { status: 400 },
    );
  }
  await assert.rejects(
    adapter.command(
      { ...testEmployee, subject: 'invalid' },
      personal,
      new AbortController().signal,
    ),
    { status: 403 },
  );
  await assert.rejects(
    // @ts-expect-error Runtime test of another realm, never a verified employee.
    adapter.command({ ...testEmployee, realm: 'business' }, personal, new AbortController().signal),
    { status: 403 },
  );
  assert.equal(calls, 2);
});
test('history errors are sanitized; commands remain unavailable', async () => {
  const adapter = createEmployeeApplicationAdapter(
    async () => {
      throw { code: '55000', message: 'private' };
    },
    { historyReadsEnabled: true },
  );
  await assert.rejects(adapter.command(testEmployee, personal, new AbortController().signal), {
    status: 409,
    message: 'Employee operation unavailable',
  });
  await assert.rejects(
    adapter.command(
      testEmployee,
      { name: 'admin_announcement_compose_v1', args: {} },
      new AbortController().signal,
    ),
    { status: 403 },
  );
});
