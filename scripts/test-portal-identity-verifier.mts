// Offline JWT cryptography and stubbed provider-session tests. No hosted calls.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createPortalIdentityVerifier } from '../infra/portal-identity-candidate/verify.mts';
import type { JWTPayload, JWSHeaderParameters } from 'jose';
import type { PortalIdentity } from '../infra/portal-identity-candidate/portal-contracts.mts';
import { present } from './employee-test-fixtures.mts';
type Policy = Parameters<typeof createPortalIdentityVerifier>[0];
type Keys = Awaited<ReturnType<typeof generateKeyPair>>;

const business = await generateKeyPair('ES256');
const employee = await generateKeyPair('ES256');
const member = await generateKeyPair('ES256');
const jwks = async (key: Keys) => ({
  keys: [{ ...(await exportJWK(key.publicKey)), kid: 'key-1', alg: 'ES256', use: 'sig' }],
});
const base: Policy = {
  realm: 'business',
  enabled: true,
  issuer: 'https://issuer.example.test/',
  audience: 'business-client',
  origin: 'https://business.example.test',
  maxTokenAgeSeconds: 300,
  jwks: await jwks(business),
};
const staff: Policy = {
  ...base,
  realm: 'employee',
  audience: 'employee-client',
  origin: 'https://admin.example.test',
  jwks: await jwks(employee),
};
const claims = (policy = base) => ({
  iss: policy.issuer,
  aud: policy.audience,
  sub: 'same-provider-subject',
  sid: 'same-session-id',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 240,
  email: 'same@example.test',
  email_verified: true,
  role: 'super_admin',
  aal: 'aal2',
});
const sign = (
  body: JWTPayload = claims(),
  key = business,
  header: Partial<JWSHeaderParameters> = {},
) =>
  new SignJWT(body)
    .setProtectedHeader({ alg: 'ES256', kid: 'key-1', ...header })
    .sign(key.privateKey);
const request = (token: string, origin = base.origin, signal?: AbortSignal) =>
  new Request(origin + '/api', { headers: { authorization: `Bearer ${token}`, origin }, signal });
const session = async (identity: PortalIdentity) => ({
  ...identity,
  active: true,
  emailVerified: true,
  mfaVerified: true,
  observedAtMs: Date.now(),
  expiresAtSeconds: Math.floor(Date.now() / 1000) + 240,
});
const reject = async (fn: () => Promise<unknown>) =>
  assert.rejects(fn, { message: 'Portal identity could not be verified' });

test('valid business identity excludes email and provider role from authority', async () => {
  const result = await createPortalIdentityVerifier(base, session)(request(await sign()));
  assert.equal(result.realm, 'business');
  assert.equal(result.subject, 'same-provider-subject');
  assert.equal('email' in result, false);
  assert.equal('role' in result, false);
  assert.equal('principalId' in result, false);
});
test('same email and provider subject remain distinct by pinned employee directory', async () => {
  const result = await createPortalIdentityVerifier(
    staff,
    session,
  )(request(await sign(claims(staff), employee), staff.origin));
  assert.equal(result.realm, 'employee');
  assert.equal(result.audience, 'employee-client');
  await reject(async () =>
    createPortalIdentityVerifier(staff, session)(request(await sign(), staff.origin)),
  );
});
for (const [name, mutation] of [
  ['wrong issuer', { iss: 'https://attacker.example.test/' }],
  ['wrong audience', { aud: 'employee-client' }],
  ['multiple audiences', { aud: ['business-client', 'employee-client'] }],
  ['missing audience', { aud: undefined }],
  ['missing session', { sid: undefined }],
  ['missing subject', { sub: undefined }],
  ['blank subject', { sub: ' ' }],
  ['expired', { exp: Math.floor(Date.now() / 1000) - 1 }],
  ['future issued', { iat: Math.floor(Date.now() / 1000) + 20 }],
  ['future not-before', { nbf: Math.floor(Date.now() / 1000) + 20 }],
  ['excess lifetime', { exp: Math.floor(Date.now() / 1000) + 600 }],
  ['missing expiration', { exp: undefined }],
  ['missing issued', { iat: undefined }],
  ['oversized subject', { sub: 'x'.repeat(257) }],
] satisfies [string, JWTPayload][])
  test(name + ' fails before session lookup', async () => {
    let calls = 0;
    const verify = createPortalIdentityVerifier(base, () => {
      calls++;
      throw Error('should not call');
    });
    await reject(() => sign({ ...claims(), ...mutation }).then((t) => verify(request(t))));
    assert.equal(calls, 0);
  });
