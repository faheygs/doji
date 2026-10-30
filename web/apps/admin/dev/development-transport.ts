import { portalRouteFor } from '../../../../infra/doji-orchestrator/src/portal-read';
import { employeeDirectRoute } from '../../../../infra/portal-identity/employee-direct-routes.mts';
import type { createEmployeeBrowserTransport } from '../../../../infra/portal-identity/employee-browser-transport.mts';
import { localAdminOrigin, localStagingFlags } from './transport';

const fail = (message: string, status = 503) => Object.assign(Error(message), { status });
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export async function developmentRequest(
  path: string,
  csrf?: string,
  body?: Record<string, unknown>,
) {
  if (!import.meta.env.DEV || location.origin !== localAdminOrigin)
    throw fail('Local development only.');
  const response = await fetch('/api/dev/' + path, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(csrf ? { 'x-doji-csrf': csrf } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const result: unknown = await response.json();
  if (!response.ok)
    throw fail(
      record(result) && typeof result.message === 'string'
        ? result.message
        : 'Development request failed.',
      response.status,
    );
  return result;
}

export function developmentTransport(csrf: string): typeof createEmployeeBrowserTransport {
  return (config) => {
    let fresh = false,
      epoch = 0;
    let queue: Promise<unknown> = Promise.resolve();
    function guarded<T>(action: () => Promise<T>): Promise<T> {
      const stamp = epoch;
      const task = queue.then(async () => {
        if (stamp !== epoch) throw fail('Persona changed.', 401);
        try {
          const value = await action();
          if (stamp !== epoch) throw fail('Persona changed.', 401);
          return value;
        } catch (error) {
          if (stamp === epoch && record(error) && error.status === 401) {
            fresh = false;
            epoch++;
            config.onAccessInvalidated?.('Development session ended. Choose a persona again.');
          }
          throw error;
        }
      });
      queue = task.catch(() => {});
      return task;
    }
    const session = () =>
      guarded(async () => {
        const result = await developmentRequest('session', csrf);
        if (
          !record(result) ||
          result.signedIn !== true ||
          result.assurance !== 'staging_development' ||
          !record(result.operator)
        )
          throw fail('Development session unavailable.', 401);
        fresh = true;
        return result.operator;
      });
    const rpc = (name: string, args: Record<string, unknown>) =>
      guarded(async () => {
        if (!fresh) throw fail('Choose a persona first.', 401);
        return developmentRequest('rpc', csrf, { name, args });
      });
    function signOut() {
      fresh = false;
      epoch++;
      const task = queue.then(async () => {
        const result = await developmentRequest('logout', csrf, {});
        if (!record(result) || result.signedIn !== false) throw fail('Local sign-out unavailable.');
        return result;
      });
      queue = task.catch(() => {});
      return task;
    }
    const unavailable = async (): Promise<never> => {
      throw fail('Use the local persona selector.', 403);
    };
    return {
      session,
      hasSession: () => fresh,
      noteActivity: () => fresh,
      assertSessionFresh() {
        if (!fresh) throw fail('Persona session ended.', 401);
      },
      signOut,
      clearSession({ revoke = true } = {}) {
        if (revoke) void signOut().catch(() => {});
        else {
          fresh = false;
          epoch++;
        }
      },
      signIn: unavailable,
      enrollTotp: unavailable,
      verifyPendingChallenge: unavailable,
      verifyTotpEnrollment: unavailable,
      async signEvidence(bucket: string, path: string) {
        if (!bucket || !path) return null;
        const result = await rpc('portal_sign_evidence_v1', { bucket, path });
        if (!record(result) || typeof result.signedUrl !== 'string')
          throw fail('Private media signing is unavailable.');
        return result.signedUrl;
      },
      async request(path, { method = 'GET', body = {} } = {}) {
        if (path === '/portal/admin/session') return session();
        if (path === '/portal/admin/platform-health' && method === 'GET')
          return rpc('portal_platform_health_v1', {});
        if (path === '/portal/admin/realtime-token' && method === 'GET')
          return rpc('portal_realtime_token_v1', {});
        const direct = employeeDirectRoute(path, method, localStagingFlags);
        if (direct) return rpc(direct, body);
        const url = new URL(path, localAdminOrigin);
        if (url.origin !== localAdminOrigin) throw fail('Invalid development route.', 400);
        const route = portalRouteFor(url);
        if (!route || route.method !== method)
          throw fail('This staging integration is not configured.', 503);
        const aliases: Record<string, string> = {
          get_admin_operator_directory_v1: 'get_admin_employee_directory_v1',
          admin_set_operator_role_v1: 'admin_set_employee_role_v1',
        };
        return rpc(aliases[route.rpc] ?? route.rpc, route.args(url, body));
      },
    };
  };
}
