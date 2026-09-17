import fs from 'fs';
import path from 'path';
import { createHmac, webcrypto } from 'node:crypto';
import { routeFor } from '../../infra/doji-orchestrator/src/scale-read';
import { authenticateScaleReadRequest } from '../../infra/doji-orchestrator/src/scale-read-auth';

const uuid = '123e4567-e89b-42d3-a456-426614174000';
const authEnv = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_JWT_SECRET: 'test-secret',
};

function legacyToken(overrides: Record<string, unknown> = {}, secret = 'test-secret'): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1_000) + 60,
    iss: `${authEnv.SUPABASE_URL}/auth/v1`,
    role: 'authenticated',
    sub: uuid,
    ...overrides,
  });
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

describe('authenticated scale-read gateway', () => {
  beforeAll(() => {
    if (!globalThis.crypto?.subtle) {
      Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
    }
  });

  it('verifies signature, issuer, audience, role, expiry, and account identity', async () => {
    const token = legacyToken();
    await expect(
      authenticateScaleReadRequest(
        new Request('https://scale.test/v1/profiles/faheybaby', {
          headers: { authorization: `Bearer ${token}` },
        }),
        authEnv,
      ),
    ).resolves.toEqual({ token, userId: uuid });

    const wrongSignature = legacyToken({}, 'wrong-secret');
    await expect(
      authenticateScaleReadRequest(
        new Request('https://scale.test/v1/profiles/faheybaby', {
          headers: { authorization: `Bearer ${wrongSignature}` },
        }),
        authEnv,
      ),
    ).rejects.toThrow('Invalid access token');
    await expect(
      authenticateScaleReadRequest(
        new Request('https://scale.test/v1/profiles/faheybaby', {
          headers: { authorization: `Bearer ${legacyToken({ role: 'service_role' })}` },
        }),
        authEnv,
      ),
    ).rejects.toThrow('Invalid access token');
  });

  it('maps bounded feed, profile, engagement, and poll routes to existing RLS RPCs', () => {
    expect(
      routeFor(new URL(`https://scale.test/v1/feed/${uuid}?audience=friends&unlocked=true`))?.rpc,
    ).toBe('get_feed_page_snapshot_v2');
    expect(routeFor(new URL('https://scale.test/v1/profiles/faheybaby'))?.rpc).toBe(
      'get_public_profile_view',
    );
    expect(
      routeFor(new URL(`https://scale.test/v1/posts/${uuid}/engagement?audience=everyone`))?.rpc,
    ).toBe('get_post_engagement_snapshot_v2');
    expect(
      routeFor(new URL(`https://scale.test/v1/polls/${uuid}/summary?audience=friends`))?.rpc,
    ).toBe('get_poll_results_summary');
  });

  it('rejects unbounded or malformed request parameters', () => {
    expect(() => routeFor(new URL(`https://scale.test/v1/feed/${uuid}?limit=500`))).toThrow();
    expect(() =>
      routeFor(new URL(`https://scale.test/v1/feed/${uuid}?audience=private`)),
    ).toThrow();
    expect(() => routeFor(new URL('https://scale.test/v1/profiles/not%20valid'))).toThrow();
  });

  it('routes feed and profile clients through the same fail-closed boundary', () => {
    const root = process.cwd();
    const feed = fs.readFileSync(path.join(root, 'lib/feedQueries.ts'), 'utf8');
    const profile = fs.readFileSync(path.join(root, 'lib/profileQueries.ts'), 'utf8');
    expect(feed).toContain('readThroughScaleGateway<Post[]>');
    expect(feed).toContain('/v1/feed/');
    expect(profile).toContain('readThroughScaleGateway<unknown>');
    expect(profile).toContain('/v1/profiles/');
  });

  it('does not hold an origin response behind the edge cache write', () => {
    const cache = fs.readFileSync(
      path.join(process.cwd(), 'infra/doji-orchestrator/src/scale-read-cache.ts'),
      'utf8',
    );
    expect(cache).toContain('context.waitUntil(cacheWrite)');
    expect(cache).toContain("event: 'scale_read_cache_error'");
  });
});
