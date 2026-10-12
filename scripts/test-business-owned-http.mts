// Offline integration only. No remote provider, database, member or email traffic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BusinessPasswordRejected } from '../infra/portal-identity-candidate/business-password-policy.mts';
import { createBusinessOwnedReset } from '../infra/portal-identity-candidate/business-owned-reset.mts';
import { createBusinessOwnedHttp } from '../infra/portal-identity-candidate/business-owned-http.mts';
import { createBusinessOwnedSessionInstaller } from '../infra/portal-identity-candidate/business-owned-session.mts';
import { createBusinessOwnedGuard } from '../infra/portal-identity-candidate/business-owned-guard.mts';
import { createBusinessHttp } from '../infra/portal-identity-candidate/business-http.mts';
import { createOwnedAccessTransport } from '../web/apps/business/src/owned-access-transport.ts';
import type { BusinessHttpDependencies } from '../infra/portal-identity-candidate/business-http-contracts.mts';
import {
  OwnedCodeRejected,
  type OwnedGrant,
} from '../infra/portal-identity-candidate/business-owned-provider.mts';
const policy = {
  enabled: true,
  sendingEnabled: true,
  signupEnabled: true,
  realm: 'business' as const,
  origin: 'https://business.dojipro.com',
  clientId: 'client_business',
  encryptionKey: 'ab'.repeat(32),
  termsVersion: 'terms-v1',
  privacyVersion: 'privacy-v1',
};
const actor = {
  realm: 'business' as const,
  subject: 'user_business',
  sessionId: 'session_business',
  audience: policy.clientId,
  issuer: `https://api.workos.com/user_management/${policy.clientId}`,
  mfaVerified: false,
  expiresAtSeconds: 4600,
};
const tokens = {
  subject: actor.subject,
  accessToken: 'secret-access',
  refreshToken: 'secret-refresh',
};
function fixture(overrides = {}) {
  const calls: string[] = [],
    flows = new Map<string, string>(),
    sessions = new Map<string, string>();
  let consent: unknown;
  const store: BusinessHttpDependencies['store'] = {
    putFlow: async (k, v) => {
      flows.set(k, v);
    },
    consumeFlow: async (k, accept) => {
      const v = flows.get(k);
      if (!v || !accept(v)) return null;
      flows.delete(k);
      return v;
    },
    putSession: async () => {
      throw Error('Owned authentication must not use the legacy unfenced installer');
    },
    withSession: async (k, fn) => {
      const value = sessions.get(k);
      return fn(
        value
          ? {
              value,
              remove: async () => {
                sessions.delete(k);
              },
              replace: async (v) => {
                sessions.set(k, v);
              },
            }
          : { value: null },
      );
    },
  };
  const sessionDeps: BusinessHttpDependencies = {
    store,
    now: () => 1000000,
    verify: async () => {
      calls.push('verify-identity');
      return actor;
    },
    admission: async () => true,
    provider: {
      authorizationUrl: () => '',
      exchange: async () => tokens,
      refresh: async () => tokens,
      revoke: async () => {
        calls.push('revoke');
      },
    },
    application: {
      setup: async () => assert.fail('Unexpected setup in owned authentication test'),
      authorize: async () => {
        calls.push('authorize');
      },
      enroll: async (_, a) => {
        calls.push('enroll');
        consent = a;
      },
      read: async () => ({ state: 'application', revision: 1 }),
      command: async () => ({}),
      workspace: async () => ({}),
    },
  };
  const provider = {
    password: async (): Promise<OwnedGrant> => {
      calls.push('password');
      return { kind: 'verified', tokens };
    },
    create: async () => {
      calls.push('create');
      return actor.subject;
    },
    verify: async (): Promise<OwnedGrant> => {
      calls.push('verify-code');
      return { kind: 'verified', tokens };
    },
    recover: async () => {
      calls.push('recover');
      return null;
    },
    reset: async () => actor.subject,
    mfa: async (): Promise<OwnedGrant> => ({ kind: 'verified', tokens }),
  };
  const guardCalls: { sql: string; parameters: (string | number | null)[] }[] = [];
  let fence = false;
  const guard = createBusinessOwnedGuard(
    { ...policy, admissionHmacKey: 'cd'.repeat(32) },
    async (role, sql, parameters) => {
      assert.equal(role, 'doji_business_session');
      guardCalls.push({ sql, parameters });
      if (sql.includes('admit_owned_auth_v1')) return { state: 'allowed', ticket: parameters[2] };
      assert.ok(sql.includes('put_owned_session_v1'));
      if (fence) return { state: 'denied' };
      assert.equal(parameters[7], actor.subject);
      calls.push('put-session');
      sessions.set(String(parameters[2]), String(parameters[3]));
      return { state: 'ok' };
    },
    () => 1000000,
  );
  const deps = {
    store,
    provider,
    now: () => 1000000,
    guard,
    trustedClientIp: '192.0.2.1',
    rememberReset: async () => {},
    verifyProof: async () => {
      calls.push('admit');
      return true;
    },
    reserve: async () => {
      calls.push('reserve');
      return true;
    },
    install: createBusinessOwnedSessionInstaller(policy, {
      ...sessionDeps,
      guard,
      verify: (request) => sessionDeps.verify(request),
    }),
  };
  const http = createBusinessOwnedHttp({ ...policy, ...overrides }, deps);
  const legacy = createBusinessHttp(policy, sessionDeps);
  let jar = '',
    csrf = '';
  function cookies(response: Response) {
    const values = new Map(jar ? jar.split('; ').map((v) => v.split('=') as [string, string]) : []);
    for (const cookie of response.headers.getSetCookie()) {
      const [name, value] = cookie.split(';')[0]!.split('=');
      if (value) values.set(name!, value);
      else values.delete(name!);
    }
    jar = [...values].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  const request = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
    new Request(policy.origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        origin: policy.origin,
        'sec-fetch-site': 'same-origin',
        cookie: jar,
        ...(body === undefined ? {} : { 'content-type': 'application/json', 'x-doji-csrf': csrf }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  async function bootstrap() {
    const r = await http(request('/auth/owned/bootstrap'));
    assert.equal(r.status, 200);
    cookies(r);
    csrf = (await r.json()).csrf;
  }
  async function post(action: string, body: unknown) {
    const r = await http(request('/auth/owned/' + action, body));
    cookies(r);
    return r;
  }
  return {
    calls,
    guardCalls,
    fence: () => {
      fence = true;
    },
    flows,
    sessions,
    sessionDeps,
    deps,
    http,
    legacy,
    request,
    bootstrap,
    post,
    provider,
    cookies,
    consent: () => consent,
    jar: () => jar,
  };
}
const credentials = { email: 'sample@example.com', password: 'sample-password', proof: 'offline' };
const signup = {
  ...credentials,
  termsAccepted: true,
  privacyAcknowledged: true,
  country: 'US',
  termsVersion: policy.termsVersion,
  privacyVersion: policy.privacyVersion,
};

test('browser reset traverses CSRF HTTP and the fenced coordinator without installing a session', async () => {
  for (const uncertain of [false, true]) {
    const f = fixture();
    let token = 'synthetic-reset-token-123456';
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const order: string[] = [];
    const reset = createBusinessOwnedReset(
      { ...policy, operationHmacKey: 'ef'.repeat(32) },
      {
        provider: {
          reset: async () => {
            order.push('provider');
            if (uncertain) throw Error('lost provider response');
            return actor.subject;
          },
        },
        guard: {
          admit: f.deps.guard.admit,
          beginReset: async () => {
            order.push('fence');
            return 'started';
          },
          completeReset: async () => {
            order.push('complete');
          },
        },
        resolve: async () => ({
          realm: 'business',
          origin: policy.origin,
          issuer: actor.issuer,
          audience: actor.audience,
          subject: actor.subject,
          tokenHash,
          identityKey: 'a'.repeat(64),
          resetId: 'password_reset_offline',
          expires: 1300000,
        }),
        verifyProof: async () => true,
        trustedClientIp: '192.0.2.1',
        now: () => 1000000,
      },
    );
    const http = createBusinessOwnedHttp(policy, { ...f.deps, reset });
    const client = createOwnedAccessTransport(policy, {
      currentOrigin: policy.origin,
      proof: async () => 'offline',
      resetLink: {
        available: () => Boolean(token),
        take: () => {
          const value = token;
          token = '';
          return value;
        },
      },
      request: async (url, init) => {
        const result = await http(
          f.request(
            new URL(String(url)).pathname,
            init?.body ? JSON.parse(String(init.body)) : undefined,
            Object.fromEntries(new Headers(init?.headers)),
          ),
        );
        f.cookies(result);
        assert.ok(!(await result.clone().text()).includes('synthetic-reset'));
        return result;
      },
    });
    assert.deepEqual(
      await client.transport('reset', { password: 'new-password' }, new AbortController().signal),
      { step: uncertain ? 'reset-pending' : 'reset-done' },
    );
    assert.deepEqual(order, uncertain ? ['fence', 'provider'] : ['fence', 'provider', 'complete']);
    assert.equal(f.sessions.size, 0);
    assert.equal(f.jar(), '');
    await assert.rejects(
      client.transport('reset', { password: 'again' }, new AbortController().signal),
    );
    assert.equal(order.filter((v) => v === 'provider').length, 1);
    client.dispose();
  }
});

test('reset route validates binding, exact fields, token and password before coordinator dispatch', async () => {
  const f = fixture();
  let calls = 0;
  const http = createBusinessOwnedHttp(policy, {
    ...f.deps,
    reset: async () => {
      calls++;
      return { step: 'reset-done' };
    },
  });
  await f.bootstrap();
  const body = {
    token: 'synthetic-reset-token-123456',
    password: 'new-password',
    proof: 'offline',
  };
  for (const input of [
    { ...body, subject: 'user_other' },
    { ...body, token: 'short' },
    { ...body, password: '' },
    { ...body, token: 'a'.repeat(8193) },
  ])
    assert.equal((await http(f.request('/auth/owned/reset', input))).status, 400);
  const deniedHeaders: Record<string, string>[] = [
    { origin: 'https://admin.dojipro.com' },
    { 'x-doji-csrf': 'bad' },
    { cookie: '' },
  ];
  for (const headers of deniedHeaders)
    assert.equal((await http(f.request('/auth/owned/reset', body, headers))).status, 403);
  assert.equal(calls, 0);
  await f.post('signin', credentials);
  assert.equal((await http(f.request('/auth/owned/reset', body))).status, 409);
  assert.equal(calls, 0);
});

test('browser transport follows MFA with bounded rejected-code retry and no provider state in JSON', async () => {
  const f = fixture();
  f.provider.password = async () => ({
    kind: 'mfa',
    pendingToken: 'private-pending',
    subject: actor.subject,
    challengeId: 'auth_challenge_test',
    expires: 1300000,
  });
  let attempts = 0;
  f.provider.mfa = async () => {
    if (++attempts === 1) throw new OwnedCodeRejected();
    return { kind: 'verified', tokens };
  };
  const client = createOwnedAccessTransport(policy, {
    currentOrigin: policy.origin,
    proof: async () => 'offline',
    request: async (url, init) => {
      const r = await f.http(
        f.request(
          new URL(String(url)).pathname,
          init?.body ? JSON.parse(String(init.body)) : undefined,
          Object.fromEntries(new Headers(init?.headers)),
        ),
      );
      f.cookies(r);
      const json = await r.clone().text();
      assert.ok(!/private-pending|auth_challenge|handle|secret-access|user_business/.test(json));
      return r;
    },
  });
  const signal = new AbortController().signal;
  assert.deepEqual(await client.transport('signin', credentials, signal), { step: 'mfa' });
  const originalCookie = f.jar();
  assert.equal(f.sessions.size, 0);
  assert.deepEqual(await client.transport('mfa', { code: '000000' }, signal), {
    step: 'mfa',
    codeRejected: true,
  });
  assert.notEqual(f.jar(), originalCookie);
  assert.equal(f.sessions.size, 0);
  assert.deepEqual(await client.transport('mfa', { code: '123456' }, signal), { step: 'complete' });
  assert.equal(attempts, 2);
  assert.equal(f.sessions.size, 1);
  // Provider MFA does not manufacture a workspace step-up receipt.
  assert.equal(actor.mfaVerified, false);
  client.dispose();
});

test('browser transport and server adapter complete signup through an authorized application read', async () => {
  const f = fixture();
  f.provider.password = async () => ({ kind: 'email', pendingToken: 'private-provider-state' });
  const client = createOwnedAccessTransport(policy, {
    currentOrigin: policy.origin,
    proof: async () => 'offline',
    request: async (url, init) => {
      assert.equal(new URL(String(url)).origin, policy.origin);
      assert.equal(init?.credentials, 'same-origin');
      const result = await f.http(
        f.request(
          new URL(String(url)).pathname,
          init?.body ? JSON.parse(String(init.body)) : undefined,
          Object.fromEntries(new Headers(init?.headers)),
        ),
      );
      f.cookies(result);
      return result;
    },
  });
  const signal = new AbortController().signal;
  assert.deepEqual(await client.transport('register', signup, signal), { step: 'verify' });
  assert.equal(f.sessions.size, 0);
  assert.deepEqual(await client.transport('verify', { code: '123456' }, signal), {
    step: 'complete',
  });
  const result = await f.legacy(f.request('/api/application'));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { state: 'application', revision: 1 });
  client.dispose();
});

test('disabled and sending gates block bootstrap and all side effects', async () => {
  for (const gate of [{ enabled: false }, { sendingEnabled: false }]) {
    const f = fixture(gate);
    assert.equal((await f.http(f.request('/auth/owned/bootstrap'))).status, 503);
    assert.deepEqual(f.calls, []);
  }
});
test('same-origin bootstrap creates HttpOnly binding and no provider call', async () => {
  const f = fixture();
  const r = await f.http(
    new Request(policy.origin + '/auth/owned/bootstrap', {
      headers: { 'sec-fetch-site': 'same-origin' },
    }),
  );
  assert.equal(r.status, 200);
  assert.match(r.headers.getSetCookie()[0]!, /HttpOnly; Secure; SameSite=Lax/);
  assert.match((await r.json()).csrf, /^[a-f0-9]{64}$/);
  assert.deepEqual(f.calls, []);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});
test('cross-origin, missing binding, duplicate cookies, CSRF and unknown fields are denied before provider', async () => {
  const f = fixture();
  await f.bootstrap();
  const rejectedHeaders: Record<string, string>[] = [
    { origin: 'https://evil.example' },
    { 'sec-fetch-site': 'cross-site' },
    { cookie: '' },
    { 'x-doji-csrf': 'bad' },
    { cookie: f.jar() + '; ' + f.jar() },
  ];
  for (const headers of rejectedHeaders)
    assert.equal((await f.http(f.request('/auth/owned/signin', credentials, headers))).status, 403);
  assert.equal((await f.post('signin', { ...credentials, subject: 'user_other' })).status, 400);
  assert.deepEqual(f.calls, []);
});
test('owned sign-in installs existing bound session and existing application read accepts it', async () => {
  const f = fixture();
  await f.bootstrap();
  const r = await f.post('signin', credentials);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { step: 'complete' });
  assert.deepEqual(f.calls, ['admit', 'password', 'verify-identity', 'authorize', 'put-session']);
  assert.ok(!r.headers.getSetCookie().join('').includes(tokens.accessToken));
  assert.match(f.jar(), /^__Host-doji_business=/);
  const session = await f.legacy(f.request('/api/session'));
  assert.equal(session.status, 200);
  assert.equal((await session.json()).assurance, 'aal1');
  const application = await f.legacy(f.request('/api/application'));
  assert.deepEqual(await application.json(), { state: 'application', revision: 1 });
  assert.equal((await f.post('signin', credentials)).status, 409);
});
test('registration reserves before creation; enrollment waits for verified email and one-use continuation', async () => {
  const f = fixture();
  f.provider.password = async () => ({ kind: 'email', pendingToken: 'provider-pending-secret' });
  await f.bootstrap();
  const r = await f.post('register', signup);
  assert.deepEqual(await r.json(), { step: 'verify' });
  assert.deepEqual(f.calls, ['admit', 'reserve', 'create']);
  assert.ok(!f.jar().includes('provider-pending-secret'));
  assert.equal(f.sessions.size, 0);
  const completed = await f.post('verify', { code: '123456', proof: 'offline' });
  assert.deepEqual(await completed.json(), { step: 'complete' });
  assert.equal(f.sessions.size, 1);
  const ticket = f.guardCalls[0]!.parameters[2];
  const install = f.guardCalls.find((c) => c.sql.includes('put_owned_session_v1'))!;
  assert.equal(install.parameters[1], ticket);
  assert.notEqual(install.parameters[1], f.guardCalls[1]!.parameters[2]);
  assert.ok(f.calls.indexOf('verify-identity') < f.calls.indexOf('enroll'));
  assert.deepEqual(f.consent(), {
    termsAccepted: true,
    privacyAcknowledged: true,
    country: 'US',
    termsVersion: policy.termsVersion,
    privacyVersion: policy.privacyVersion,
  });
});

test('reset fence denies a verified continuation, revokes its provider session and sets no cookie', async () => {
  const f = fixture();
  f.provider.password = async () => ({ kind: 'email', pendingToken: 'provider-pending-secret' });
  // The owned path must never fall back to the legacy unfenced installer.
  await f.bootstrap();
  await f.post('signin', credentials);
  f.fence();
  const result = await f.post('verify', { code: '123456', proof: 'offline' });
  assert.equal(result.status, 503);
  assert.equal(f.sessions.size, 0);
  assert.equal(result.headers.getSetCookie().length, 0);
  assert.ok(f.calls.includes('revoke'));
  const install = f.guardCalls.find((c) => c.sql.includes('put_owned_session_v1'))!;
  assert.equal(install.parameters[1], f.guardCalls[0]!.parameters[2]);
  assert.ok(!(await result.text()).includes('provider-pending-secret'));
});
test('signup gates and consent cannot be supplied through sign-in or bypassed', async () => {
  const f = fixture({ signupEnabled: false });
  await f.bootstrap();
  assert.equal((await f.post('register', signup)).status, 403);
  assert.deepEqual(f.calls, []);
  const g = fixture();
  await g.bootstrap();
  assert.equal((await g.post('register', { ...signup, termsAccepted: false })).status, 403);
  assert.equal((await g.post('signin', signup)).status, 400);
  assert.deepEqual(g.calls, []);
});
test('identity mismatch prevents enrollment, authorization and session install', async () => {
  const f = fixture();
  f.sessionDeps.verify = async () => ({ ...actor, subject: 'user_other' });
  await f.bootstrap();
  assert.equal((await f.post('signin', credentials)).status, 401);
  assert.equal(f.sessions.size, 0);
  assert.ok(!f.calls.includes('authorize'));
  assert.ok(!f.calls.includes('enroll'));
});
test('failed authorization revokes issued business provider session and returns no credentials', async () => {
  const f = fixture();
  f.sessionDeps.application.authorize = async () => {
    throw Error('sensitive detail');
  };
  await f.bootstrap();
  const r = await f.post('signin', credentials);
  assert.equal(r.status, 503);
  assert.ok(f.calls.includes('revoke'));
  assert.equal(f.sessions.size, 0);
  assert.ok(!(await r.text()).includes('sensitive'));
  assert.equal(r.headers.getSetCookie().length, 0);
});
test('oversized bodies, unsupported reset and MFA without continuation are rejected without side effects', async () => {
  const f = fixture();
  await f.bootstrap();
  assert.equal(
    (await f.post('signin', { ...credentials, password: 'a'.repeat(5000) })).status,
    413,
  );
  assert.equal((await f.post('reset', { token: 'private' })).status, 404);
  assert.equal((await f.post('mfa', { code: '123456', proof: 'offline' })).status, 400);
  assert.deepEqual(f.calls, []);
});
test('recovery is neutral; a provider failure does not expose account existence', async () => {
  const f = fixture();
  f.provider.recover = async () => {
    throw Error('private nonexistent address');
  };
  await f.bootstrap();
  const r = await f.post('recover', { email: credentials.email, proof: 'offline' });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { step: 'check-email' });
});

