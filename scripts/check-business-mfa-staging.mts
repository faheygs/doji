// Explicit, bounded provider qualification. Creates/deletes only this run's
// synthetic business-staging user. Never loads production credentials or SQL.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomBytes, createHmac } from 'node:crypto';
import { resolve } from 'node:path';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { createBusinessMfa } from '../infra/portal-identity-candidate/business-mfa.mts';
import { isRecord } from '../infra/portal-identity-candidate/business-contracts.mts';
import { isVerifiedBusinessActor } from '../infra/portal-identity-candidate/business-http-state.mts';
import type { PortalFetch } from '../infra/portal-identity-candidate/portal-contracts.mts';
import type { JSONWebKeySet } from 'jose';

function totp(secret: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret]
    .map((c) => {
      assert.ok(alphabet.includes(c));
      return alphabet.indexOf(c).toString(2).padStart(5, '0');
    })
    .join('');
  const key = Buffer.from((bits.match(/.{8}/g) || []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  return String((digest.readUInt32BE(digest[19]! & 15) & 0x7fffffff) % 1000000).padStart(6, '0');
}
assert.ok(process.argv.includes('--run-staging'), 'Explicit staging execution required');
const location = process.argv.find((a) => a.startsWith('--credentials='))?.slice(14);
assert.ok(location, 'Explicit staging credential location required');
const credentials: unknown = JSON.parse(await readFile(resolve(location), 'utf8'));
assert.ok(
  isRecord(credentials) && credentials.stagingOnly === true && isRecord(credentials.business),
);
const config = credentials.business;
assert.equal(config.environment, 'environment_01M3T51295MF7KN0PSYACY5AQN');
assert.equal(config.clientId, 'client_01M3T512MY3QKK7QVFYGWJ1WDR');
assert.ok(typeof config.apiKey === 'string' && /^sk_[A-Za-z0-9_-]{20,}$/.test(config.apiKey));
assert.ok(typeof config.clientId === 'string');
let requests = 0,
  userId = '',
  sessionId = '';
const results: string[] = [];
const evidence = {
  at: new Date().toISOString(),
  stagingOnly: true,
  results,
  completed: false,
  cleanedUp: false,
  requests: 0,
  stage: 'created',
};
const email = `doji-business-stepup-${randomBytes(12).toString('hex')}@doji-isolation.test`;
const upstream: PortalFetch = async (url, init) => {
  assert.ok(++requests <= 24, 'Provider request budget exhausted');
  const target = new URL(url);
  assert.equal(target.origin, 'https://api.workos.com');
  assert.ok(
    target.pathname.startsWith('/user_management/') ||
      target.pathname.startsWith('/auth/') ||
      target.pathname.startsWith('/sso/jwks/'),
  );
  return fetch(url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.any([
      init?.signal || AbortSignal.timeout(15000),
      AbortSignal.timeout(15000),
    ]),
  });
};
async function api(path: string, body?: unknown, method = body ? 'POST' : 'GET') {
  const response = await upstream('https://api.workos.com' + path, {
    method,
    headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.ok(response.ok, `Staging provider returned HTTP ${response.status}`);
  if (response.status === 204) return {};
  const text = await response.text();
  assert.ok(text.length < 65536, 'Oversized provider response');
  if (!text && (method === 'DELETE' || path === '/user_management/sessions/revoke')) return {};
  const data: unknown = JSON.parse(text);
  assert.ok(isRecord(data));
  return data;
}
try {
  const password = randomBytes(32).toString('base64url') + 'aA9!';
  const user = await api('/user_management/users', { email, password, email_verified: true });
  assert.ok(typeof user.id === 'string' && /^user_[A-Za-z0-9]+$/.test(user.id));
  userId = user.id;
  assert.equal(user.email, email);
  const auth = await api('/user_management/authenticate', {
    client_id: config.clientId,
    client_secret: config.apiKey,
    grant_type: 'password',
    email,
    password,
  });
  assert.ok(typeof auth.access_token === 'string');
  const jwks = await api(`/sso/jwks/${config.clientId}`);
  assert.ok(Array.isArray(jwks.keys));
  const { payload } = await jwtVerify(
    auth.access_token,
    createLocalJWKSet(jwks as unknown as JSONWebKeySet),
    {
      algorithms: ['RS256'],
      audience: config.clientId,
      issuer: `https://api.workos.com/user_management/${config.clientId}`,
    },
  );
  const actor = {
    realm: 'business',
    issuer: payload.iss,
    audience: config.clientId,
    subject: payload.sub,
    sessionId: payload.sid,
    expiresAtSeconds: payload.exp,
    mfaVerified: false,
  };
  assert.ok(isVerifiedBusinessActor(actor));
  assert.equal(actor.subject, userId);
  sessionId = actor.sessionId;
  const mfa = createBusinessMfa({ clientId: config.clientId, apiKey: config.apiKey }, upstream);
  evidence.stage = 'prepare-enrollment';
  assert.deepEqual(await mfa.prepare(actor, false, AbortSignal.timeout(15000)), {
    enrollmentRequired: true,
  });
  const enrolled = await mfa.prepare(actor, true, AbortSignal.timeout(15000));
  evidence.stage = 'verify-enrollment';
  assert.ok('pending' in enrolled && enrolled.enrollmentSecret);
  assert.equal(mfa.attest(actor, enrolled.pending).mfaVerified, false);
  const receipt = await mfa.complete(
    actor,
    enrolled.pending,
    totp(enrolled.enrollmentSecret),
    AbortSignal.timeout(15000),
  );
  assert.equal(mfa.attest(actor, receipt).mfaVerified, true);
  results.push('Exact staging user/session verified; real enrollment and first challenge passed');
  // Do not reuse the accepted one-time code. Wait at most one 30-second period.
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 31000 - (Date.now() % 30000));
  });
  evidence.stage = 'prepare-existing';
  const existing = await mfa.prepare(actor, false, AbortSignal.timeout(15000));
  assert.ok('pending' in existing && !existing.enrollmentSecret);
  assert.equal(existing.pending.factorId, enrolled.pending.factorId);
  evidence.stage = 'verify-existing';
  const second = await mfa.complete(
    actor,
    existing.pending,
    totp(enrolled.enrollmentSecret),
    AbortSignal.timeout(15000),
  );
  assert.equal(mfa.attest(actor, second).mfaVerified, true);
  assert.equal(mfa.attest({ ...actor, sessionId: 'session_other' }, second).mfaVerified, false);
  results.push('Existing factor challenge and session-bound receipt passed');
  evidence.completed = true;
  evidence.stage = 'passed';
} finally {
  // Exact subject returned by this run's create call; never enumerate/delete other users.
  if (sessionId) await api('/user_management/sessions/revoke', { session_id: sessionId });
  if (userId) {
    const current = await api(`/user_management/users/${userId}`);
    assert.equal(current.email, email, 'Cleanup ownership mismatch');
    await api(`/user_management/users/${userId}`, undefined, 'DELETE');
    evidence.cleanedUp = true;
  }
  evidence.requests = requests;
  await mkdir('test-results/business-mfa-staging', { recursive: true });
  await writeFile(
    `test-results/business-mfa-staging/${Date.now()}.json`,
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence));
}
