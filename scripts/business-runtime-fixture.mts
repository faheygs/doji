// Synthetic I/O only; production SQL/provider adapters are composed unchanged.
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createBusinessRuntime } from '../infra/portal-identity/business-runtime.mts';
import type { BusinessRuntimeConfig } from '../infra/portal-identity/business-runtime.mts';
import type { PortalSqlClient } from '../infra/portal-identity/restricted-sql.mts';
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
export async function businessFixture(
  patch: Partial<BusinessRuntimeConfig> = {},
  scenario: { application?: unknown; noFactor?: boolean; approvedBrandName?: string } = {},
) {
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
  const enrollments: unknown[] = [];
  let time = Date.now(),
    proofAction = 'business_register',
    resetPending = false,
    resetComplete = false,
    loseReset = false,
    needsVerification = false,
    keyResponse: (() => Response) | undefined,
    revoked = false;
  const acceptanceIdentity = createHmac(
    'sha256',
    Buffer.from(config.ownedAuth?.admissionHmacKey || '00'.repeat(32), 'hex'),
  )
    .update(
      `${createHash('sha256').update(`${config.origin}|${config.clientId}`).digest('hex')}|identity|sample@example.com`,
    )
    .digest('hex');
  const acceptanceUntil = time + 7200000;
  let acceptanceReserved = false;
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
        if (query.text.includes('admit_owned_acceptance_v1')) {
          result =
            time < acceptanceUntil && query.values[3] === acceptanceIdentity
              ? { state: 'allowed', ticket: query.values[2] }
              : { state: 'denied' };
        } else if (query.text.includes('reserve_owned_acceptance_v1')) {
          result =
            !acceptanceReserved && time < acceptanceUntil && query.values[1] === acceptanceIdentity;
          if (result) acceptanceReserved = true;
        } else if (query.text.includes('admit_owned_auth_v1')) {
          result = { state: 'allowed', ticket: query.values[2] };
        } else if (query.text.includes('reserve_owned_recovery_email_v1')) {
          result = { state: 'reserved' };
        } else if (query.text.includes('put_owned_session_v1')) {
          assert.equal(query.values[7], 'user_synthetic');
          if (resetPending) result = { state: 'denied' };
          else {
            values.set('session:' + String(query.values[2]), String(query.values[3]));
            result = { state: 'ok' };
          }
        } else if (query.text.includes('put_owned_reset_link_v1')) {
          values.set('reset:' + String(query.values[1]), String(query.values[3]));
          result = { state: 'ok' };
        } else if (query.text.includes('get_owned_reset_link_v1')) {
          const envelope = values.get('reset:' + String(query.values[1]));
          result = envelope ? { state: 'ok', envelope } : { state: 'missing' };
        } else if (query.text.includes('begin_owned_reset_link_v1')) {
          result = { state: resetComplete ? 'complete' : resetPending ? 'pending' : 'started' };
          if (!resetComplete) resetPending = true;
          for (const key of values.keys()) if (key.startsWith('session:')) values.delete(key);
        } else if (
          query.text.includes('complete_owned_reset_link_v1') ||
          query.text.includes('reconcile_owned_reset_link_v1')
        ) {
          resetPending = false;
          resetComplete = true;
          result = { state: 'complete' };
        } else if (query.text.includes('put_bound_session')) {
          assert.equal(query.values[6], 'user_synthetic');
          values.set('session:' + String(query.values[1]), String(query.values[2]));
          result = { state: 'ok' };
        } else if (
          query.text.includes('execute_store') ||
          query.text.includes('execute_owned_store_v1')
        ) {
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
        else if (query.text.includes('business_setup_v1')) {
          if (!scenario.approvedBrandName)
            throw Object.assign(Error('Not approved'), { code: '42501' });
          result = { profile: { brand_name: scenario.approvedBrandName } };
        } else if (query.text.includes('read_business_workspace')) {
          assert.equal(query.values[4], true);
          result = {
            organization_id: 'synthetic-org',
            brand_name: 'Example',
            role: 'owner',
            campaigns_enabled: false,
            billing_enabled: false,
          };
        } else {
          assert.ok(query.text.includes('read_business_application'));
          result = scenario.application ?? null;
        }
        return { rows: [{ result }] };
      },
    }),
    upstream: async (url, init) => {
      calls.push(url);
      if (url === 'https://api.resend.com/emails') {
        assert.ok(
          queries.some(
            (q) => typeof q === 'object' && q.text.includes('reserve_owned_recovery_email_v1'),
          ),
        );
        assert.ok([...values.keys()].some((key) => key.startsWith('reset:')));
        return Response.json({ id: '00000000-0000-4000-8000-000000000001' });
      }
      if (url.includes('siteverify'))
        return Response.json({
          success: true,
          hostname: 'business.dojipro.com',
          action: proofAction,
        });
      if (url.includes('/sso/jwks/')) return keyResponse ? keyResponse() : Response.json(jwks);
      if (url.endsWith('/password_reset/confirm')) {
        if (loseReset) throw Error('Synthetic lost reset response');
        return Response.json({ user: { id: 'user_synthetic', email_verified: true } });
      }
      if (url.endsWith('/password_reset'))
        return Response.json({
          object: 'password_reset',
          id: 'password_reset_synthetic',
          user_id: 'user_synthetic',
          email: 'sample@example.com',
          password_reset_token: 'synthetic-reset-token-123456',
          expires_at: new Date(time + 3600000).toISOString(),
        });
      if (url.endsWith('/users') && init.method === 'POST') {
        needsVerification = true;
        return Response.json({ id: 'user_synthetic', email_verified: false });
      }
      if (url.endsWith('/authenticate')) {
        const body = JSON.parse(String(init.body));
        if (needsVerification && body.grant_type === 'password')
          return Response.json(
            {
              code: 'email_verification_required',
              pending_authentication_token: 'synthetic-pending',
            },
            { status: 403 },
          );
        needsVerification = false;
        return Response.json({
          user: { id: 'user_synthetic', email_verified: true },
          access_token: token,
          refresh_token: 'test-only-refresh',
        });
      }
      if (url.endsWith('/sessions/revoke')) {
        revoked = true;
        return new Response(null, { status: 204 });
      }
      const challenge = {
        id: 'auth_challenge_synthetic',
        authentication_factor_id: 'auth_factor_synthetic',
        expires_at: new Date(time + 240000).toISOString(),
      };
      if (url.endsWith('/auth_factors')) {
        if (init.method === 'POST') {
          enrollments.push(JSON.parse(String(init.body)));
          return Response.json({
            authentication_factor: {
              id: 'auth_factor_synthetic',
              type: 'totp',
              totp: { secret: 'A'.repeat(32) },
            },
            authentication_challenge: challenge,
          });
        }
        return Response.json({
          data: scenario.noFactor ? [] : [{ id: 'auth_factor_synthetic', type: 'totp' }],
        });
      }
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
    enrollments,
    proofAction: (action: string) => {
      proofAction = action;
    },
    loseReset: () => {
      loseReset = true;
    },
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
