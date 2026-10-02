import { signInEmployee, type EmployeeSigninEnv } from '../../supabase/functions/_shared/employee-signin';

const env: EmployeeSigninEnv = { enabled: true, origin: 'https://admin.example.test', supabaseUrl: 'https://project.example.test', anonKey: 'sb_publishable_test', serviceKey: 'sb_secret_test' };
const details = { email: 'employee@example.test', password: 'password-for-tests' };
const request = (body: unknown = details, origin = env.origin) => new Request(`${env.supabaseUrl}/functions/v1/employee-signin`, {
  method: 'POST', headers: { origin }, body: JSON.stringify(body),
});

test('disabled and foreign-origin sign-in never touch Auth', async () => {
  const fetcher = jest.fn();
  expect((await signInEmployee(request(), { ...env, enabled: false }, fetcher)).status).toBe(404);
  expect((await signInEmployee(request(details, 'https://other.test'), env, fetcher)).status).toBe(403);
  expect(fetcher).not.toHaveBeenCalled();
});
test('personal account or budget denial never creates a competing password session', async () => {
  const fetcher = jest.fn().mockResolvedValue(Response.json(false));
  const response = await signInEmployee(request(), env, fetcher);
  expect(response.status).toBe(401);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toContain('/rpc/employee_login_allowed_v1');
});
test.each([{ ...details, role: 'super_admin' }, { ...details, password: 'x'.repeat(3000) }])('invalid details do not reach upstream', async (body) => {
  const fetcher = jest.fn();
  expect((await signInEmployee(request(body), env, fetcher)).status).toBeGreaterThanOrEqual(400);
  expect(fetcher).not.toHaveBeenCalled();
});
test('employee precheck precedes password login, service key is never sent to password endpoint', async () => {
  const session = { access_token: 'access', user: { role: 'doji_employee', app_metadata: { account_type: 'employee' } } };
  const fetcher = jest.fn().mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json(session));
  const response = await signInEmployee(request(), env, fetcher);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(session);
  expect(fetcher.mock.calls[1][0]).toContain('/token?grant_type=password');
  expect(fetcher.mock.calls[1][1].headers).not.toHaveProperty('authorization');
  expect(fetcher.mock.calls[0][1].headers.apikey).toBe(env.serviceKey);
  expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty('authorization');
  expect(fetcher.mock.calls[1][1].headers.apikey).toBe(env.anonKey);
  expect(response.headers.get('cache-control')).toBe('no-store');
});
test('unexpected member response is not returned to browser', async () => {
  const fetcher = jest.fn().mockResolvedValueOnce(Response.json(true))
    .mockResolvedValueOnce(Response.json({ access_token: 'do-not-return', user: { role: 'authenticated' } }));
  const response = await signInEmployee(request(), env, fetcher);
  expect(response.status).toBe(403);
  expect(await response.text()).not.toContain('do-not-return');
});
test('precheck outage fails closed with no password request or secret leakage', async () => {
  const fetcher = jest.fn().mockRejectedValue(new Error(env.serviceKey));
  const response = await signInEmployee(request(), env, fetcher);
  expect(response.status).toBe(503);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(await response.text()).not.toContain(env.serviceKey);
});

test('legacy service JWT sign-in precheck uses matching server credentials', async () => {
  const legacy = { ...env, serviceKey: 'eyJ.legacy-service.signature' };
  const fetcher = jest.fn().mockResolvedValue(Response.json(false));
  expect((await signInEmployee(request(), legacy, fetcher)).status).toBe(401);
  expect(fetcher.mock.calls[0][1].headers).toEqual({ apikey: legacy.serviceKey,
    authorization: `Bearer ${legacy.serviceKey}`, 'content-type': 'application/json' });
});
