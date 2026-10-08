// Synthetic I/O only; production SQL/provider adapters are composed unchanged.
import assert from 'node:assert/strict';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createBusinessRuntime } from '../infra/portal-identity-candidate/business-runtime.mts';
import type { BusinessRuntimeConfig } from '../infra/portal-identity-candidate/business-runtime.mts';
import type { PortalSqlClient } from '../infra/portal-identity-candidate/restricted-sql.mts';
export const businessConfig: BusinessRuntimeConfig = {
  enabled: true,
  signupEnabled: true,
  realm: 'business',
  origin: 'https://business.dojipro.com',
  endpoint: 'https://abcdefghijklmnopqrst.supabase.co/functions/v1/business-portal-v2',
  proxyKey: 'ab'.repeat(32),
  clientId: 'client_synthetic',
  apiKey: 'sk_' + 'x'.repeat(40),
  encryptionKey: 'bc'.repeat(32),
  actionSecret: 'synthetic-'.repeat(8),
  turnstileSecret: 'synthetic-'.repeat(5),
  termsVersion: 'terms-v1',
  privacyVersion: 'privacy-v1',
  database: {
    host: 'aws-0-test.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    projectRef: 'abcdefghijklmnopqrst',
    username: 'doji_business_portal_login.abcdefghijklmnopqrst',
    password: 'synthetic-'.repeat(8),
  },
};
export async function businessFixture(patch: Partial<BusinessRuntimeConfig> = {}) {
  const config = { ...businessConfig, ...patch };
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const jwks = {
    keys: [{ ...(await exportJWK(publicKey)), kid: 'synthetic', alg: 'ES256', use: 'sig' }],
  };
  const token = await new SignJWT({ sid: 'session_synthetic' })
    .setProtectedHeader({ alg: 'ES256', kid: 'synthetic' })
    .setIssuer(`https://api.workos.com/user_management/${config.clientId}`)
    .setAudience(config.clientId)
    .setSubject('user_synthetic')
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(privateKey);
  const calls: string[] = [],
    queries: Parameters<PortalSqlClient['query']>[0][] = [];
  const values = new Map<string, string>();
  let time = Date.now(),
    keyResponse: (() => Response) | undefined,
    revoked = false;
  const runtime = createBusinessRuntime(config, {
    now: () => time,
    createClient: () => ({
      connect: async () => {},
      end: async () => {},
      query: async (query) => {
        queries.push(query);
        if (typeof query === 'string') {
          if (query.startsWith('begin isolation'))
            return [
              {},
              {},
              {},
              {},
              {
                rows: [
                  {
                    login: 'doji_business_portal_login',
                    current_role: 'doji_business_portal_login',
                    privileged: false,
                    inherits: false,
                    permitted: true,
                  },
                ],
              },
            ];
          assert.ok(!query.includes('employee'));
          return { rows: [] };
        }
        let result: unknown = null;
        if (query.text.includes('put_bound_session')) {
          assert.equal(query.values[6], 'user_synthetic');
          values.set('session:' + String(query.values[1]), String(query.values[2]));
          result = { state: 'ok' };
        } else if (query.text.includes('execute_store')) {
          const [, op, kind, key, value] = query.values;
          const id = String(kind) + ':' + String(key);
          if (op === 'put' || op === 'replace') {
            values.set(id, String(value));
            result = { state: 'ok' };
          } else if (op === 'peek' || op === 'take' || op === 'acquire') {
            result = values.has(id) ? { state: 'ok', value: values.get(id) } : { state: 'missing' };
            if (op === 'take') values.delete(id);
          } else {
            if (op === 'remove') values.delete(id);
            result = { state: 'ok' };
          }
        } else if (
          query.text.includes('complete_business_enrollment') ||
          query.text.includes('reserve_registration')
        )
          result = true;
        else if (query.text.includes('read_business_workspace')) {
          assert.equal(query.values[4], true);
          result = {
            organization_id: 'synthetic-org',
            brand_name: 'Example',
            role: 'owner',
            campaigns_enabled: false,
            billing_enabled: false,
          };
        } else assert.ok(query.text.includes('read_business_application'));
        return { rows: [{ result }] };
      },
    }),
    upstream: async (url, init) => {
      calls.push(url);
      if (url.includes('siteverify'))
        return Response.json({
          success: true,
          hostname: 'business.dojipro.com',
          action: 'business_register',
        });
      if (url.includes('/sso/jwks/')) return keyResponse ? keyResponse() : Response.json(jwks);
      if (url.endsWith('/authenticate'))
        return Response.json({
          user: { id: 'user_synthetic', email_verified: true },
          access_token: token,
          refresh_token: 'test-only-refresh',
        });
      if (url.endsWith('/sessions/revoke')) {
        revoked = true;
        return new Response(null, { status: 204 });
      }
      if (url.endsWith('/auth_factors'))
        return Response.json({ data: [{ id: 'auth_factor_synthetic', type: 'totp' }] });
      const challenge = {
        id: 'auth_challenge_synthetic',
        authentication_factor_id: 'auth_factor_synthetic',
        expires_at: new Date(time + 240000).toISOString(),
      };
      if (url.endsWith('/auth/factors/auth_factor_synthetic/challenge'))
        return Response.json(challenge);
      if (url.endsWith('/auth/challenges/auth_challenge_synthetic/verify')) {
        return Response.json({ valid: true, challenge });
      }
      assert.equal(init.method, 'GET');
      if (url.endsWith('/sessions?limit=10'))
        return Response.json({
          data: [
            {
              id: 'session_synthetic',
              user_id: 'user_synthetic',
              status: revoked ? 'ended' : 'active',
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            },
          ],
        });
      assert.ok(url.endsWith('/users/user_synthetic'));
      return Response.json({ id: 'user_synthetic', email_verified: true });
    },
  });
  const request = (path: string, data?: unknown, cookie = '', extra: Record<string, string> = {}) =>
    new Request(config.endpoint + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: {
        origin: config.origin,
        'content-type': 'application/json',
        cookie,
        'x-doji-portal-proxy-key': config.proxyKey,
        'x-doji-client-ip': '192.0.2.1',
        ...extra,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  const begin = async () => {
    const r = await runtime(
      request('/auth/start', {
        signup: true,
        proof: 'synthetic',
        termsAccepted: true,
        privacyAcknowledged: true,
        country: 'US',
        termsVersion: 'terms-v1',
        privacyVersion: 'privacy-v1',
      }),
    );
    assert.equal(r.status, 200);
    const data: unknown = await r.json();
    assert.ok(
      data &&
        typeof data === 'object' &&
        'authorizationUrl' in data &&
        typeof data.authorizationUrl === 'string',
    );
    const state = new URL(data.authorizationUrl).searchParams.get('state');
    const cookie = r.headers.get('set-cookie')?.split(';')[0];
    assert.ok(state && cookie);
    return request('/auth/callback?code=syntheticcode&state=' + state, undefined, cookie);
  };
  return {
    runtime,
    request,
    begin,
    calls,
    queries,
    keys: (next: () => Response) => {
      keyResponse = next;
    },
    advance: (ms: number) => {
      time += ms;
    },
    revoke: () => {
      revoked = true;
    },
  };
}
