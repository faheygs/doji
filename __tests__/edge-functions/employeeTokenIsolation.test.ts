import { createHmac, webcrypto } from 'node:crypto';
import { authenticateEmployeePortalRequest, authenticateScaleReadRequest } from '../../infra/doji-orchestrator/src/scale-read-auth';

const env = { SUPABASE_URL: 'https://project.example.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_JWT_SECRET: 'test-only-signing-secret' };
function request(role: string, overrides = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role, sub: '11111111-1111-4111-8111-111111111111',
    aal: 'aal2', iss: `${env.SUPABASE_URL}/auth/v1`, aud: 'authenticated', exp: Math.floor(Date.now()/1000)+300, ...overrides })).toString('base64url');
  const signature = createHmac('sha256', env.SUPABASE_JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return new Request('https://api.example.test', { headers: { authorization: `Bearer ${header}.${payload}.${signature}` } });
}
beforeAll(() => { Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto }); });
test('signed employee tokens cannot enter member reads and member tokens cannot enter employee portal', async () => {
  await expect(authenticateEmployeePortalRequest(request('doji_employee'), env)).resolves.toHaveProperty('aal', 'aal2');
  await expect(authenticateScaleReadRequest(request('authenticated'), env)).resolves.toHaveProperty('aal', 'aal2');
  await expect(authenticateScaleReadRequest(request('doji_employee'), env)).rejects.toThrow('Invalid access token');
  await expect(authenticateEmployeePortalRequest(request('authenticated'), env)).rejects.toThrow('Invalid access token');
});
test.each([{ aud: 'other' }, { iss: 'https://other.test/auth/v1' }, { exp: 1 }])('employee issuer, audience and expiry remain enforced: %j', async (claims) => {
  await expect(authenticateEmployeePortalRequest(request('doji_employee', claims), env)).rejects.toThrow('Invalid access token');
});
