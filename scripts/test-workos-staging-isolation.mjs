// Explicitly approved hosted SYNTHETIC qualification, not a production adapter.
// No Supabase/Doji calls, billing APIs, paid connections or real email addresses.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { resolve } from 'node:path';
const root = resolve('.artifacts/workos-staging');
const expected = {
  business: {
    environment: 'environment_01M3T51295MF7KN0PSYACY5AQN',
    clientId: 'client_01M3T512MY3QKK7QVFYGWJ1WDR',
  },
  employee: {
    environment: 'environment_01M3T5GJ8PRV7JJB3P9CPXRNHF',
    clientId: 'client_01M3T5GJM7JZVQQ7CGHNJD0QMZ',
  },
};
const check = (condition, label) => {
  if (!condition) throw Error(label);
};
const run = process.argv.includes('--run-staging');
if (!run) {
  console.log(
    'No network calls. Use --run-staging only for the two owner-approved synthetic staging directories.',
  );
  process.exit(0);
}
check(existsSync(resolve(root, 'credentials.json')), 'Staging credential handoff is not complete');
const config = JSON.parse(readFileSync(resolve(root, 'credentials.json'), 'utf8'));
check(config.stagingOnly === true, 'Staging-only configuration required');
for (const realm of Object.keys(expected)) {
  check(
    config[realm]?.environment === expected[realm].environment &&
      config[realm]?.clientId === expected[realm].clientId,
    'Exact staging directory required',
  );
  check(
    /^sk_[A-Za-z0-9_-]{20,}$/.test(config[realm]?.apiKey || ''),
    'Complete staging key required',
  );
}
check(config.business.apiKey !== config.employee.apiKey, 'Distinct staging credentials required');
let requests = 0;
const results = [],
  created = {},
  sessions = [];
