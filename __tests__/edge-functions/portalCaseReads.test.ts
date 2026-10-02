import { handlePortalRead, portalRouteFor } from '../../infra/doji-orchestrator/src/portal-read';
import { authenticateEmployeePortalRequest, authenticateScaleReadRequest } from '../../infra/doji-orchestrator/src/scale-read-auth';

jest.mock('../../infra/doji-orchestrator/src/scale-read-auth', () => ({
  normalizedSupabaseUrl: () => 'https://offline-fixture.test',
  authenticateEmployeePortalRequest: jest.fn(),
  authenticateScaleReadRequest: jest.fn(),
}));
const env = { SUPABASE_URL: 'https://offline-fixture.test', SUPABASE_ANON_KEY: 'synthetic-public-key',
  OUTBOX_RELAY_SECRET: 'unused', ADMIN_PORTAL_EMPLOYEE_ACCOUNTS: 'true' };
const id = '11111111-1111-4111-8111-111111111111';
const auth = authenticateEmployeePortalRequest as jest.Mock;
const originalFetch = global.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  auth.mockResolvedValue({ userId: 'case-reader', token: 'synthetic-employee-jwt', aal: 'aal2' });
  global.fetch = jest.fn().mockResolvedValue(Response.json({ case_contract_version: 1 }));
  jest.spyOn(console,'info').mockImplementation(() => {});
  jest.spyOn(console,'error').mockImplementation(() => {});
});
afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

test.each([
  ['report-case-v3','get_admin_report_case_v3','p_report_id'],
  ['appeal-case','get_admin_appeal_case_v1','p_appeal_id'],
])('forwards %s only with the caller employee JWT and no caching', async (path,rpc,key) => {
  const response = await handlePortalRead(new Request(`https://api.test/portal/admin/${path}?id=${id}`),env);
  expect(response?.status).toBe(200);
  expect(response?.headers.get('cache-control')).toContain('no-store');
  expect(auth).toHaveBeenCalledTimes(1);
  expect(authenticateScaleReadRequest).not.toHaveBeenCalled();
  expect(global.fetch).toHaveBeenCalledWith(`https://offline-fixture.test/rest/v1/rpc/${rpc}`,expect.objectContaining({
    method:'POST',body:JSON.stringify({[key]:id}),headers:expect.objectContaining({
      authorization:'Bearer synthetic-employee-jwt',apikey:'synthetic-public-key',
    }),
  }));
});
test('retains old report routing for rollback', () => {
  expect(portalRouteFor(new URL('https://api.test/portal/admin/report-case'))?.rpc).toBe('get_admin_report_case_v2');
});
test.each(['','?id=bad',`?id=${id}&id=${id}`])('rejects malformed case IDs %s before upstream dispatch', async (query) => {
  const response = await handlePortalRead(new Request(`https://api.test/portal/admin/appeal-case${query}`),env);
  expect(response?.status).toBe(400); expect(global.fetch).not.toHaveBeenCalled();
});
test('does not expose new contracts in legacy member-auth mode', async () => {
  expect((await handlePortalRead(new Request(`https://api.test/portal/admin/appeal-case?id=${id}`),
    {...env,ADMIN_PORTAL_EMPLOYEE_ACCOUNTS:'false'}))?.status).toBe(403);
  expect(auth).not.toHaveBeenCalled(); expect(authenticateScaleReadRequest).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
});
test('requires AAL2 and refuses mutation methods', async () => {
  auth.mockResolvedValue({ userId:'aal1-reader',token:'synthetic-token',aal:'aal1' });
  const url = `https://api.test/portal/admin/appeal-case?id=${id}`;
  expect((await handlePortalRead(new Request(url),env))?.status).toBe(403);
  expect((await handlePortalRead(new Request(url,{method:'POST'}),env))?.status).toBe(405);
  expect(global.fetch).not.toHaveBeenCalled();
});
test('preserves authoritative database denial rather than replaying or using a cache', async () => {
  (global.fetch as jest.Mock).mockResolvedValue(Response.json({message:'Restricted safety authorization required'},{status:403}));
  expect((await handlePortalRead(new Request(`https://api.test/portal/admin/appeal-case?id=${id}`),env))?.status).toBe(403);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