test('member signed token rejected even when spoofing employee/business claims', async () => {
  await reject(() =>
    sign(claims(), member).then((t) => createPortalIdentityVerifier(base, session)(request(t))),
  );
});
test('missing or disabled flag denies all', async () => {
  const token = await sign();
  for (const enabled of [false, undefined, 'true'])
    await reject(async () => {
      const verify: unknown = Reflect.apply(createPortalIdentityVerifier, undefined, [
        { ...base, enabled },
        session,
      ]);
      assert.equal(typeof verify, 'function');
      if (typeof verify !== 'function') assert.fail('Expected verifier');
      return Reflect.apply(verify, undefined, [request(token)]);
    });
});
test('wrong origin rejected', async () => {
  await reject(() =>
    sign().then((t) => createPortalIdentityVerifier(base, session)(request(t, staff.origin))),
  );
});
test('token selected key URL cannot change pinned keys', async () => {
  await reject(() =>
    sign(claims(), business, { jku: 'https://attacker.example.test/keys' }).then((t) =>
      createPortalIdentityVerifier(base, session)(request(t)),
    ),
  );
});
for (const [name, patch] of [
  ['revoked', { active: false }],
  ['unverified email', { emailVerified: false }],
  ['wrong subject', { subject: 'another' }],
  ['wrong realm', { realm: 'employee' }],
  ['wrong environment', { audience: 'another' }],
  ['wrong issuer', { issuer: 'https://other.example.test/' }],
  ['wrong session', { sessionId: 'another' }],
  ['missing MFA evidence', { mfaVerified: undefined }],
  ['stale session check', { observedAtMs: Date.now() - 10000 }],
  ['expired provider session', { expiresAtSeconds: 1 }],
] as const)
  test(name + ' provider evidence fails closed', async () => {
    const verify = createPortalIdentityVerifier(base, async (id) => ({
      ...(await session(id)),
      ...patch,
    }));
    await reject(() => sign().then((t) => verify(request(t))));
  });
test('employee MFA cannot be supplied by JWT aal claim alone', async () => {
  const verify = createPortalIdentityVerifier(staff, async (id) => ({
    ...(await session(id)),
    mfaVerified: false,
  }));
  await reject(() => sign(claims(staff), employee).then((t) => verify(request(t, staff.origin))));
});
test('business password-only identity may resolve; workspace MFA remains a later permission gate', async () => {
  const verify = createPortalIdentityVerifier(base, async (id) => ({
    ...(await session(id)),
    mfaVerified: false,
  }));
  assert.equal((await verify(request(await sign()))).mfaVerified, false);
});
test('provider failure has no raw sensitive output', async () => {
  const verify = createPortalIdentityVerifier(base, async () => {
    throw Error('private token and email');
  });
  await reject(() => sign().then((t) => verify(request(t))));
});

test('non-cooperating provider session check times out without granting access', async () => {
  const keepAlive = setTimeout(() => {}, 6000);
  try {
    const verify = createPortalIdentityVerifier(base, () => new Promise(() => {}));
    await reject(() => sign().then((t) => verify(request(t))));
  } finally {
    clearTimeout(keepAlive);
  }
});

test('symmetric forgery and corrupted signature fail before provider lookup', async () => {
  let calls = 0;
  const verify = createPortalIdentityVerifier(base, async () => {
    calls++;
    return null;
  });
  const forged = await new SignJWT(claims())
    .setProtectedHeader({ alg: 'HS256', kid: 'key-1' })
    .sign(new Uint8Array(32));
  await reject(() => verify(request(forged)));
  const parts = (await sign()).split('.');
  const signature = present(parts[2]);
  parts[2] = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
  await reject(() => verify(request(parts.join('.'))));
  assert.equal(calls, 0);
});
test('abort during session check rejects late result', async () => {
  const controller = new AbortController();
  let finish: () => void = () => assert.fail('Gate not initialized');
  let started: () => void = () => assert.fail('Gate not initialized');
  const ready = new Promise<void>((r) => {
    started = r;
  });
  const verify = createPortalIdentityVerifier(base, async (id) => {
    started();
    await new Promise<void>((r) => {
      finish = r;
    });
    return session(id);
  });
  const pending = verify(request(await sign(), base.origin, controller.signal));
  await ready;
  controller.abort();
  await reject(() => pending);
  finish();
});
test('trusted config snapshot cannot be mutated after construction', async () => {
  const config = structuredClone(base);
  const verify = createPortalIdentityVerifier(config, session);
  config.origin = staff.origin;
  await reject(() => sign().then((t) => verify(request(t, staff.origin))));
});
test('private keys, duplicate kids, unsupported realm and insecure issuer rejected', async () => {
  for (const patch of [
    { realm: 'member' },
    { issuer: 'http://issuer.example.test/' },
    { jwks: { keys: [{ ...base.jwks.keys[0], d: 'secret' }] } },
    { jwks: { keys: [base.jwks.keys[0], base.jwks.keys[0]] } },
  ])
    assert.throws(() =>
      Reflect.apply(createPortalIdentityVerifier, undefined, [{ ...base, ...patch }, session]),
    );
});
