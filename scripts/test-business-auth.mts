// Pure contract tests: every upstream call is stubbed; no network or email send.
import assert from 'node:assert/strict';
import { evidenceRecord, evidenceText } from './release-evidence.mts';
import { businessAuth } from '../supabase/functions/_shared/business-auth.ts';
import { signBusinessLink, readBusinessLink } from '../supabase/functions/_shared/business-link.ts';
const env = {
  enabled: true,
  origin: 'https://business.example.test',
  supabaseUrl: 'https://auth.example.test',
  anonKey: 'public-test',
  serviceKey: 'sb_secret_test',
  resendKey: 'mail-test',
  fromEmail: 'Doji <test@example.test>',
  linkKey: 'synthetic-only-link-signing-key-32-chars',
};
const id = '76000000-0000-4000-8000-000000000001',
  email = 'pilot@test.invalid';
const user = { id, email, role: 'doji_business', app_metadata: { account_type: 'business' } };
const confirmed = { ...user, email_confirmed_at: '2026-09-29T00:00:00Z' };
const newAccount = {
  action: 'register',
  email,
  password: 'synthetic-password-123',
  displayName: 'Test Owner',
  country: 'US',
  termsAccepted: true,
  privacyAcknowledged: true,
  termsVersion: 'test-terms-v1',
  privacyVersion: 'test-privacy-v1',
};
const json = (data: unknown, status = 200) => Response.json(data, { status });
interface Scenario {
  proofThrows?: boolean;
  proof?: unknown;
  proofStatus?: number;
  legal?: unknown;
  legalStatus?: number;
  claim?: unknown;
  createFailure?: unknown;
  created?: unknown;
  found?: unknown;
  session?: unknown;
  link?: Record<string, unknown>;
  mailThrows?: boolean;
  mailStatus?: number;
}
interface Call {
  url: string;
  init: RequestInit & { headers: Record<string, string> };
  body: Record<string, unknown> | null;
}
function requiredCall(call: Call | undefined) {
  assert.ok(call);
  return call;
}
let assertions = 0;
async function run(
  body: Record<string, unknown>,
  overrides: Partial<Parameters<typeof businessAuth>[1]> = {},
  scenario: Scenario = {},
) {
  const calls: Call[] = [];
  const upstream: typeof fetch = async (input, options) => {
    assert.ok(options);
    const url = input instanceof Request ? input.url : String(input);
    const init = { ...options, headers: Object.fromEntries(new Headers(options.headers)) };
    calls.push({
      url,
      init,
      body: init.body ? evidenceRecord(JSON.parse(evidenceText(init.body))) : null,
    });
    assert.ok(init.signal, 'each upstream bounded');
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
      if (scenario.proofThrows) throw Error('private provider error');
      return json(
        scenario.proof ?? {
          success: true,
          hostname: 'business.example.test',
          action: `business_${body.action}`,
        },
        scenario.proofStatus ?? 200,
      );
    }
    if (url.endsWith('/check_business_signup_legal_v1'))
      return json(scenario.legal ?? true, scenario.legalStatus ?? 200);
    if (url.includes('/rpc/')) return json(scenario.claim ?? { allowed: true, user_id: id });
    if (url.endsWith('/admin/users'))
      return scenario.createFailure
        ? json(scenario.createFailure, 422)
        : json(scenario.created ?? user);
    if (url.endsWith(`/admin/users/${id}`))
      return json(scenario.found ?? (body.action === 'recover' ? confirmed : user));
    if (url.includes('/token?'))
      return json(
        scenario.session ?? {
          user: confirmed,
          access_token: 'synthetic-access',
          refresh_token: 'synthetic-refresh',
        },
      );
    if (url.endsWith('/auth/v1/verify'))
      return json(
        scenario.session ?? {
          user: confirmed,
          access_token: 'synthetic-access',
          refresh_token: 'synthetic-refresh',
        },
      );
    if (url.endsWith('/generate_link')) {
      const type = body.action === 'recover' ? 'recovery' : 'signup';
      const redirect = `${env.origin}/business-portal/access/`;
      return json({
        ...user,
        verification_type: type,
        hashed_token: 'synthetic-onetime-token',
        action_link: `${env.supabaseUrl}/auth/v1/verify?type=${type}&redirect_to=${encodeURIComponent(redirect)}`,
        ...scenario.link,
      });
    }
    if (url === 'https://api.resend.com/emails') {
      if (scenario.mailThrows) throw new Error('private provider body');
      return json({ id: 'synthetic' }, scenario.mailStatus ?? 200);
    }
    throw new Error('Unexpected upstream');
  };
  const request = new Request(env.origin, {
    method: 'POST',
    headers: { origin: env.origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const response = await businessAuth(request, { ...env, ...overrides }, upstream);
  return {
    status: response.status,
    body: evidenceRecord(await response.json()),
    calls,
    headers: response.headers,
  };
}
async function check(label: string, fn: () => Promise<void>) {
  await fn();
  assertions++;
  console.log(`PASS: ${label}`);
}
await check('default-off makes no upstream call', async () => {
  const r = await run(newAccount, { enabled: false });
  assert.equal(r.status, 404);
  assert.equal(r.calls.length, 0);
});
await check('non-HTTPS deployment fails closed', async () => {
  assert.equal((await run(newAccount, { origin: 'http://example.test' })).status, 503);
});
await check('origin rejected before admission', async () => {
  const r = await run(newAccount, { origin: 'https://other.example.test' });
  assert.equal(r.status, 403);
  assert.equal(r.calls.length, 0);
});
for (const field of ['role', 'app_metadata', 'redirect_to', 'email_confirm', 'organization_id'])
  await check(`rejects caller-owned ${field}`, async () => {
    const r = await run({ ...newAccount, [field]: 'injected' });
    assert.equal(r.status, 400);
    assert.equal(r.calls.length, 0);
  });
await check('bounded request body', async () => {
  assert.equal((await run({ ...newAccount, displayName: 'a'.repeat(5000) })).status, 400);
});
await check('missing email provider fails before creating account', async () => {
  const r = await run(newAccount, { resendKey: '' });
  assert.equal(r.status, 503);
  assert.equal(r.calls.length, 0);
});
await check('denied member/unknown login never exchanges password', async () => {
  const r = await run(
    { action: 'signin', email, password: 'test' },
    {},
    { claim: { allowed: false } },
  );
  assert.equal(r.status, 401);
  assert.equal(r.calls.length, 1);
});
await check('approved precheck must return exact identity', async () => {
  const r = await run(
    { action: 'signin', email, password: 'test' },
    {},
    { claim: { allowed: true } },
  );
  assert.equal(r.status, 503);
  assert.equal(r.calls.length, 1);
});
await check('business login uses anon key and returns only matched session', async () => {
  const r = await run({ action: 'signin', email, password: 'test' });
  assert.equal(r.status, 200);
  assert.equal(requiredCall(r.calls[1]).init.headers.apikey, 'public-test');
  assert.equal(requiredCall(r.calls[1]).init.headers.authorization, undefined);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});
await check('wrong class session is never returned', async () => {
  const r = await run(
    { action: 'signin', email, password: 'test' },
    {},
    { session: { user: { ...confirmed, role: 'authenticated' }, access_token: 'private' } },
  );
  assert.equal(r.status, 503);
  assert.ok(!JSON.stringify(r.body).includes('private'));
});
await check('same class wrong identity session is never returned', async () => {
  const r = await run(
    { action: 'signin', email, password: 'test' },
    {},
    { session: { user: { ...confirmed, id: 'other' }, access_token: 'private' } },
  );
  assert.equal(r.status, 503);
});
await check(
  'registration fixed role, no DOB or member mutation, branded scanner-safe email',
  async () => {
    const r = await run(newAccount);
    assert.equal(r.status, 202);
    const create = r.calls.find((c) => c.url.endsWith('/admin/users'));
    assert.ok(create);
    assert.deepEqual(create.body, {
      email,
      password: newAccount.password,
      role: 'doji_business',
      email_confirm: false,
      app_metadata: {
        account_type: 'business',
        business_signup: {
          terms_accepted: true,
          privacy_acknowledged: true,
          terms_version: 'test-terms-v1',
          privacy_version: 'test-privacy-v1',
        },
      },
      user_metadata: { display_name: 'Test Owner' },
    });
    assert.equal(create.init.headers.authorization, undefined);
    const generated = r.calls.find((c) => c.url.endsWith('/generate_link'));
    assert.ok(generated?.body);
    assert.deepEqual(Object.keys(generated.body).sort(), ['email', 'redirect_to', 'type']);
    const mail = r.calls.at(-1);
    assert.ok(mail?.body);
    assert.equal(mail.url, 'https://api.resend.com/emails');
    assert.match(evidenceText(mail.body.html), /#ticket=/);
    assert.match(evidenceText(mail.body.text), /separate/);
    assert.match(
      evidenceText(mail.init.headers['idempotency-key']),
      /^business-auth\/[a-f0-9]{64}$/,
    );
    assert.ok(!JSON.stringify(r.body).includes('token'));
    assert.ok(r.calls.every((c) => c.init.method !== 'PUT' && c.init.method !== 'DELETE'));
  },
);
await check('duplicate creation never sends or modifies existing account', async () => {
  const r = await run(newAccount, {}, { createFailure: { code: 'email_exists' } });
  assert.equal(r.status, 202);
  assert.equal(r.calls.length, 3);
});
await check('mismatched create identity fails closed', async () => {
  const r = await run(newAccount, {}, { created: { ...user, role: 'authenticated' } });
  assert.equal(r.status, 503);
  assert.equal(r.calls.length, 3);
});
for (const action of ['resend', 'recover']) {
  await check(
    `${action} denied identity and provider failure have identical public receipt`,
    async () => {
      const denied = await run({ action, email }, {}, { claim: { allowed: false } });
      const failed = await run({ action, email }, {}, { mailStatus: 503 });
      const thrown = await run({ action, email }, {}, { mailThrows: true });
      assert.equal(denied.status, 202);
      assert.deepEqual(failed.body, denied.body);
      assert.deepEqual(thrown.body, denied.body);
      assert.equal(denied.calls.length, 1);
    },
  );
  await check(`${action} rechecks exact identity before generating link`, async () => {
    const r = await run({ action, email }, {}, { found: { ...user, role: 'authenticated' } });
    assert.equal(r.status, 202);
    assert.equal(r.calls.length, 2);
  });
}
await check('recovery generation omits password and metadata', async () => {
  const r = await run({ action: 'recover', email });
  const c = r.calls.find((c) => c.url.endsWith('/generate_link'));
  assert.ok(c?.body);
  assert.equal(c.body.type, 'recovery');
  assert.equal(c.body.password, undefined);
  assert.equal(c.body.data, undefined);
});
await check('provider wrong redirect cannot escape in email', async () => {
  const r = await run(
    newAccount,
    {},
    { link: { action_link: 'https://evil.test/auth/v1/verify' } },
  );
  assert.equal(r.status, 202);
  assert.ok(!r.calls.some((c) => c.url === 'https://api.resend.com/emails'));
});
await check('provider wrong user cannot receive link', async () => {
  const r = await run(newAccount, {}, { link: { id: 'other' } });
  assert.equal(r.status, 202);
  assert.ok(!r.calls.some((c) => c.url === 'https://api.resend.com/emails'));
});
for (const type of ['signup', 'recovery'] as const) {
  await check(`${type} signed link is business-bound before Auth exchange`, async () => {
    const ticket = await signBusinessLink(
      { id, email, type, token_hash: 'test-token' },
      env.linkKey,
      env.origin,
    );
    const result = await run({ action: 'verify', ticket });
    assert.equal(result.status, 200);
    assert.equal(result.body.business_flow, type);
    assert.equal(evidenceRecord(requiredCall(result.calls[0]).body).p_action, 'verify');
    assert.equal(evidenceRecord(requiredCall(result.calls[1]).body).token_hash, 'test-token');
    const denied = await run(
      { action: 'verify', ticket },
      {},
      { claim: { allowed: true, user_id: 'other' } },
    );
    assert.equal(denied.status, 403);
    assert.equal(denied.calls.length, 1);
    const altered = await run({ action: 'verify', ticket: ticket.slice(0, -5) + 'aaaaa' });
    assert.equal(altered.status, 400);
    assert.equal(altered.calls.length, 0);
    assert.equal(await readBusinessLink(ticket, env.linkKey, 'https://other.example.test'), null);
  });
}
await check('unsigned member token cannot reach Auth verification', async () => {
  const result = await run({ action: 'verify', ticket: 'member-token' });
  assert.equal(result.status, 400);
  assert.equal(result.calls.length, 0);
});
const publicEnv = { publicAdmission: true, turnstileSecret: 'synthetic-turnstile-secret' };
await check('public signup requires proof before any identity, database or mail call', async () => {
  for (const verificationToken of [undefined, '', 'x'.repeat(2049), 42]) {
    const r = await run({ ...newAccount, verificationToken }, publicEnv);
    assert.equal(r.status, 400);
    assert.equal(r.calls.length, 0);
  }
});
await check('public missing secret fails closed without invitation fallback', async () => {
  const r = await run({ ...newAccount, verificationToken: 'proof' }, { publicAdmission: true });
  assert.equal(r.status, 503);
  assert.equal(r.calls.length, 0);
});
for (const proof of [
  { success: false },
  { success: true, hostname: 'evil.test', action: 'business_register' },
  { success: true, hostname: 'business.example.test', action: 'business_recover' },
  { success: 'true', hostname: 'business.example.test', action: 'business_register' },
])
  await check(`public invalid proof rejected: ${JSON.stringify(proof)}`, async () => {
    const r = await run({ ...newAccount, verificationToken: 'proof' }, publicEnv, { proof });
    assert.equal(r.status, 400);
    assert.equal(r.calls.length, 1);
  });
for (const action of ['register', 'signin', 'resend', 'recover'])
  await check(
    `public ${action} uses action-bound proof and dedicated atomic admission`,
    async () => {
      const body =
        action === 'register'
          ? newAccount
          : action === 'signin'
            ? { action, email, password: 'test' }
            : { action, email };
      const r = await run({ ...body, verificationToken: 'synthetic-proof' }, publicEnv);
      assert.equal(r.status, action === 'signin' ? 200 : 202);
      assert.equal(
        requiredCall(r.calls[0]).url,
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      );
      assert.equal(evidenceRecord(requiredCall(r.calls[0]).body).secret, publicEnv.turnstileSecret);
      assert.equal(
        requiredCall(r.calls[action === 'register' ? 2 : 1]).url,
        `${env.supabaseUrl}/rest/v1/rpc/claim_public_business_auth_v1`,
      );
      assert.ok(r.calls.slice(1).every((c) => !JSON.stringify(c.body).includes('synthetic-proof')));
    },
  );
await check(
  'public provider outage never reaches Auth, admission or mail and never retries',
  async () => {
    for (const scenario of [{ proofThrows: true }, { proofStatus: 503 }]) {
      const r = await run({ ...newAccount, verificationToken: 'proof' }, publicEnv, scenario);
      assert.ok(r.status >= 400);
      assert.equal(r.calls.length, 1);
    }
  },
);
await check('public signed email link uses bounded admission without captcha', async () => {
  const ticket = await signBusinessLink(
    { id, email, type: 'signup', token_hash: 'test-token' },
    env.linkKey,
    env.origin,
  );
  const r = await run({ action: 'verify', ticket }, publicEnv);
  assert.equal(r.status, 200);
  assert.equal(
    requiredCall(r.calls[0]).url,
    `${env.supabaseUrl}/rest/v1/rpc/claim_public_business_auth_v1`,
  );
  assert.equal(r.calls.length, 2);
});
await check(
  'public global capacity pauses are explicit without account-specific details',
  async () => {
    for (const reason of ['registration_paused', 'email_paused']) {
      const r = await run({ ...newAccount, verificationToken: 'proof' }, publicEnv, {
        claim: { allowed: false, reason },
      });
      assert.equal(r.status, 503);
      assert.match(evidenceText(r.body.message), /temporarily paused/);
      assert.equal(r.calls.length, 3);
      assert.ok(!evidenceText(r.body.message).includes(email));
    }
  },
);
for (const field of ['termsAccepted', 'privacyAcknowledged', 'termsVersion', 'privacyVersion'])
  await check(`registration rejects missing ${field} before upstream`, async () => {
    const r = await run({ ...newAccount, [field]: undefined });
    assert.equal(r.status, 400);
    assert.equal(r.calls.length, 0);
  });
await check('false or string agreement is not consent', async () => {
  for (const value of [false, 'true', 1]) {
    const r = await run({ ...newAccount, termsAccepted: value });
    assert.equal(r.status, 400);
    assert.equal(r.calls.length, 0);
  }
});
await check('stale legal versions fail before reservation or account creation', async () => {
  const r = await run(newAccount, {}, { legal: false });
  assert.equal(r.status, 409);
  assert.equal(r.calls.length, 1);
});
for (const country of [undefined, 'CA', 'us', true])
  await check(`non-US signup rejected before all upstream calls: ${String(country)}`, async () => {
    const r = await run({ ...newAccount, country });
    assert.equal(r.status, 400);
    assert.equal(r.calls.length, 0);
  });
await check('unavailable legal contract never falls back to account creation', async () => {
  const r = await run(newAccount, {}, { legalStatus: 503 });
  assert.equal(r.status, 503);
  assert.equal(r.calls.length, 1);
});
console.log(
  `${assertions} business-auth contract checks passed; all upstreams stubbed, no emails sent.`,
);
