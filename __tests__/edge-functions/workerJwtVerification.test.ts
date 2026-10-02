import { createHmac, webcrypto } from 'node:crypto';
import type * as Auth from '../../infra/doji-orchestrator/src/scale-read-auth';

const env = {
  SUPABASE_URL: 'https://database.invalid/',
  SUPABASE_ANON_KEY: 'synthetic',
  SUPABASE_JWT_SECRET: 'local-test-only-secret',
};
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const now = Math.floor(Date.now() / 1000);
const claims = {
  sub: id,
  role: 'authenticated',
  iss: 'https://database.invalid/auth/v1',
  aud: 'authenticated',
  exp: now + 300,
};
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
function token(
  overrides: Record<string, unknown> = {},
  header = { alg: 'HS256' },
  secret = env.SUPABASE_JWT_SECRET,
) {
  const body = `${encode(header)}.${encode({ ...claims, ...overrides })}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
const request = (jwt: string) =>
  new Request('https://gateway.invalid/v1/profiles/person', {
    headers: { authorization: `Bearer ${jwt}` },
  });
let auth: typeof Auth;
const originalFetch = global.fetch;
const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
const transport = jest.fn();
let ec: CryptoKeyPair;
let rsa: CryptoKeyPair;
beforeAll(async () => {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  ec = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  rsa = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
});
beforeEach(() => {
  jest.isolateModules(() => {
    auth = require('../../infra/doji-orchestrator/src/scale-read-auth');
  });
  transport.mockReset();
  global.fetch = transport;
});
afterEach(() => {
  global.fetch = originalFetch;
});
afterAll(() => {
  if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
  else Reflect.deleteProperty(globalThis, 'crypto');
});
test.each(['', 'Basic token', 'bearer token'])(
  'rejects malformed authorization (%s)',
  async (authorization) => {
    await expect(
      auth.authenticateScaleReadRequest(
        new Request('https://gateway.invalid', { headers: { authorization } }),
        env,
      ),
    ).rejects.toThrow('Authentication required');
  },
);
test.each(['one', 'one.two', '*.eyJ4IjoxfQ.signature', `${encode({ alg: 'HS256' })}.*.signature`])(
  'rejects malformed token parts (%s)',
  async (jwt) => {
    await expect(auth.authenticateScaleReadRequest(request(jwt), env)).rejects.toThrow(
      'Invalid access token',
    );
    expect(transport).not.toHaveBeenCalled();
  },
);
test.each([
  { sub: '' },
  { sub: 'invalid' },
  { role: 'service_role' },
  { iss: 'https://other.invalid/auth/v1' },
  { aud: ['other'] },
  { exp: undefined },
  { exp: now - 31 },
  { nbf: now + 60 },
])('valid signature does not bypass claim validation (%j)', async (override) => {
  await expect(auth.authenticateScaleReadRequest(request(token(override)), env)).rejects.toThrow(
    'Invalid access token',
  );
});
test('a forged signature is rejected', async () => {
  await expect(
    auth.authenticateScaleReadRequest(request(token({}, { alg: 'HS256' }, 'wrong-secret')), env),
  ).rejects.toThrow('Invalid access token');
});
test('legacy verification requires its configured secret', async () => {
  await expect(
    auth.authenticateScaleReadRequest(request(token()), { ...env, SUPABASE_JWT_SECRET: undefined }),
  ).rejects.toThrow('not configured');
});
test.each([{ alg: 'none' }, { alg: 'ES256' }, { kid: 'key' }])(
  'unsupported algorithm or missing key identity is rejected (%j)',
  async (header) => {
    const jwt = `${encode(header)}.${encode(claims)}.AAAA`;
    await expect(auth.authenticateScaleReadRequest(request(jwt), env)).rejects.toThrow(
      'Unsupported access token',
    );
  },
);
test('audience arrays and bounded clock skew accept the same independent member', async () => {
  const jwt = token({ aud: ['other', 'authenticated'], nbf: now + 20, exp: now - 10, aal: 'aal1' });
  expect(await auth.authenticateScaleReadRequest(request(jwt), env)).toEqual({
    userId: id,
    token: jwt,
    aal: 'aal1',
  });
});
test('employee and member identities cannot cross their role boundary', async () => {
  const jwt = token({ role: 'doji_employee', aal: 'aal2' });
  expect(await auth.authenticateEmployeePortalRequest(request(jwt), env)).toMatchObject({
    userId: id,
    aal: 'aal2',
  });
  await expect(auth.authenticateScaleReadRequest(request(jwt), env)).rejects.toThrow(
    'Invalid access token',
  );
  await expect(auth.authenticateEmployeePortalRequest(request(token()), env)).rejects.toThrow(
    'Invalid access token',
  );
});
async function asymmetric(algorithm: 'ES256' | 'RS256', kid = 'candidate') {
  const pair = algorithm === 'ES256' ? ec : rsa;
  const header = encode({ alg: algorithm, kid });
  const payload = encode(claims);
  const body = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    algorithm === 'ES256' ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'RSASSA-PKCS1-v1_5' },
    pair.privateKey,
    new TextEncoder().encode(body),
  );
  const key = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid };
  return { jwt: `${body}.${Buffer.from(signature).toString('base64url')}`, key };
}
test.each(['ES256', 'RS256'] as const)(
  'verifies %s using the actual public key and reuses bounded JWKS reads',
  async (algorithm) => {
    const { jwt, key } = await asymmetric(algorithm);
    transport.mockImplementation(async () => Response.json({ keys: [key] }));
    expect(await auth.authenticateScaleReadRequest(request(jwt), env)).toMatchObject({
      userId: id,
    });
    expect(await auth.authenticateScaleReadRequest(request(jwt), env)).toMatchObject({
      userId: id,
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledWith(
      'https://database.invalid/auth/v1/.well-known/jwks.json',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  },
);
test('unknown cached key refreshes once and accepts a rotated key', async () => {
  const { jwt, key } = await asymmetric('ES256');
  transport
    .mockResolvedValueOnce(Response.json({ keys: [{ ...key, kid: 'older' }] }))
    .mockResolvedValueOnce(Response.json({ keys: [key] }));
  expect(await auth.authenticateScaleReadRequest(request(jwt), env)).toMatchObject({ userId: id });
  expect(transport).toHaveBeenCalledTimes(2);
});
test.each([{}, { keys: [] }])(
  'missing key stays rejected after one refresh (%j)',
  async (payload) => {
    const { jwt } = await asymmetric('ES256');
    transport.mockImplementation(async () => Response.json(payload));
    await expect(auth.authenticateScaleReadRequest(request(jwt), env)).rejects.toThrow(
      'Unknown access token key',
    );
    expect(transport).toHaveBeenCalledTimes(2);
  },
);
test('failed JWKS request is not retained as a permanent rejected promise', async () => {
  const { jwt, key } = await asymmetric('ES256');
  transport
    .mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(Response.json({ keys: [key] }));
  await expect(auth.authenticateScaleReadRequest(request(jwt), env)).rejects.toThrow(
    'JWKS unavailable (503)',
  );
  expect(await auth.authenticateScaleReadRequest(request(jwt), env)).toMatchObject({ userId: id });
  expect(transport).toHaveBeenCalledTimes(2);
});
