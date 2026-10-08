// Isolated employee runtime; no imports from the member app/shared Worker.
import { createRestrictedSql } from './restricted-sql.mts';
import { createEmployeeHttp } from './employee-http.mts';
import { createEmployeeSessionStore } from './employee-session-store.mts';
import { createEmployeeApplicationAdapter } from './employee-application-adapter.mts';
import { createEmployeeResources } from './employee-resources.mts';
import { createEmployeeAdmission } from './employee-admission.mts';
import { createWorkosEmployeeProvider } from './workos-employee-provider.mts';
import { createEmployeeEdgeIngress } from './employee-proxy.mts';
import { boundedBody } from './bounded-body.mts';
import { createEmployeeHealth } from './employee-health.mts';
import { createEmployeeTiming } from './employee-timing.mts';
import type { RestrictedSqlConfig, CreatePortalSqlClient } from './restricted-sql.mts';
import type { EmployeeProviderConfig } from './workos-employee-provider.mts';
import type { EmployeeMonitoringConfig } from './employee-health.mts';
import type { SignStorage, SignRealtime } from './employee-contracts.mts';
import type { PortalFetch } from './portal-contracts.mts';
import { record } from './portal-contracts.mts';
import type { JSONWebKeySet } from 'jose';
export interface EmployeeRuntimeConfig extends Omit<
  EmployeeProviderConfig,
  'jwks' | 'maxTokenAgeSeconds' | 'maxMfaAgeSeconds'
> {
  database: Omit<RestrictedSqlConfig, 'realm'>;
  storageOrigin: string;
  monitoring?: EmployeeMonitoringConfig;
  endpoint: string;
  proxyKey: string;
  admissionKey: string;
  staffWorkflowEnabled?: boolean;
  healthEventsEnabled?: boolean;
}
interface RuntimeDependencies {
  createClient: CreatePortalSqlClient;
  signStorage: SignStorage;
  signRealtime: SignRealtime;
  upstream?: PortalFetch;
  now?: () => number;
}
// The verifier applies the full cryptographic key policy; this guards JSON shape.
function isKeySet(value: unknown): value is JSONWebKeySet {
  return (
    record(value) &&
    Array.isArray(value.keys) &&
    value.keys.every((key: unknown) => record(key) && typeof key.kty === 'string')
  );
}

export function createEmployeeRuntime(
  config: EmployeeRuntimeConfig,
  {
    createClient,
    signStorage,
    signRealtime,
    upstream = fetch,
    now = Date.now,
  }: RuntimeDependencies,
) {
  const policy = structuredClone(config);
  if (
    policy.realm !== 'employee' ||
    policy.origin !== 'https://admin.dojipro.com' ||
    !/^client_[A-Za-z0-9]+$/.test(policy.clientId || '')
  )
    throw Error('Employee runtime configuration unavailable');
  const timing = createEmployeeTiming();
  const execute = createRestrictedSql({ ...policy.database, realm: 'employee' }, (options) => {
    const client = createClient(options);
    return {
      connect: () => timing.measure('connect', () => client.connect()),
      query: (input) => timing.measure('query', () => client.query(input)),
      end: () => timing.measure('close', () => client.end()),
    };
  });
  const store = createEmployeeSessionStore({ ...policy, enabled: true }, execute, now);
  const adapter = createEmployeeApplicationAdapter(execute);
  const application = createEmployeeResources(adapter, {
    staffWorkflowEnabled: policy.staffWorkflowEnabled === true,
    healthEventsEnabled: policy.healthEventsEnabled === true,
    storageOrigin: policy.storageOrigin,
    signStorage,
    signRealtime,
    health: createEmployeeHealth(adapter, policy.monitoring, {
      upstream,
      now,
      healthEventsEnabled: policy.healthEventsEnabled === true,
    }),
  });
  type Provider = ReturnType<typeof createWorkosEmployeeProvider>;
  let cachedProvider: Provider | null = null,
    expires = 0,
    pending: Promise<Provider> | null = null;
  async function provider() {
    if (cachedProvider && expires > now()) return cachedProvider;
    if (!pending)
      pending = (async () => {
        const signal = AbortSignal.timeout(5000);
        const r = await upstream(`https://api.workos.com/sso/jwks/${policy.clientId}`, {
          redirect: 'error',
          signal,
        });
        if (!r.ok) throw Error('Employee signing keys unavailable');
        const jwks: unknown = JSON.parse(
          new TextDecoder().decode(await boundedBody(r.body, signal, 32768)),
        );
        if (!isKeySet(jwks)) throw Error('Employee signing keys unavailable');
        const next = createWorkosEmployeeProvider(
          { ...policy, enabled: true, jwks, maxTokenAgeSeconds: 3600, maxMfaAgeSeconds: 28800 },
          upstream,
        );
        cachedProvider = next;
        expires = now() + 300000;
        return next;
      })().finally(() => {
        pending = null;
      });
    return pending;
  }
  const providerFacade: Provider = {
    begin: (...args) => timing.measure('identity', async () => (await provider()).begin(...args)),
    prepare: (...args) =>
      timing.measure('identity', async () => (await provider()).prepare(...args)),
    complete: (...args) =>
      timing.measure('identity', async () => (await provider()).complete(...args)),
    verify: (...args) => timing.measure('identity', async () => (await provider()).verify(...args)),
    refresh: (...args) =>
      timing.measure('identity', async () => (await provider()).refresh(...args)),
    revoke: (...args) => timing.measure('identity', async () => (await provider()).revoke(...args)),
  };
  return createEmployeeEdgeIngress(policy, async (request, clientIp) => {
    // The ingress gate runs before keys, DB or provider calls. A failed refresh
    // never silently extends a stale key set or admits an unverified identity.
    const admission = createEmployeeAdmission(policy, execute, clientIp);
    return timing.request(() =>
      createEmployeeHttp(policy, {
        store,
        provider: providerFacade,
        application,
        admission,
        now,
      })(request),
    );
  });
}
