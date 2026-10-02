import { webcrypto } from 'node:crypto';
import { businessAuth, type BusinessAuthEnv } from '../../supabase/functions/_shared/business-auth';
import { signBusinessLink } from '../../supabase/functions/_shared/business-link';

const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const email = 'synthetic@example.invalid';
const env: BusinessAuthEnv = {
  enabled: true,
  origin: 'https://business.synthetic.invalid',
  supabaseUrl: 'https://db.synthetic.invalid',
  serviceKey: 'sb_secret_synthetic',
  anonKey: 'public-synthetic',
  resendKey: 'synthetic-mail',
  fromEmail: 'Doji <synthetic@example.invalid>',
  linkKey: 'synthetic-key-at-least-thirty-two-characters',
};
const user = { id, email, role: 'doji_business', app_metadata: { account_type: 'business' } };
const confirmed = { ...user, email_confirmed_at: '2026-10-01' };
const session = {
  user: confirmed,
  access_token: 'synthetic-access',
  refresh_token: 'synthetic-refresh',
};
const register = {
  action: 'register',
  email,
  password: 'synthetic-password',
  displayName: 'Synthetic Owner',
  country: 'US',
  termsAccepted: true,
  privacyAcknowledged: true,
  termsVersion: 'v1',
  privacyVersion: 'v1',
};
const signin = { action: 'signin', email, password: 'synthetic-password' };
const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
beforeAll(() =>
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto }),
);
afterAll(() => {
  if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
  else Reflect.deleteProperty(globalThis, 'crypto');
});
type Scenario = {
  claim?: unknown;
  claimStatus?: number;
  legal?: unknown;
  legalStatus?: number;
  session?: unknown;
  sessionStatus?: number;
  created?: unknown;
  createStatus?: number;
  found?: unknown;
  foundStatus?: number;
  link?: Record<string, unknown>;
  linkStatus?: number;
  mailStatus?: number;
  throws?: string;
  proof?: unknown;
  proofStatus?: number;
};
function request(body: unknown, method = 'POST', origin = env.origin) {
  return new Request(`${env.origin}/access`, {
    method,
    headers: { origin, 'content-type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
}
async function run(
  body: Record<string, unknown> = register,
  patch: Partial<BusinessAuthEnv> = {},
  scenario: Scenario = {},
) {
  const upstream = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    if (scenario.throws && url.includes(scenario.throws))
      throw new Error('private-provider-details');
    const reply = (data: unknown, status = 200) => Response.json(data, { status });
    if (url.includes('siteverify'))
      return reply(
        scenario.proof ?? {
          success: true,
          hostname: 'business.synthetic.invalid',
          action: `business_${body.action}`,
        },
        scenario.proofStatus,
      );
    if (url.endsWith('/check_business_signup_legal_v1'))
      return reply(scenario.legal ?? true, scenario.legalStatus);
    if (url.includes('/rpc/'))
      return reply(scenario.claim ?? { allowed: true, user_id: id }, scenario.claimStatus);
    if (url.endsWith('/admin/users')) return reply(scenario.created ?? user, scenario.createStatus);
    if (url.endsWith(`/admin/users/${id}`))
      return reply(
        scenario.found ?? (body.action === 'recover' ? confirmed : user),
        scenario.foundStatus,
      );
    if (url.includes('/token?') || url.endsWith('/auth/v1/verify'))
      return reply(scenario.session ?? session, scenario.sessionStatus);
    if (url.endsWith('/generate_link')) {
      const type = body.action === 'recover' ? 'recovery' : 'signup';
      return reply(
        {
          ...user,
          verification_type: type,
          hashed_token: 'synthetic-onetime',
          action_link: `${env.supabaseUrl}/auth/v1/verify?type=${type}&redirect_to=${encodeURIComponent(`${env.origin}/business-portal/access/`)}`,
          ...scenario.link,
        },
        scenario.linkStatus,
      );
    }
    if (url === 'https://api.resend.com/emails')
      return reply({ id: 'synthetic' }, scenario.mailStatus);
    throw new Error(`Unexpected test request: ${url}`);
  });
  const response = await businessAuth(request(body), { ...env, ...patch }, upstream);
  return {
    status: response.status,
    body: await response.json(),
    upstream,
    headers: response.headers,
  };
}
test.each([
  { enabled: false },
  { origin: 'bad' },
  { origin: 'http://unsafe.invalid' },
  { origin: env.origin + '/' },
  { supabaseUrl: '' },
  { anonKey: '' },
  { serviceKey: '' },
  { resendKey: '' },
  { fromEmail: '' },
  { linkKey: '' },
  { linkKey: 'short' },
])('business auth fails before provider access with invalid configuration (%j)', async (patch) => {
  const result = await run(register, patch);
  expect(result.status).toBe(patch.enabled === false ? 404 : 503);
  expect(result.upstream).not.toHaveBeenCalled();
});
test.each([
  ['OPTIONS', env.origin, 204],
  ['GET', env.origin, 405],
  ['POST', 'https://evil.invalid', 403],
])('business %s respects origin and method gates', async (method, origin, status) => {
  const upstream = jest.fn();
  const response = await businessAuth(request(register, method, origin), env, upstream);
  expect(response.status).toBe(status);
  expect(upstream).not.toHaveBeenCalled();
});
test.each([null, [], 'string', 42])('non-object body is rejected (%j)', async (body) => {
  const upstream = jest.fn();
  expect((await businessAuth(request(body), env, upstream)).status).toBe(400);
  expect(upstream).not.toHaveBeenCalled();
});
test.each(['broken-json', 'x'.repeat(4097)])(
  'malformed or oversized request is rejected before identity changes (%s)',
  async (body) => {
    const upstream = jest.fn();
    expect(
      (
        await businessAuth(
          new Request(env.origin, { method: 'POST', headers: { origin: env.origin }, body }),
          env,
          upstream,
        )
      ).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  },
);
test.each([
  { action: 'unknown' },
  { role: 'employee' },
  { email: null },
  { email: 'bad' },
  { email: 'x'.repeat(250) + '@example.invalid' },
  { country: 'CA' },
  { termsAccepted: false },
  { privacyAcknowledged: false },
  { termsVersion: null },
  { termsVersion: 'bad value' },
  { privacyVersion: null },
  { privacyVersion: 'bad/value' },
  { displayName: '' },
  { displayName: 'x'.repeat(81) },
  { displayName: 'contains\ncontrol' },
  { password: 'short' },
  { password: 'x'.repeat(129) },
])('invalid registration cannot reserve or mutate an identity (%j)', async (patch) => {
  const result = await run({ ...register, ...patch });
  expect(result.status).toBe(400);
  expect(result.upstream).not.toHaveBeenCalled();
});
test.each(['', 'x'.repeat(129), null])(
  'signin rejects invalid password shape (%s)',
  async (password) => {
    const result = await run({ ...signin, password });
    expect(result.status).toBe(400);
    expect(result.upstream).not.toHaveBeenCalled();
  },
);
test.each([{ legal: false }, { legalStatus: 503 }])(
  'registration legal contract is server-authoritative (%j)',
  async (scenario) => {
    const result = await run(register, {}, scenario);
    expect(result.status).toBe(scenario.legal === false ? 409 : 503);
    expect(result.upstream).toHaveBeenCalledTimes(1);
  },
);
test('registration uses the fixed business identity class and no member metadata', async () => {
  const result = await run({
    ...register,
    email: ' SYNTHETIC@EXAMPLE.INVALID ',
    displayName: ' Synthetic Owner ',
  });
  expect(result.status).toBe(202);
  const create = result.upstream.mock.calls.find(([url]) => String(url).endsWith('/admin/users'))!;
  expect(JSON.parse(String(create[1]?.body))).toEqual({
    email,
    password: register.password,
    role: 'doji_business',
    email_confirm: false,
    app_metadata: {
      account_type: 'business',
      business_signup: {
        terms_accepted: true,
        privacy_acknowledged: true,
        terms_version: 'v1',
        privacy_version: 'v1',
      },
    },
    user_metadata: { display_name: 'Synthetic Owner' },
  });
  expect(create[1]?.headers).toMatchObject({ apikey: env.serviceKey });
  expect(create[1]?.headers).not.toHaveProperty('authorization');
  expect(
    result.upstream.mock.calls.every(
      ([, init]) => init?.method !== 'DELETE' && init?.method !== 'PUT',
    ),
  ).toBe(true);
  const mail = result.upstream.mock.calls.at(-1)!;
  expect(mail[0]).toBe('https://api.resend.com/emails');
  const envelope = JSON.parse(String(mail[1]?.body));
  expect(envelope.to).toEqual([email]);
  expect(envelope.html).toContain('#ticket=');
  expect(envelope.text).toContain('separate');
  expect(mail[1]?.headers).toMatchObject({
    'idempotency-key': expect.stringMatching(/^business-auth\/[a-f0-9]{64}$/),
  });
  expect(result.body).not.toHaveProperty('access_token');
});
test.each(['email_exists', 'user_already_exists', 'other'])(
  'account creation error %s never edits a pre-existing user',
  async (code) => {
    const result = await run(register, {}, { created: { code }, createStatus: 422 });
    expect(result.status).toBe(code === 'other' ? 503 : 202);
    expect(result.upstream).toHaveBeenCalledTimes(3);
  },
);
test.each([
  { ...user, role: 'authenticated' },
  { ...user, app_metadata: { account_type: 'employee' } },
  confirmed,
])('created identity must be an unconfirmed business account (%j)', async (created) => {
  const result = await run(register, {}, { created });
  expect(result.status).toBe(503);
  expect(result.upstream).toHaveBeenCalledTimes(3);
});
test.each(['register', 'resend', 'recover', 'signin'])(
  'denied admission %s never calls Auth',
  async (action) => {
    const body =
      action === 'register' ? register : action === 'signin' ? signin : { action, email };
    const result = await run(body, {}, { claim: { allowed: false } });
    expect(result.status).toBe(action === 'signin' ? 401 : 202);
    expect(result.upstream.mock.calls.every(([url]) => String(url).includes('/rpc/'))).toBe(true);
  },
);
test('admission provider failure has no credential exchange', async () => {
  const result = await run(signin, {}, { claimStatus: 503 });
  expect(result.status).toBe(503);
  expect(result.upstream).toHaveBeenCalledTimes(1);
});
test('signin exchanges only admitted business credentials using the public API key', async () => {
  const result = await run(signin);
  expect(result.status).toBe(200);
  expect(result.body).toEqual(session);
  expect(result.upstream.mock.calls[1][1]?.headers).toEqual({
    apikey: env.anonKey,
    'content-type': 'application/json',
  });
  expect(result.headers.get('cache-control')).toBe('no-store');
});
test.each([
  { claim: { allowed: true } },
  { sessionStatus: 400 },
  { session: { ...session, user: { ...confirmed, id: 'other' } } },
  { session: { ...session, user: { ...confirmed, email: 'other@example.invalid' } } },
  { session: { ...session, user: user } },
  { session: { ...session, access_token: null } },
  { session: { ...session, refresh_token: null } },
])('signin cannot expose a mismatched or incomplete session (%j)', async (scenario) => {
  const result = await run(signin, {}, scenario);
  expect(result.status).toBe(scenario.sessionStatus === 400 ? 401 : 503);
  expect(JSON.stringify(result.body)).not.toContain('synthetic-access');
});
test.each(['resend', 'recover'])(
  'business %s omits password and metadata from generated links',
  async (action) => {
    const result = await run({ action, email });
    expect(result.status).toBe(202);
    const generated = result.upstream.mock.calls.find(([url]) =>
      String(url).endsWith('/generate_link'),
    )!;
    expect(JSON.parse(String(generated[1]?.body))).toEqual({
      type: action === 'recover' ? 'recovery' : 'signup',
      email,
      redirect_to: `${env.origin}/business-portal/access/`,
    });
  },
);
test.each([
  { claim: { allowed: true, user_id: 'bad' } },
  { foundStatus: 404 },
  { found: { ...user, role: 'authenticated' } },
  { found: confirmed },
  { linkStatus: 503 },
  { link: { id: 'other' } },
  { link: { verification_type: 'recovery' } },
  { link: { hashed_token: null } },
  { link: { hashed_token: '' } },
  { link: { action_link: 'https://evil.invalid/auth/v1/verify' } },
  { link: { action_link: `${env.supabaseUrl}/wrong` } },
  { link: { action_link: `${env.supabaseUrl}/auth/v1/verify?type=recovery` } },
  {
    link: {
      action_link: `${env.supabaseUrl}/auth/v1/verify?type=signup&redirect_to=https://evil.invalid`,
    },
  },
])('resend refuses an unverified identity or provider link (%j)', async (scenario) => {
  const result = await run({ action: 'resend', email }, {}, scenario);
  expect(result.status).toBe('claim' in scenario ? 503 : 202);
  expect(result.upstream.mock.calls.some(([url]) => url === 'https://api.resend.com/emails')).toBe(
    false,
  );
});
test.each(['resend', 'recover', 'register', 'signin'])(
  'provider errors during %s are bounded and never leak details',
  async (action) => {
    const result = await run(
      action === 'register' ? register : action === 'signin' ? signin : { action, email },
      {},
      { throws: '/rpc/' },
    );
    expect(result.status).toBe(['resend', 'recover'].includes(action) ? 202 : 503);
    expect(JSON.stringify(result.body)).not.toContain('private-provider-details');
  },
);

async function verifyBody(type: 'signup' | 'recovery' = 'signup') {
  return {
    action: 'verify',
    ticket: await signBusinessLink(
      { id, email, type, token_hash: 'synthetic-onetime' },
      env.linkKey!,
      env.origin,
    ),
  };
}
test.each(['signup', 'recovery'] as const)(
  'verified %s link returns only its exact business session',
  async (type) => {
    const result = await run(await verifyBody(type));
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ...session, business_flow: type });
    expect(result.upstream.mock.calls[1][1]?.headers).toEqual({
      apikey: env.anonKey,
      'content-type': 'application/json',
    });
  },
);
test('unsigned member links never reach Auth verification', async () => {
  const result = await run({ action: 'verify', ticket: 'member-link' });
  expect(result.status).toBe(400);
  expect(result.upstream).not.toHaveBeenCalled();
});
test.each([
  { claim: { allowed: false } },
  { claim: { allowed: true, user_id: 'other' } },
  { sessionStatus: 400 },
  { session: { ...session, user: { ...confirmed, role: 'authenticated' } } },
  { session: { ...session, user } },
  { session: { ...session, access_token: 42 } },
  { session: { ...session, refresh_token: 42 } },
])(
  'link verification fails closed when authorization/session is incomplete (%j)',
  async (scenario) => {
    const result = await run(await verifyBody(), {}, scenario);
    expect(result.status).toBe('claim' in scenario ? 403 : scenario.sessionStatus ? 400 : 503);
    expect(JSON.stringify(result.body)).not.toContain('synthetic-access');
  },
);
const publicEnv = { publicAdmission: true, turnstileSecret: 'synthetic-turnstile' };
test.each([undefined, '', 42, 'x'.repeat(2049)])(
  'public admission requires a bounded proof before provider use (%s)',
  async (verificationToken) => {
    const result = await run({ ...register, verificationToken }, publicEnv);
    expect(result.status).toBe(400);
    expect(result.upstream).not.toHaveBeenCalled();
  },
);
test('public admission never falls back when security configuration is missing', async () => {
  const result = await run({ ...register, verificationToken: 'proof' }, { publicAdmission: true });
  expect(result.status).toBe(503);
  expect(result.upstream).not.toHaveBeenCalled();
});
test.each([
  { proofStatus: 503 },
  { proof: { success: false } },
  { proof: { success: true, hostname: 'wrong', action: 'business_register' } },
  { proof: { success: true, hostname: 'business.synthetic.invalid', action: 'business_recover' } },
  { throws: 'siteverify' },
])('invalid public proof never reaches legal/admission/Auth (%j)', async (scenario) => {
  const result = await run({ ...register, verificationToken: 'proof' }, publicEnv, scenario);
  expect(result.status).toBe(scenario.throws ? 503 : 400);
  expect(result.upstream).toHaveBeenCalledTimes(1);
});
test.each(['register', 'resend', 'recover', 'signin'])(
  'public %s uses operation-bound proof followed by dedicated atomic admission',
  async (action) => {
    const body =
      action === 'register' ? register : action === 'signin' ? signin : { action, email };
    const result = await run({ ...body, verificationToken: 'proof' }, publicEnv);
    expect(result.status).toBe(action === 'signin' ? 200 : 202);
    expect(result.upstream.mock.calls[0][0]).toBe(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    );
    expect(
      result.upstream.mock.calls.some(([url]) =>
        String(url).endsWith('/claim_public_business_auth_v1'),
      ),
    ).toBe(true);
    expect(
      result.upstream.mock.calls.slice(1).some(([, init]) => String(init?.body).includes('proof')),
    ).toBe(false);
  },
);
test.each(['registration_paused', 'email_paused'])(
  'public capacity state %s stays explicit without exposing account details',
  async (reason) => {
    const result = await run({ ...register, verificationToken: 'proof' }, publicEnv, {
      claim: { allowed: false, reason },
    });
    expect(result.status).toBe(503);
    expect(result.body.message).toContain('temporarily paused');
    expect(result.body.message).not.toContain(email);
  },
);
test('public email verification does not require a second captcha or expose provider secrets', async () => {
  const result = await run(await verifyBody(), publicEnv);
  expect(result.status).toBe(200);
  expect(result.upstream).toHaveBeenCalledTimes(2);
  expect(result.upstream.mock.calls[0][0]).toBe(
    `${env.supabaseUrl}/rest/v1/rpc/claim_public_business_auth_v1`,
  );
});