const reportPath = resolve(root, `isolation-${Date.now()}.json`);
// example.com belongs to WorkOS's built-in staging SSO scenario. Use a separate
// reserved .test domain for NEW password-flow fixtures; never alter SSO policy.
// WorkOS drops email delivery for .test: https://workos.com/docs/email
const email = `doji-isolation-${randomBytes(10).toString('hex')}@doji-isolation.test`;
const password = () => randomBytes(32).toString('base64url') + 'aA9!';
const passwords = { business: password(), employee: password() };
const report = {
  synthetic: true,
  scope: 'two WorkOS staging directories only',
  email,
  created,
  results,
  completed: false,
};
const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
const pass = (label) => {
  results.push(label);
  save();
  console.log('PASS: ' + label);
};
async function api(realm, path, body) {
  check(++requests <= 40, 'Bounded request budget exhausted');
  check(path.startsWith('/user_management/'), 'Unapproved provider path');
  const response = await fetch('https://api.workos.com' + path, {
    method: body ? 'POST' : 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${config[realm].apiKey}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  check(text.length < 262144, 'Oversized provider response');
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw Error('Provider returned non-JSON data');
  }
  return { status: response.status, ok: response.ok, data };
}
const good = (r, label) => {
  // Record only bounded enum-style error codes, never provider descriptions,
  // pending authentication tokens, addresses or raw response bodies.
  const code = [r.data.code, r.data.error].find(
    (value) => typeof value === 'string' && /^[a-z][a-z_]{1,79}$/.test(value),
  );
  check(r.ok, label + ` (HTTP ${r.status}${code ? ', ' + code : ''})`);
  return r.data;
};
const denied = (r, label) => {
  check([400, 401, 403, 404, 422].includes(r.status) && !r.data.access_token, label);
  pass(label);
};
const auth = (realm, body) =>
  api(realm, '/user_management/authenticate', {
    client_id: config[realm].clientId,
    client_secret: config[realm].apiKey,
    ...body,
  });
const login = (realm, pw) => auth(realm, { grant_type: 'password', email, password: pw });
const keys = {};
async function verify(realm, data) {
  check(
    data.user?.id === created[realm] &&
      data.user?.email === email &&
      typeof data.refresh_token === 'string',
    'Authenticated synthetic identity mismatch',
  );
  if (!keys[realm]) {
    const r = await fetch(`https://api.workos.com/sso/jwks/${config[realm].clientId}`, {
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    check(r.ok, 'Staging public key read failed');
    keys[realm] = createLocalJWKSet(await r.json());
  }
  // Qualification records the exact observed issuer/audience. This is NOT the
  // production verifier and never grants access to a Doji database or portal.
  const { payload } = await jwtVerify(data.access_token, keys[realm], { algorithms: ['RS256'] });
  check(
    payload.sub === created[realm] && typeof payload.sid === 'string',
    'Signed token identity/session mismatch',
  );
  // Track a verified exact fixture session for cleanup even if contract checks fail.
  sessions.push({ realm, id: payload.sid });
  const issuerUrl = new URL(payload.iss);
  report[realm + 'IssuerDiagnostic'] = {
    origin: issuerUrl.origin,
    path: /^\/(?:user_management\/)?client_[A-Za-z0-9]+\/?$/.test(issuerUrl.pathname)
      ? issuerUrl.pathname
      : issuerUrl.pathname === '/'
        ? '/'
        : '[non-client path omitted]',
  };
  save();
  check(
    payload.iss === `https://api.workos.com/user_management/${expected[realm].clientId}`,
    'Unexpected provider issuer',
  );
  check(payload.exp > Math.floor(Date.now() / 1000), 'Expired staging token');
  report[realm + 'TokenContract'] = {
    issuer: payload.iss,
    audience: payload.aud ?? null,
    clientIdMatches: payload.client_id === config[realm].clientId,
    hasMfaClaim: Object.hasOwn(payload, 'amr') || Object.hasOwn(payload, 'aal'),
  };
  save();
  return data;
}
try {
  // Verify evidence can be persisted before making any provider request.
  save();
  for (const realm of Object.keys(expected)) {
    const list = good(
      await api(realm, '/user_management/users?limit=1&email=' + encodeURIComponent(email)),
      'Synthetic identity preflight',
    );
    check(
      Array.isArray(list.data) && list.data.length === 0,
      'Synthetic address already exists; refusing reuse',
    );
  }
  for (const realm of Object.keys(expected)) {
    const user = good(
      await api(realm, '/user_management/users', {
        email,
        password: passwords[realm],
        email_verified: true,
        first_name: 'Synthetic',
        last_name: 'Isolation Test',
      }),
      'Create synthetic ' + realm + ' account',
    );
    check(
      /^user_[A-Za-z0-9]+$/.test(user.id) && user.email === email,
      'Invalid synthetic user receipt',
    );
    created[realm] = user.id;
    save();
  }
  check(created.business !== created.employee, 'Same-email identities must differ');
  pass('same email creates distinct business and employee staging users');
  denied(
    await api('business', '/user_management/users/' + created.employee),
    'business key cannot read employee-directory user',
  );
  denied(
    await api('employee', '/user_management/users/' + created.business),
    'employee key cannot read business-directory user',
  );
  let business = await verify(
    'business',
    good(await login('business', passwords.business), 'Business password login'),
  );
  let employee = await verify(
    'employee',
    good(
      await login('employee', passwords.employee),
      'Employee password login before MFA enrollment',
    ),
  );
  pass('both independent passwords authenticate their own synthetic accounts');
  denied(
    await login('business', passwords.employee),
    'employee password cannot log into business account',
  );
  denied(
    await login('employee', passwords.business),
    'business password cannot log into employee account',
  );
  business = await verify(
    'business',
    good(
      await auth('business', {
        grant_type: 'refresh_token',
        refresh_token: business.refresh_token,
      }),
      'Business refresh',
    ),
  );
  pass('business session refresh returns its exact identity');
  const reset = good(
    await api('business', '/user_management/password_reset', { email }),
    'Synthetic business reset request',
  );
  check(
    reset.user_id === created.business && typeof reset.password_reset_token === 'string',
    'Reset must belong to synthetic business account',
  );
  const newPassword = password();
  denied(
    await api('employee', '/user_management/password_reset/confirm', {
      token: reset.password_reset_token,
      new_password: newPassword,
    }),
    'business reset token rejected by employee directory',
  );
  good(
    await api('business', '/user_management/password_reset/confirm', {
      token: reset.password_reset_token,
      new_password: newPassword,
    }),
    'Synthetic business password reset',
  );
  denied(
    await login('business', passwords.business),
    'old business password rejected after business reset',
  );
  denied(
    await auth('business', { grant_type: 'refresh_token', refresh_token: business.refresh_token }),
    'business reset revokes old business refresh session',
  );
  employee = await verify(
    'employee',
    good(
      await auth('employee', {
        grant_type: 'refresh_token',
        refresh_token: employee.refresh_token,
      }),
      'Employee session survives business reset',
    ),
  );
  await verify(
    'employee',
    good(await login('employee', passwords.employee), 'Employee password survives business reset'),
  );
  pass('business reset leaves employee password and existing refresh session working');
  await verify(
    'business',
    good(await login('business', newPassword), 'New business password works'),
  );
  pass('new business password authenticates only its business account');
  denied(
    await api('business', '/user_management/password_reset/confirm', {
      token: reset.password_reset_token,
      new_password: password(),
    }),
    'business reset token cannot be replayed',
  );
  report.completed = true;
  report.limitations = [
    'No member app identity was created or changed',
    'Synthetic users were preverified; no inbox or email-verification UX test',
    'Employee MFA qualification is a separate test',
    'No production cost cap or portal HTTP integration qualification',
  ];
} catch (error) {
  report.failure = error.name === 'TypeError' ? 'Provider network request failed' : error.message;
  console.error('Staging qualification stopped: ' + report.failure);
  process.exitCode = 1;
} finally {
  // Only exact sessions returned by this run; never revoke by email or list real users.
  for (const { realm, id } of [
    ...new Map(sessions.map((s) => [s.realm + ':' + s.id, s])).values(),
  ]) {
    try {
      const r = await api(realm, '/user_management/sessions/revoke', { session_id: id });
      if (!r.ok) report.sessionCleanupIncomplete = true;
    } catch {
      report.sessionCleanupIncomplete = true;
    }
  }
  report.requests = requests;
  report.syntheticUsersRetained = true;
  save();
  console.log('Sanitized evidence: ' + reportPath);
  console.log('Synthetic staging users retained; production untouched.');
}
