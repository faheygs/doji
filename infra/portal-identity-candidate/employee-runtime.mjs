// Isolated employee runtime; no imports from the member app/shared Worker.
import { createRestrictedSql } from './restricted-sql.mjs';
import { createEmployeeHttp } from './employee-http.mjs';
import { createEmployeeSessionStore } from './employee-session-store.mjs';
import { createEmployeeApplicationAdapter } from './employee-application-adapter.mjs';
import { createEmployeeResources } from './employee-resources.mjs';
import { createEmployeeAdmission } from './employee-admission.mjs';
import { createWorkosEmployeeProvider } from './workos-employee-provider.mjs';
import { createEmployeeEdgeIngress } from './employee-proxy.mjs';
import { boundedBody } from './bounded-body.mjs';
import { createEmployeeHealth } from './employee-health.mjs';

export function createEmployeeRuntime(
  config,
  { createClient, signStorage, signRealtime, upstream = fetch, now = Date.now },
) {
  const policy = structuredClone(config);
  if (
    policy.realm !== 'employee' ||
    policy.origin !== 'https://admin.dojipro.com' ||
    !/^client_[A-Za-z0-9]+$/.test(policy.clientId || '')
  )
    throw Error('Employee runtime configuration unavailable');
  const execute = createRestrictedSql({ ...policy.database, realm: 'employee' }, createClient);
  const store = createEmployeeSessionStore({ ...policy, enabled: true }, execute, now);
  const adapter = createEmployeeApplicationAdapter(execute);
  const application = createEmployeeResources(adapter, {
    storageOrigin: policy.storageOrigin,
    signStorage,
    signRealtime,
    health: createEmployeeHealth(adapter, policy.monitoring, { upstream, now }),
  });
  let cachedProvider = null,
    expires = 0,
    pending = null;
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
        const jwks = JSON.parse(new TextDecoder().decode(await boundedBody(r.body, signal, 32768)));
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
  const providerFacade = Object.fromEntries(
    ['begin', 'prepare', 'complete', 'verify', 'refresh', 'revoke'].map((method) => [
      method,
      async (...args) => (await provider())[method](...args),
    ]),
  );
  return createEmployeeEdgeIngress(policy, async (request, clientIp) => {
    // The ingress gate runs before keys, DB or provider calls. A failed refresh
    // never silently extends a stale key set or admits an unverified identity.
    const admission = createEmployeeAdmission(policy, execute, clientIp);
    return createEmployeeHttp(policy, {
      store,
      provider: providerFacade,
      application,
      admission,
      now,
    })(request);
  });
}
