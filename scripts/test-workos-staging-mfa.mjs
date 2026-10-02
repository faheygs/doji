// Synthetic provider qualification only. Never imported by a deployed service.
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, createHmac } from 'node:crypto';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { resolve } from 'node:path';
import { createPortalIdentityVerifier } from '../infra/portal-identity-candidate/verify.mjs';
import { createWorkosSessionReader } from '../infra/portal-identity-candidate/workos-session.mjs';
import { createWorkosBusinessProvider } from '../infra/portal-identity-candidate/workos-business-provider.mjs';
import { createWorkosEmployeeProvider } from '../infra/portal-identity-candidate/workos-employee-provider.mjs';
import { boundedBody } from '../infra/portal-identity-candidate/bounded-body.mjs';

function check(ok, label) {
  if (!ok) throw Error(label);
}
function totp(secret, seconds = Date.now() / 1000) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) {
    check(alphabet.includes(c), 'Invalid synthetic factor secret');
    bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  }
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(seconds / 30)));
  const digest = createHmac('sha1', key).update(counter).digest();
  return String((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000).padStart(6, '0');
}
check(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59) === '287082', 'RFC TOTP vector');
if (!process.argv.includes('--run-staging')) {
  console.log(
    'PASS RFC TOTP vector. No network calls; hosted qualification requires --run-staging.',
  );
  process.exit(0);
}
const root = resolve('.artifacts/workos-staging');
const config = JSON.parse(readFileSync(resolve(root, 'credentials.json'), 'utf8'));
const expected = {
  employee: ['environment_01M3T5GJ8PRV7JJB3P9CPXRNHF', 'client_01M3T5GJM7JZVQQ7CGHNJD0QMZ'],
  business: ['environment_01M3T51295MF7KN0PSYACY5AQN', 'client_01M3T512MY3QKK7QVFYGWJ1WDR'],
};
check(config.stagingOnly === true, 'Staging-only configuration required');
for (const [realm, [environment, clientId]] of Object.entries(expected)) {
  check(
    config[realm]?.environment === environment &&
      config[realm]?.clientId === clientId &&
      /^sk_[A-Za-z0-9_-]{20,}$/.test(config[realm]?.apiKey || ''),
    'Exact staging configuration required',
  );
}
check(config.employee.apiKey !== config.business.apiKey, 'Distinct staging keys required');
const email = `doji-mfa-${randomBytes(10).toString('hex')}@doji-isolation.test`;
const password = randomBytes(32).toString('base64url') + 'aA9!';
const path = resolve(root, `mfa-${Date.now()}.json`);
const report = { synthetic: true, email, users: {}, results: [], completed: false };
const save = () => writeFileSync(path, JSON.stringify(report, null, 2), { mode: 0o600 });
const pass = (label) => {
  report.results.push(label);
  save();
  console.log('PASS: ' + label);
};
let requests = 0;
const sessions = new Map();
const keys = {};
const keyDocuments = {};
const qualified = new Map();
const businessProvider = createWorkosBusinessProvider(config.business, async (url, options) => {
  check(++requests <= 40, 'Request budget exhausted');
  check(
    [
      'https://api.workos.com/user_management/authenticate',
      'https://api.workos.com/user_management/sessions/revoke',
    ].includes(url),
    'Unapproved business provider route',
  );
  return fetch(url, options);
});
async function api(realm, pathname, body) {
  check(++requests <= 40, 'Request budget exhausted');
  check(
    /^\/user_management\//.test(pathname) ||
      /^\/auth\/factors\/auth_factor_[A-Za-z0-9]+\/challenge$/.test(pathname),
    'Provider route denied',
  );
  const r = await fetch('https://api.workos.com' + pathname, {
    method: body ? 'POST' : 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${config[realm].apiKey}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await r.text();
  check(raw.length < 262144, 'Oversized response');
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw Error('Non-JSON provider response');
  }
  return { status: r.status, ok: r.ok, data };
}
function good(r, label) {
  const code = /^[a-z_]{2,80}$/.test(r.data.code || '') ? r.data.code : 'unclassified';
  check(r.ok, `${label}: HTTP ${r.status} (${code})`);
  return r.data;
}
function denied(r, label) {
  check(
    [400, 401, 403, 404, 422].includes(r.status) && !r.data.access_token && !r.data.refresh_token,
    label,
  );
  pass(label);
}
const auth = (realm, data) =>
  api(realm, '/user_management/authenticate', {
    client_id: config[realm].clientId,
    client_secret: config[realm].apiKey,
    ...data,
  });
const login = (realm) => auth(realm, { grant_type: 'password', email, password });
function pending(r, code) {
  report.lastMfaGate = {
    status: r.status,
    code: /^[a-z_]{2,80}$/.test(r.data.code || '') ? r.data.code : 'unclassified',
    hasAccessToken: typeof r.data.access_token === 'string',
    hasPendingToken: typeof r.data.pending_authentication_token === 'string',
    userMatches: r.data.user?.id === report.users.employee,
  };
  save();
  check(
    [400, 403].includes(r.status) &&
      r.data.code === code &&
      r.data.user?.id === report.users.employee &&
      typeof r.data.pending_authentication_token === 'string' &&
      !r.data.access_token,
    'Expected exact employee MFA gate: ' +
      code +
      ' (HTTP ' +
      r.status +
      ', ' +
      report.lastMfaGate.code +
      ')',
  );
  return r.data;
}
async function verify(realm, data) {
  check(
    data.user?.id === report.users[realm] && data.user?.email === email,
    'Synthetic identity mismatch',
  );
  if (!keys[realm]) {
    const r = await fetch(`https://api.workos.com/sso/jwks/${config[realm].clientId}`, {
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    check(r.ok, 'JWKS unavailable');
    keyDocuments[realm] = await r.json();
    keys[realm] = createLocalJWKSet(keyDocuments[realm]);
  }
  const { payload } = await jwtVerify(data.access_token, keys[realm], { algorithms: ['RS256'] });
  check(
    payload.sub === report.users[realm] && /^session_[A-Za-z0-9]+$/.test(payload.sid || ''),
    'Signed fixture session mismatch',
  );
  sessions.set(realm + ':' + payload.sid, { realm, id: payload.sid });
  check(
    payload.iss === `https://api.workos.com/user_management/${config[realm].clientId}` &&
      payload.client_id === config[realm].clientId,
    'Wrong signed directory',
  );
  check(payload.aud === config[realm].clientId, 'Exact custom staging audience missing');
  report[realm + 'TokenContract'] = {
    audience: payload.aud ?? null,
    hasAmr: 'amr' in payload,
    hasAal: 'aal' in payload,
  };
  save();
  return payload;
}
async function qualifyAdapter(realm, data, completedTotpGrant) {
  const payload = await verify(realm, data);
  const identity = {
    realm,
    issuer: payload.iss,
    audience: config[realm].clientId,
    subject: payload.sub,
    sessionId: payload.sid,
  };
  // Harness-only receipt, issued solely after this run's successful server TOTP grant.
  // Production needs a durable protected receipt lifecycle, not an in-memory test map.
  const receipt = completedTotpGrant
    ? {
        ...identity,
        method: 'workos-totp-grant',
        verifiedAtMs: Date.now(),
        expiresAtSeconds: payload.exp,
      }
    : null;
  const budgetFetch = (...args) => {
    check(++requests <= 40, 'Request budget exhausted');
    return fetch(...args);
  };
  const origin = `https://${realm}.doji-isolation.test`;
  const verifier = createPortalIdentityVerifier(
    { enabled: true, ...identity, origin, maxTokenAgeSeconds: 3600, jwks: keyDocuments[realm] },
    createWorkosSessionReader(
      { enabled: true, realm, ...config[realm] },
      async () => receipt,
      budgetFetch,
    ),
  );
  const request = () =>
    new Request(origin + '/verify', {
      headers: { origin, authorization: `Bearer ${data.access_token}` },
    });
  const result = await verifier(request());
  check(
    result.subject === payload.sub && result.mfaVerified === completedTotpGrant,
    'Provider adapter result mismatch',
  );
  qualified.set(realm, { verifier, request });
  pass(realm + ' signed token passes strict verifier and live provider session adapter');
}
try {
  save(); // No provider mutation until local evidence is writable.
  for (const realm of ['employee', 'business']) {
    const existing = good(
      await api(realm, '/user_management/users?limit=1&email=' + encodeURIComponent(email)),
      'Fixture preflight',
    );
    check(existing.data?.length === 0, 'Refusing existing fixture');
    const u = good(
      await api(realm, '/user_management/users', {
        email,
        password,
        email_verified: true,
        first_name: 'Synthetic',
        last_name: 'MFA Qualification',
      }),
      'Fixture creation',
    );
    check(/^user_[A-Za-z0-9]+$/.test(u.id) && u.email === email, 'Fixture receipt mismatch');
    report.users[realm] = u.id;
    save();
  }
  const enrollPending = pending(await login('employee'), 'mfa_enrollment');
  pass('employee password alone requires MFA enrollment and issues no session');
  const enrolled = good(
    await api('employee', `/user_management/users/${report.users.employee}/auth_factors`, {
      type: 'totp',
      totp_issuer: 'Doji Synthetic Staging',
      totp_user: email,
    }),
    'TOTP enrollment',
  );
  const factor = enrolled.authentication_factor;
  const challenge = enrolled.authentication_challenge;
  check(
    /^auth_factor_[A-Za-z0-9]+$/.test(factor?.id || '') &&
      /^auth_challenge_[A-Za-z0-9]+$/.test(challenge?.id || '') &&
      factor.type === 'totp',
    'TOTP enrollment receipt',
  );
  const mfa = (realm, pendingToken, challengeId, code) =>
    auth(realm, {
      grant_type: 'urn:workos:oauth:grant-type:mfa-totp',
      pending_authentication_token: pendingToken,
      authentication_challenge_id: challengeId,
      code,
    });
  const wrong = totp(factor.totp.secret, Date.now() / 1000 + 86400);
  denied(
    await mfa('employee', enrollPending.pending_authentication_token, challenge.id, wrong),
    'incorrect TOTP cannot complete employee login',
  );
  const firstAcceptedCode = totp(factor.totp.secret);
  const session = good(
    await mfa(
      'employee',
      enrollPending.pending_authentication_token,
      challenge.id,
      firstAcceptedCode,
    ),
    'Complete employee TOTP',
  );
  await qualifyAdapter('employee', session, true);
  pass('valid employee TOTP completes exact pending login with signed session');
  denied(
    await mfa(
      'employee',
      enrollPending.pending_authentication_token,
      challenge.id,
      totp(factor.totp.secret),
    ),
    'completed employee MFA login cannot be replayed',
  );
  const next = pending(await login('employee'), 'mfa_challenge');
  check(
    next.authentication_factors?.some((f) => f.id === factor.id && f.type === 'totp'),
    'Exact enrolled factor absent',
  );
  pass('subsequent employee password login still requires MFA');
  const nextChallenge = good(
    await api('employee', `/auth/factors/${factor.id}/challenge`, {}),
    'New TOTP challenge',
  );
  check(/^auth_challenge_[A-Za-z0-9]+$/.test(nextChallenge.id || ''), 'Challenge ID missing');
  denied(
    await mfa(
      'business',
      next.pending_authentication_token,
      nextChallenge.id,
      totp(factor.totp.secret),
    ),
    'employee pending MFA token rejected by business directory',
  );
  if (process.argv.includes('--employee-adapter')) {
    const provider = createWorkosEmployeeProvider(
      {
        ...config.employee,
        enabled: true,
        realm: 'employee',
        origin: 'https://employee.doji-isolation.test',
        encryptionKey: randomBytes(32).toString('hex'),
        maxMfaAgeSeconds: 3600,
        maxTokenAgeSeconds: 3600,
        jwks: keyDocuments.employee,
      },
      async (url, options) => {
        check(++requests <= 40, 'Request budget exhausted');
        check(
          [
            'https://api.workos.com/user_management/authenticate',
            `https://api.workos.com/auth/factors/${factor.id}/challenge`,
            `https://api.workos.com/user_management/users/${report.users.employee}`,
            `https://api.workos.com/user_management/users/${report.users.employee}/sessions?limit=10`,
          ].includes(url),
          'Unapproved employee adapter route',
        );
        const response = await fetch(url, options);
        const bytes = await boundedBody(response.body, options.signal, 65536);
        const data = JSON.parse(new TextDecoder().decode(bytes));
        report.employeeAdapterLastResponse = {
          status: response.status,
          code: /^[a-z_]{2,80}$/.test(data.code || '') ? data.code : null,
          challengeIdValid: /^auth_challenge_[A-Za-z0-9]+$/.test(data.id || ''),
          challengeFactorMatches: data.authentication_factor_id === factor.id,
          challengeExpiryValid: Number.isFinite(Date.parse(data.expires_at)),
        };
        save();
        return new Response(bytes, { status: response.status, headers: response.headers });
      },
    );
    report.employeeAdapterStage = 'begin';
    save();
    const started = await provider.begin(email, password, AbortSignal.timeout(15000));
    check(started.enrollmentRequired === false, 'Unexpected employee re-enrollment');
    report.employeeAdapterStage = 'prepare';
    save();
    const prepared = await provider.prepare(started.pending, AbortSignal.timeout(15000));
    check(!prepared.enrollmentSecret, 'Existing factor secret returned');
    // WorkOS prevents reusing a successfully consumed TOTP in another login.
    // Wait one bounded interval instead of weakening verification or retrying it.
    if (totp(factor.totp.secret) === firstAcceptedCode) {
      report.employeeAdapterStage = 'next_totp_interval';
      save();
      await new Promise((resolve) => setTimeout(resolve, 31000 - (Date.now() % 30000)));
    }
    report.employeeAdapterStage = 'complete';
    save();
    const completed = await provider.complete(
      prepared.pending,
      totp(factor.totp.secret),
      AbortSignal.timeout(15000),
    );
    check(
      completed.subject === report.users.employee && completed.identity.mfaVerified === true,
      'Employee adapter identity mismatch',
    );
    sessions.set('employee:' + completed.identity.sessionId, {
      realm: 'employee',
      id: completed.identity.sessionId,
    });
    pass('employee provider adapter completes TOTP and seals exact-session MFA receipt');
    report.employeeAdapterStage = 'refresh';
    save();
    const updated = await provider.refresh(
      { ...completed, sessionId: completed.identity.sessionId },
      AbortSignal.timeout(15000),
    );
    check(
      updated.identity.sessionId === completed.identity.sessionId &&
        updated.mfaReceipt === completed.mfaReceipt,
      'Employee refresh changed session or renewed MFA receipt',
    );
    pass('employee adapter refresh retains session and original MFA deadline');
    report.employeeAdapterStage = 'verify';
    save();
    const verified = await provider.verify(
      updated.accessToken,
      updated.mfaReceipt,
      updated.subject,
      AbortSignal.timeout(15000),
    );
    check(verified.mfaVerified === true, 'Employee sealed proof revalidation failed');
    pass('employee adapter revalidates sealed MFA receipt against active provider session');
  }
  const businessSession = good(await login('business'), 'Business password independence');
  await qualifyAdapter('business', businessSession, false);
  pass('same-email business login does not inherit employee MFA requirement');
  const refreshed = await businessProvider.refresh(
    businessSession.refresh_token,
    AbortSignal.timeout(15000),
  );
  check(refreshed.subject === report.users.business, 'Refresh changed business identity');
  const before = await jwtVerify(businessSession.access_token, keys.business);
  const after = await jwtVerify(refreshed.accessToken, keys.business);
  check(before.payload.sid === after.payload.sid, 'Refresh changed provider session');
  pass('new business provider adapter refresh preserves exact subject and session');
  const factors = good(
    await api('business', `/user_management/users/${report.users.business}/auth_factors`),
    'Business factor read',
  );
  check(
    Array.isArray(factors.data) && factors.data.length === 0,
    'Employee factor leaked into business',
  );
  pass('employee TOTP enrollment leaves business factors empty');
  report.completed = true;
  report.limitations = [
    'Synthetic API test, not hosted browser onboarding',
    'No Doji member or production account changed',
    'MFA result must be bound server-side to exact session; enrollment or default JWT alone is not MFA evidence',
    'Portal lifecycle and production cutover remain gated',
  ];
} catch (error) {
  report.failure = error.name === 'TypeError' ? 'Provider network failure' : error.message;
  console.error('STOP: ' + report.failure);
  process.exitCode = 1;
} finally {
  // Fresh fixture-only session enumeration catches a session even if token contract validation failed.
  for (const [realm, user] of Object.entries(report.users)) {
    try {
      const listed = good(
        await api(realm, `/user_management/users/${user}/sessions?limit=10`),
        'Cleanup fixture sessions',
      );
      check(
        Array.isArray(listed.data) && !listed.list_metadata?.after,
        'Unbounded cleanup refused',
      );
      for (const s of listed.data)
        if (s.status === 'active' && s.user_id === user && /^session_[A-Za-z0-9]+$/.test(s.id))
          sessions.set(realm + ':' + s.id, { realm, id: s.id });
    } catch {
      report.cleanupIncomplete = true;
    }
  }
  for (const { realm, id } of sessions.values()) {
    try {
      if (realm === 'business') {
        await businessProvider.revoke(id, AbortSignal.timeout(15000));
        pass('new business provider adapter revokes exact synthetic session');
      } else
        good(
          await api(realm, '/user_management/sessions/revoke', { session_id: id }),
          'Revoke test session',
        );
    } catch {
      report.cleanupIncomplete = true;
    }
  }
  for (const [realm, { verifier, request }] of qualified) {
    try {
      let rejected = false;
      try {
        await verifier(request());
      } catch {
        rejected = true;
      }
      check(rejected, 'Revoked session accepted');
      pass(realm + ' revoked session rejected despite still-signed access token');
    } catch {
      report.completed = false;
      report.cleanupIncomplete = true;
      process.exitCode = 1;
    }
  }
  report.requests = requests;
  report.syntheticUsersRetained = true;
  save();
  console.log('Sanitized evidence: ' + path);
}
