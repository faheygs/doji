// Independent business composition. Not deployed; never imports employee/member runtime.
import { createRestrictedSql } from './restricted-sql.mts';
import { createBusinessSessionStore } from './business-session-store.mts';
import { createBusinessApplicationAdapter } from './business-application-adapter.mts';
import { createBusinessHttp } from './business-http.mts';
import { createWorkosBusinessProvider } from './workos-business-provider.mts';
import { createWorkosSessionReader } from './workos-session.mts';
import { createPortalIdentityVerifier } from './verify.mts';
import { createBusinessRegistrationAction } from './business-registration-action.mts';
import { createBusinessAdmission } from './business-admission.mts';
import { createBusinessEdgeIngress } from './business-proxy.mts';
import { boundedBody } from './bounded-body.mts';
import { createBusinessMfa } from './business-mfa.mts';
import { record } from './portal-contracts.mts';
import type { BusinessHttpConfig } from './business-http-contracts.mts';
import type { BusinessProxyConfig } from './business-proxy.mts';
import type { RestrictedSqlConfig, CreatePortalSqlClient } from './restricted-sql.mts';
import type { PortalFetch } from './portal-contracts.mts';
import type { JSONWebKeySet } from 'jose';
export interface BusinessRuntimeConfig extends BusinessHttpConfig, BusinessProxyConfig {
  database: Omit<RestrictedSqlConfig, 'realm'>;
  apiKey: string;
  actionSecret: string;
  turnstileSecret: string;
}
interface Dependencies {
  createClient: CreatePortalSqlClient;
  upstream?: PortalFetch;
  now?: () => number;
}
function keySet(value: unknown): value is JSONWebKeySet {
  return (
    record(value) &&
    Array.isArray(value.keys) &&
    value.keys.every((key: unknown) => record(key) && typeof key.kty === 'string')
  );
}
export function createBusinessRuntime(
  config: BusinessRuntimeConfig,
  { createClient, upstream = fetch, now = Date.now }: Dependencies,
) {
  const policy = structuredClone(config);
  if (policy.realm !== 'business' || policy.origin !== 'https://business.dojipro.com')
    throw Error('Business runtime configuration unavailable');
  const execute = createRestrictedSql({ ...policy.database, realm: 'business' }, createClient);
  const store = createBusinessSessionStore({ ...policy, enabled: true }, execute, now);
  const application = createBusinessApplicationAdapter((role, sql, params, signal) =>
    execute(role, sql, params, signal || AbortSignal.timeout(4000)),
  );
  const provider = createWorkosBusinessProvider(policy, upstream);
  const mfa = createBusinessMfa(policy, upstream, now);
  // No MFA claim inferred from JWT metadata or factor enrollment. Application
  // onboarding permits AAL1; any workspace-MFA requirement stays fail-closed.
  const checkSession = createWorkosSessionReader(
    { ...policy, enabled: true },
    async () => null,
    upstream,
  );
  type Verify = ReturnType<typeof createPortalIdentityVerifier>;
  let cached: Verify | null = null,
    expires = 0,
    pending: Promise<Verify> | null = null;
  async function verifier() {
    if (cached && expires > now()) return cached;
    if (!pending)
      pending = (async () => {
        const signal = AbortSignal.timeout(5000);
        const response = await upstream(`https://api.workos.com/sso/jwks/${policy.clientId}`, {
          redirect: 'error',
          signal,
        });
        if (!response.ok) throw Error('Business signing keys unavailable');
        const jwks: unknown = JSON.parse(
          new TextDecoder().decode(await boundedBody(response.body, signal, 32768)),
        );
        if (!keySet(jwks)) throw Error('Business signing keys unavailable');
        const next = createPortalIdentityVerifier(
          {
            ...policy,
            enabled: true,
            jwks,
            issuer: `https://api.workos.com/user_management/${policy.clientId}`,
            audience: policy.clientId,
            maxTokenAgeSeconds: 3600,
          },
          checkSession,
        );
        cached = next;
        expires = now() + 300000;
        return next;
      })().finally(() => {
        pending = null;
      });
    return pending;
  }
  const registration = createBusinessRegistrationAction(
    { ...policy, enabled: policy.enabled && policy.signupEnabled },
    execute,
    now,
  );
  // Validates configuration eagerly without spending a request or admitting anyone.
  createBusinessAdmission(policy, { ip: '' }, upstream);
  return createBusinessEdgeIngress(policy, async (request, client) => {
    if (new URL(request.url).pathname === '/auth/workos-registration') return registration(request);
    return createBusinessHttp(policy, {
      store,
      provider,
      application,
      now,
      verify: async (request) => (await verifier())(request),
      admission: createBusinessAdmission(policy, client, upstream),
      mfa,
    })(request);
  });
}