test('signup password checks return safe field errors before admission or create reservation', async () => {
  const f = fixture();
  await f.bootstrap();
  for (const [password, code] of [
    ['tiny', 'password_too_short'],
    ['x'.repeat(257), 'password_too_long'],
    ['prefix-sample@example.com-suffix', 'password_contains_email'],
  ]) {
    const response = await f.post('register', { ...signup, password });
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { field: 'password', code });
    assert.equal(response.headers.getSetCookie().length, 0);
  }
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.guardCalls, []);
  // Existing short passwords still reach sign-in; new-password policy is not a login policy.
  assert.equal((await f.post('signin', { ...credentials, password: 'tiny' })).status, 200);
});

test('provider password rejection survives HTTP and browser transport without refund, replay or login', async () => {
  const f = fixture();
  f.provider.create = async () => {
    f.calls.push('create');
    throw new BusinessPasswordRejected('password_requirements');
  };
  const client = createOwnedAccessTransport(policy, {
    currentOrigin: policy.origin,
    proof: async () => 'offline',
    request: async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/bootstrap')) {
        await f.bootstrap();
        return f.http(f.request(path));
      }
      return f.http(f.request(path, JSON.parse(String(init?.body))));
    },
  });
  await assert.rejects(
    client.transport('register', signup, new AbortController().signal),
    (error) => error instanceof BusinessPasswordRejected && error.code === 'password_requirements',
  );
  assert.deepEqual(f.calls, ['admit', 'reserve', 'create']);
  assert.equal(f.sessions.size, 0);
  assert.equal(f.flows.size, 0);
});
