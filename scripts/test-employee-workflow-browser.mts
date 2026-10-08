// Synthetic HTTP only. Does not contact a portal, identity provider or database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmployeeBrowserTransport } from '../infra/portal-identity-candidate/employee-browser-transport.mts';
const paths = {
  '/staff-workflow/safety': 'get_admin_safety_work_page_v1',
  '/staff-workflow/page': 'get_admin_owned_work_page_v1',
  '/staff-workflow/inbox': 'get_admin_staff_work_page_v1',
  '/staff-workflow/channels': 'get_admin_staff_event_channels_v1',
  '/staff-workflow/ownership': 'get_admin_case_ownership_v1',
  '/staff-workflow/command': 'admin_case_ownership_command_v1',
  '/staff-workflow/assignees': 'get_admin_case_assignees_v1',
};
function fixture(enabled = false, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const client = createEmployeeBrowserTransport(
    { independentEmployeeIdentity: true, staffWorkflowEnabled: enabled },
    {
      origin: 'https://admin.dojipro.com',
      upstream: async (url, init) => {
        calls.push({ url, init: init ?? {} });
        return url.endsWith('/api/session')
          ? Response.json({
              signedIn: true,
              assurance: 'aal2',
              csrf: 'c'.repeat(43),
              operator: { user_id: 'synthetic-staff' },
            })
          : Response.json({ ok: status === 200 }, { status });
      },
    },
  );
  return { calls, client };
}
for (const [path, name] of Object.entries(paths)) {
  test(`${path} disabled without flag; no provider or database requests`, async () => {
    const f = fixture();
    await assert.rejects(f.client.request(path, { method: 'POST' }), { status: 403 });
    assert.equal(f.calls.length, 0);
  });
  test(`${path} needs session and POST, sends CSRF and cookie only to fixed same-origin endpoint`, async () => {
    const f = fixture(true);
    await assert.rejects(f.client.request(path, { method: 'POST' }), { status: 401 });
    assert.equal(f.calls.length, 0);
    await f.client.session();
    await assert.rejects(f.client.request(path), { status: 400 });
    assert.equal(f.calls.length, 1);
    const body = { p_kind: 'suggestion', p_id: 'synthetic-id' };
    await f.client.request(path, { method: 'POST', body });
    const request = f.calls[1]!;
    assert.equal(request.url, 'https://admin.dojipro.com/api/rpc');
    assert.equal(request.init.credentials, 'same-origin');
    assert.equal(request.init.cache, 'no-store');
    assert.equal(request.init.redirect, 'error');
    assert.equal(new Headers(request.init.headers).get('x-doji-csrf'), 'c'.repeat(43));
    assert.deepEqual(JSON.parse(String(request.init.body)), { name, args: body });
  });
}
for (const status of [403, 409, 503])
  test(`ownership failure ${status} is not retried automatically`, async () => {
    const f = fixture(true, status);
    await f.client.session();
    await assert.rejects(
      f.client.request('/staff-workflow/command', {
        method: 'POST',
        body: { p_request_id: 'same-intent' },
      }),
      { status },
    );
    assert.equal(f.calls.filter((c) => c.url.endsWith('/api/rpc')).length, 1);
  });
test('unknown workflow routes cannot select an RPC or another origin', async () => {
  const f = fixture(true);
  await f.client.session();
  for (const path of [
    '/staff-workflow/delete_account',
    'https://elsewhere.invalid/staff-workflow/command',
  ])
    await assert.rejects(f.client.request(path, { method: 'POST' }));
  assert.equal(f.calls.length, 1);
});
