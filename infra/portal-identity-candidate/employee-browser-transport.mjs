// Same-origin cookie transport only; no Supabase/WorkOS tokens or account data
// are persisted in browser storage. Existing portal components remain the UI.
import { portalRouteFor } from '../doji-orchestrator/src/portal-read.ts';
const fail = (message = 'Sign in again to continue.', status = 401) =>
  Object.assign(Error(message), { status });
const direct = Object.freeze({
  '/safety/page': 'get_admin_safety_removals_v1',
  '/safety/case': 'get_admin_safety_removal_v1',
  '/safety/target': 'get_admin_safety_target_v1',
  '/safety/create-report': 'admin_create_safety_report_v1',
  '/safety/command': 'admin_safety_removal_command_v1',
  '/business/page': 'get_admin_business_applications_page_v1',
  '/business/item': 'get_admin_business_application_v1',
  '/business/command': 'admin_business_application_command_v1',
  '/business-privacy/page': 'get_admin_business_privacy_page_v1',
  '/business-privacy/case': 'get_admin_business_privacy_case_v1',
  '/business-privacy/access': 'get_admin_business_privacy_access_v1',
  '/business-privacy/correction': 'get_admin_business_privacy_correction_v1',
  '/business-privacy/open': 'admin_business_privacy_open_v1',
  '/business-privacy/command': 'admin_business_privacy_command_v1',
});
export function createEmployeeBrowserTransport(
  config,
  { upstream = fetch, origin = location.origin, now = Date.now } = {},
) {
  if (origin !== 'https://admin.dojipro.com' || config.independentEmployeeIdentity !== true)
    throw fail('Employee transport is not configured.', 503);
  let csrf = null,
    cleanupCsrf = null,
    pending = null,
    signedIn = false,
    epoch = 0,
    created = 0,
    touched = 0,
    queue = Promise.resolve();
  const expired = () => !signedIn || created + 28800000 <= now() || touched + 1800000 <= now();
  const enqueue = (task) => {
    const next = queue.then(task);
    queue = next.catch(() => {});
    return next;
  };
  const reset = () => {
    epoch++;
    csrf = null;
    pending = null;
    signedIn = false;
    created = 0;
    touched = 0;
  };
  async function raw(path, body, token = csrf) {
    const response = await upstream(origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { 'x-doji-csrf': token } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw fail('Employee service returned an invalid response.', 503);
    }
    if (!response.ok)
      throw fail(
        typeof result?.message === 'string'
          ? result.message
          : 'Employee request could not be completed.',
        response.status,
      );
    return result;
  }
  function install(result, checkpoint) {
    if (
      result?.signedIn !== true ||
      result.assurance !== 'aal2' ||
      !/^[A-Za-z0-9_-]{43}$/.test(result.csrf || '') ||
      !result.operator?.user_id
    )
      throw fail();
    // A late successful response may have installed an HttpOnly cookie. Retain
    // its CSRF only for the already-queued logout, never for workspace access.
    cleanupCsrf = result.csrf;
    checkpoint();
    if (!signedIn) created = now();
    touched = now();
    signedIn = true;
    csrf = result.csrf;
    pending = null;
    return result.operator;
  }
  function guarded(action) {
    const expected = epoch;
    return enqueue(async () => {
      const checkpoint = () => {
        if (expected !== epoch) throw fail();
      };
      checkpoint();
      try {
        const result = await action(checkpoint);
        checkpoint();
        return result;
      } catch (error) {
        if (expected === epoch && error.status === 401) {
          reset();
          config.onAccessInvalidated?.('Your employee session ended. Sign in again.');
        }
        throw error;
      }
    });
  }
  const session = () =>
    guarded(async (checkpoint) => install(await raw('/api/session'), checkpoint));
  const rpc = (name, args) =>
    guarded(async (checkpoint) => {
      if (expired()) throw fail();
      try {
        const result = await raw('/api/rpc', { name, args });
        checkpoint();
        touched = now();
        return result;
      } catch (error) {
        if (error.status === 403) {
          // A restricted case is not necessarily a revoked account. Recheck once;
          // never retry the failed write or discard a valid unrelated session.
          checkpoint();
          try {
            install(await raw('/api/session'), checkpoint);
          } catch {
            checkpoint();
            reset();
            config.onAccessInvalidated?.('Employee access could not be verified. Sign in again.');
          }
        }
        throw error;
      }
    });
  const complete = (code) =>
    guarded(async (checkpoint) => {
      if (!pending?.csrf) throw fail('Start employee sign-in again.');
      const result = await raw('/auth/complete', { code }, pending.csrf);
      install(result, checkpoint);
      return { authenticated: true };
    });
  async function logout() {
    const token = csrf;
    reset();
    // Let the current request release its server lease before logout. Old queued
    // requests are epoch-fenced and cannot execute or repaint after this point.
    return enqueue(async () => {
      const revokeToken = token || cleanupCsrf;
      if (!revokeToken) return;
      const result = await raw('/auth/logout', {}, revokeToken);
      if (result.signedIn !== false) throw fail('Employee sign-out could not be confirmed.', 503);
      cleanupCsrf = null;
      return result;
    });
  }
  return Object.freeze({
    hasSession: () => !expired(),
    assertSessionFresh() {
      if (expired()) throw fail();
    },
    noteActivity() {
      return !expired();
    },
    session,
    async signIn(email, password) {
      return guarded(async (checkpoint) => {
        const result = await raw('/auth/start', { email, password }, null);
        if (result.step !== 'totp' || !/^[A-Za-z0-9_-]{43}$/.test(result.csrf || '')) throw fail();
        checkpoint();
        pending = result;
        return result.enrollmentRequired
          ? { requiresEnrollment: true, methods: { totp: true, phone: false } }
          : { requiresChallenge: true, method: 'totp' };
      });
    },
    async enrollTotp() {
      if (
        !pending?.enrollmentRequired ||
        !/^data:image\/png;base64,iVBOR[A-Za-z0-9+/=]+$/.test(pending.enrollmentQr || '') ||
        !/^[A-Z2-7]{16,128}$/.test(pending.enrollmentSecret || '')
      )
        throw fail('Authenticator setup could not be loaded. Start sign-in again.');
      return { qrCode: pending.enrollmentQr, secret: pending.enrollmentSecret };
    },
    verifyPendingChallenge: complete,
    verifyTotpEnrollment: complete,
    signOut: logout,
    clearSession() {
      void logout().catch(() =>
        config.onAccessInvalidated?.('Workspace locked; server sign-out could not be confirmed.'),
      );
    },
    async request(path, { method = 'GET', body = {} } = {}) {
      if (path === '/portal/admin/session') return session();
      if (path === '/portal/admin/realtime-token') return rpc('portal_realtime_token_v1', {});
      if (path === '/portal/admin/platform-health') return rpc('portal_platform_health_v1', {});
      if (Object.hasOwn(direct, path)) {
        if (method !== 'POST') throw fail('Invalid portal request.', 400);
        if (path.startsWith('/business/') && config.businessApplicationsEnabled !== true)
          throw fail('Business review is not enabled.', 403);
        if (path.startsWith('/business-privacy/') && config.businessPrivacyEnabled !== true)
          throw fail('Business privacy is not enabled.', 403);
        return rpc(direct[path], body);
      }
      const url = new URL(path, origin);
      if (url.origin !== origin) throw fail('Invalid portal destination.', 400);
      const route = portalRouteFor(url);
      if (!route || route.method !== method) throw fail('Portal operation unavailable.', 404);
      const name =
        {
          get_admin_operator_directory_v1: 'get_admin_employee_directory_v1',
          admin_set_operator_role_v1: 'admin_set_employee_role_v1',
        }[route.rpc] || route.rpc;
      return rpc(name, route.args(url, body));
    },
    async signEvidence(bucket, path) {
      if (!bucket || !path) return null;
      return (await rpc('portal_sign_evidence_v1', { bucket, path })).signedUrl;
    },
  });
}
