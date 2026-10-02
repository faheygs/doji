import { handlePortalRead, portalRouteFor } from '../../infra/doji-orchestrator/src/portal-read';
import {
  authenticateEmployeePortalRequest,
  authenticateScaleReadRequest,
} from '../../infra/doji-orchestrator/src/scale-read-auth';
jest.mock('../../infra/doji-orchestrator/src/scale-read-auth', () => ({
  normalizedSupabaseUrl: () => 'https://offline.test',
  authenticateEmployeePortalRequest: jest.fn(),
  authenticateScaleReadRequest: jest.fn(),
}));
const env = {
  SUPABASE_URL: 'https://offline.test',
  SUPABASE_ANON_KEY: 'public-test-key',
  OUTBOX_RELAY_SECRET: 'unused',
  ADMIN_PORTAL_EMPLOYEE_ACCOUNTS: 'true',
};
const id = '11111111-1111-4111-8111-111111111111';
const originalFetch = global.fetch;
const command = {
  kind: 'suggestions',
  action: 'approved',
  id,
  version: 'a'.repeat(32),
  input: {},
  reason: 'Reviewed exact choices',
  idempotencyKey: 'test-editorial-idempotency',
};
beforeEach(() => {
  jest.clearAllMocks();
  (authenticateEmployeePortalRequest as jest.Mock).mockResolvedValue({
    userId: 'editorial-test',
    token: 'employee-jwt',
    aal: 'aal2',
  });
  global.fetch = jest.fn().mockResolvedValue(Response.json({ id }));
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});
test('routes staff command using employee JWT and preserves explicit input', async () => {
  const response = await handlePortalRead(
    new Request('https://api.test/portal/admin/editorial-command', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(command),
    }),
    env,
  );
  expect(response?.status).toBe(200);
  expect(response?.headers.get('cache-control')).toContain('no-store');
  expect(global.fetch).toHaveBeenCalledWith(
    'https://offline.test/rest/v1/rpc/admin_editorial_command_v1',
    expect.objectContaining({
      body: JSON.stringify({
        p_kind: 'suggestions',
        p_action: 'approved',
        p_id: id,
        p_version: command.version,
        p_input: {},
        p_reason: command.reason,
        p_idempotency_key: command.idempotencyKey,
      }),
      headers: expect.objectContaining({
        authorization: 'Bearer employee-jwt',
        apikey: 'public-test-key',
      }),
    }),
  );
  expect(authenticateScaleReadRequest).not.toHaveBeenCalled();
});
test.each([
  'editorial-page?kind=announcements',
  'editorial-item?kind=suggestions&id=' + id,
  'editorial-command',
])('all new routes are employee-only: %s', async (path) => {
  const response = await handlePortalRead(
    new Request(
      'https://api.test/portal/admin/' + path,
      path === 'editorial-command' ? { method: 'POST', body: JSON.stringify(command) } : {},
    ),
    { ...env, ADMIN_PORTAL_EMPLOYEE_ACCOUNTS: 'false' },
  );
  expect(response?.status).toBe(403);
  expect(global.fetch).not.toHaveBeenCalled();
});
test.each([
  { action: 'drop' },
  { version: 'stale' },
  { id: 'bad' },
  { reason: 'x' },
  { input: [] },
  { idempotencyKey: 'short' },
])('rejects malformed command %j', (patch) => {
  const route = portalRouteFor(new URL('https://api.test/portal/admin/editorial-command'))!;
  expect(() => route.args(new URL('https://api.test'), { ...command, ...patch })).toThrow();
});

test('reopen is allowlisted only for employee community ideas', () => {
  const url = new URL('https://api.test/portal/admin/editorial-command');
  const route = portalRouteFor(url)!;
  expect(route.args(url, { ...command, action: 'pending' })).toMatchObject({ p_action: 'pending' });
  expect(() => route.args(url, { ...command, kind: 'announcements', action: 'pending' })).toThrow();
});
test.each([
  '?kind=bad',
  '?kind=suggestions&limit=999',
  '?kind=suggestions&beforeAt=2026-09-01',
  '?kind=suggestions&beforeAt=bad&beforeId=' + id,
])('rejects invalid bounded read %s', (query) => {
  const url = new URL('https://api.test/portal/admin/editorial-page' + query);
  expect(() => portalRouteFor(url)!.args(url, {})).toThrow();
});
test('accepts only explicit cursor fields and bounded limits', () => {
  const url = new URL(
    'https://api.test/portal/admin/editorial-page?kind=suggestions&limit=25&beforeAt=2026-09-01&beforeId=' +
      id,
  );
  expect(portalRouteFor(url)!.args(url, {})).toEqual({
    p_kind: 'suggestions',
    p_limit: 25,
    p_before_at: '2026-09-01',
    p_before_id: id,
    p_filter: 'all',
  });
});
