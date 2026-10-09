import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmployeeApplicationAdapter } from '../infra/portal-identity-candidate/employee-application-adapter.mts';
import { employeeDirectRoute } from '../infra/portal-identity-candidate/employee-direct-routes.mts';
import { employeeAnnouncementSql } from '../infra/portal-identity-candidate/employee-announcement-contracts.mts';
import { testEmployee as actor } from './employee-test-fixtures.mts';
for (const [code, status] of [
  ['40001', 409],
  ['P0001', 400],
] as const) {
  test('announcement SQL rejection ' + code + ' is definite and sanitized', async () => {
    const adapter = createEmployeeApplicationAdapter(
      async () => {
        throw { code, message: 'sensitive database text' };
      },
      { announcementComposeEnabled: true },
    );
    await assert.rejects(adapter.command(actor, input, new AbortController().signal), {
      status,
      message: 'Employee operation unavailable',
    });
  });
}
const input = {
  name: 'admin_announcement_compose_v1',
  args: {
    p_action: 'publish',
    p_id: null,
    p_version: null,
    p_input: {},
    p_request_id: '10000000-0000-4000-8000-000000000001',
  },
};
test('compose requires explicit browser and server gates', async () => {
  assert.throws(() => employeeDirectRoute('/announcements/compose', 'POST', {}), { status: 403 });
  assert.equal(
    employeeDirectRoute('/announcements/compose', 'POST', { announcementComposeEnabled: true }),
    input.name,
  );
  const adapter = createEmployeeApplicationAdapter(async () => assert.fail('No SQL'));
  await assert.rejects(adapter.command(actor, input, new AbortController().signal), {
    status: 403,
  });
});
test('enabled compose uses only one fixed employee bridge; rejects actors and fields', async () => {
  let count = 0;
  const adapter = createEmployeeApplicationAdapter(
    async (role, sql, args) => {
      count++;
      assert.equal(role, 'doji_employee_application');
      assert.equal(sql, employeeAnnouncementSql);
      assert.deepEqual(JSON.parse(String(args[6])), input.args);
      return { recorded: true };
    },
    { announcementComposeEnabled: true },
  );
  await adapter.command(actor, input, new AbortController().signal);
  assert.equal(count, 1);
  await assert.rejects(
    // @ts-expect-error Exercise runtime rejection of an unverified actor.
    adapter.command({ ...actor, mfaVerified: false }, input, new AbortController().signal),
    { status: 403 },
  );
  await assert.rejects(
    adapter.command(
      actor,
      { ...input, args: { ...input.args, actor_id: 'forged' } },
      new AbortController().signal,
    ),
    { status: 400 },
  );
  assert.equal(count, 1);
});
