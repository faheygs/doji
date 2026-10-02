import { registerEmployee, type EmployeeRegistrationEnv } from '../../supabase/functions/_shared/employee-registration';

const env: EmployeeRegistrationEnv = { enabled: true, origin: 'https://admin.example.test',
  supabaseUrl: 'https://project.example.test', anonKey: 'sb_publishable_test', serviceKey: 'sb_secret_test', resendKey: 're_test', fromEmail: 'Doji <work@example.test>' };
const employee = { id: 'employee-1', email: 'work@example.test', role: 'doji_employee', app_metadata: { account_type: 'employee' } };
const generated = { ...employee, verification_type: 'signup', hashed_token: 'private-hash', action_link: `https://project.example.test/auth/v1/verify?token=private-hash&type=signup&redirect_to=${encodeURIComponent(`${env.origin}/`)}` };
const details = { displayName: 'Test Employee', email: 'work@example.test', password: 'a-long-test-password' };
const request = (body: unknown = details, origin = env.origin) => new Request('https://project.example.test/functions/v1/employee-register', {
  method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('owner-only enrollment rejects other addresses and resend before any upstream call', async () => {
  const upstream = jest.fn();
  const limited = { ...env, enrollmentEmails: 'owner@example.test' };
  expect((await registerEmployee(request(), limited, upstream)).status).toBe(403);
  expect((await registerEmployee(request({ action: 'resend_verification', email: details.email }), limited, upstream)).status).toBe(403);
  expect((await registerEmployee(request(), { ...env, enrollmentEmails: '' }, upstream)).status).toBe(403);
  expect(upstream).not.toHaveBeenCalled();
});

test('disabled registration and other origins make no Auth or database calls', async () => {
  const upstream = jest.fn();
  expect((await registerEmployee(request(), { ...env, enabled: false }, upstream)).status).toBe(404);
  expect((await registerEmployee(request(details, 'https://other.test'), env, upstream)).status).toBe(403);
  expect(upstream).not.toHaveBeenCalled();
});

test.each(['role', 'app_metadata', 'email_confirm', 'redirect_to'])('rejects caller-controlled %s', async (key) => {
  const upstream = jest.fn();
  expect((await registerEmployee(request({ ...details, [key]: 'super_admin' }), env, upstream)).status).toBe(400);
  expect(upstream).not.toHaveBeenCalled();
});

test('invalid and oversized input never spends authentication capacity', async () => {
  const upstream = jest.fn();
  expect((await registerEmployee(request({ ...details, password: 'short' }), env, upstream)).status).toBe(400);
  expect((await registerEmployee(request({ ...details, displayName: 'x'.repeat(5000) }), env, upstream)).status).toBe(413);
  expect(upstream).not.toHaveBeenCalled();
});

test('durable budget denial prevents account creation and email', async () => {
  const upstream = jest.fn().mockResolvedValue(Response.json(false));
  expect((await registerEmployee(request(), env, upstream)).status).toBe(429);
  expect(upstream).toHaveBeenCalledTimes(1);
});

test('new employee has a fixed separate role, no privileges and unconfirmed email', async () => {
  const upstream = jest.fn()
    .mockResolvedValueOnce(Response.json(true))
    .mockResolvedValueOnce(Response.json({ role: 'doji_employee', app_metadata: { account_type: 'employee' } }))
    .mockResolvedValueOnce(Response.json({ users: [employee] }))
    .mockResolvedValueOnce(Response.json(generated))
    .mockResolvedValueOnce(Response.json({}));
  const result = await registerEmployee(request(), env, upstream);
  expect(result.status).toBe(202);
  expect(upstream.mock.calls.map(([url]) => url)).toEqual([
    `${env.supabaseUrl}/rest/v1/rpc/claim_employee_registration_v1`,
    `${env.supabaseUrl}/auth/v1/admin/users`, `${env.supabaseUrl}/auth/v1/admin/users?filter=work%40example.test&page=1&per_page=2`,
    `${env.supabaseUrl}/auth/v1/admin/generate_link`, 'https://api.resend.com/emails',
  ]);
  expect(JSON.parse(upstream.mock.calls[1][1].body)).toEqual({
    email: details.email, password: details.password, role: 'doji_employee', email_confirm: false,
    app_metadata: { account_type: 'employee' }, user_metadata: { display_name: details.displayName },
  });
  expect(upstream.mock.calls[2][1].headers).not.toHaveProperty('authorization');
  for (const call of upstream.mock.calls.slice(0, 2)) {
    expect(call[1].headers.apikey).toBe(env.serviceKey);
    expect(call[1].headers).not.toHaveProperty('authorization');
  }
  expect(upstream.mock.calls[2][1].headers.apikey).toBe(env.serviceKey);
  expect(JSON.parse(upstream.mock.calls[3][1].body)).not.toHaveProperty('password');
  const text = await result.text();
  expect(text).not.toContain(env.serviceKey);
  expect(text).not.toContain(details.password);
});

test('duplicate email never converts a member, changes their password or sends mail', async () => {
  const upstream = jest.fn().mockResolvedValueOnce(Response.json(true))
    .mockResolvedValueOnce(Response.json({ code: 'email_exists' }, { status: 422 }));
  expect((await registerEmployee(request(), env, upstream)).status).toBe(202);
  expect(upstream).toHaveBeenCalledTimes(2);
  expect(upstream.mock.calls[1][1].method).toBe('POST');
});

test('provider failures do not leak bodies or retry an ambiguous creation', async () => {
  const upstream = jest.fn().mockResolvedValueOnce(Response.json(true))
    .mockRejectedValueOnce(new Error('provider secret body'));
  const result = await registerEmployee(request(), env, upstream);
  expect(result.status).toBe(503);
  expect(await result.text()).not.toContain('provider secret');
  expect(upstream).toHaveBeenCalledTimes(2);
});

test('wrong server role fails closed and sends no email', async () => {
  const upstream = jest.fn().mockResolvedValueOnce(Response.json(true))
    .mockResolvedValueOnce(Response.json({ role: 'authenticated' }));
  expect((await registerEmployee(request(), env, upstream)).status).toBe(503);
  expect(upstream).toHaveBeenCalledTimes(2);
});

test('email failure reports incomplete verification, not successful registration', async () => {
  const upstream = jest.fn().mockResolvedValueOnce(Response.json(true))
    .mockResolvedValueOnce(Response.json({ role: 'doji_employee', app_metadata: { account_type: 'employee' } }))
    .mockResolvedValueOnce(Response.json({}, { status: 500 }));
  const result = await registerEmployee(request(), env, upstream);
  expect(result.status).toBe(503);
  expect(await result.text()).toContain('verification email could not be sent');
});

test('verification recovery sends only after a service-side employee/budget claim', async () => {
  const upstream = jest.fn().mockResolvedValueOnce(Response.json(true))
    .mockResolvedValueOnce(Response.json({ users: [employee] })).mockResolvedValueOnce(Response.json(generated)).mockResolvedValueOnce(Response.json({}));
  const result = await registerEmployee(request({ action: 'resend_verification', email: '  WORK@example.test  ' }), env, upstream);
  expect(result.status).toBe(202);
  expect(upstream.mock.calls[0][0]).toContain('/rpc/claim_employee_verification_v1');
  expect(JSON.parse(upstream.mock.calls[0][1].body)).toEqual({p_email:'work@example.test'});
  expect(upstream.mock.calls[1][0]).toContain('/auth/v1/admin/users?filter=');
  expect(JSON.parse(upstream.mock.calls[2][1].body)).toEqual({type:'signup',email:'work@example.test',redirect_to:`${env.origin}/`});
  expect(upstream.mock.calls[1][1].headers).not.toHaveProperty('authorization');
  expect(upstream.mock.calls[0][1].headers.apikey).toBe(env.serviceKey);
  expect(upstream.mock.calls[0][1].headers).not.toHaveProperty('authorization');
  expect(await result.text()).not.toContain(env.serviceKey);
});

test('unknown, member, confirmed, over-budget and delivery failures share a generic response', async () => {
  const retry = () => request({action:'resend_verification',email:details.email});
  const refused = jest.fn().mockResolvedValue(Response.json(false));
  const rejected = await registerEmployee(retry(),env,refused);
  expect(refused).toHaveBeenCalledTimes(1);
  const failed = jest.fn().mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json({secret:'provider'}, {status:500}));
  const delivery = await registerEmployee(retry(),env,failed);
  expect(delivery.status).toBe(rejected.status);
  expect(await delivery.text()).toBe(await rejected.text());
  const timeout = jest.fn().mockResolvedValueOnce(Response.json(true)).mockRejectedValueOnce(new Error('secret'));
  expect((await registerEmployee(retry(),env,timeout)).status).toBe(202);
});

test('verification recovery rejects role, password and redirect injection', async () => {
  const upstream = jest.fn();
  for(const field of ['role','password','redirect_to']) {
    expect((await registerEmployee(request({action:'resend_verification',email:details.email,[field]:'injected'}),env,upstream)).status).toBe(400);
  }
  expect(upstream).not.toHaveBeenCalled();
});

test('legacy service JWT registration uses matching server credentials', async () => {
  const legacy = { ...env, serviceKey: 'eyJ.legacy-service.signature' };
  const upstream = jest.fn().mockResolvedValue(Response.json(false));
  expect((await registerEmployee(request(), legacy, upstream)).status).toBe(429);
  expect(upstream.mock.calls[0][1].headers).toEqual({ apikey: legacy.serviceKey,
    authorization: `Bearer ${legacy.serviceKey}`, 'content-type': 'application/json' });
});

test('gateway authorization failure never proceeds to create an account', async () => {
  const upstream = jest.fn().mockResolvedValue(Response.json({ message: 'private provider error' }, { status: 401 }));
  const result = await registerEmployee(request(), env, upstream);
  expect(result.status).toBe(503);
  expect(upstream).toHaveBeenCalledTimes(1);
  expect(await result.text()).not.toContain('private provider');
});
