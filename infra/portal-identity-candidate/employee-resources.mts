// Portal-only resource adapter. The SQL bridge resolves/rechecks the exact
// employee on every request. Signing dependencies stay server-side; neither
// Supabase Auth tokens nor unrestricted storage/realtime keys reach the browser.
const fail = (status = 403) => Object.assign(Error('Employee resource unavailable'), { status });
import { record } from './portal-contracts.mts';
import type {
  EmployeeApplication,
  EmployeeActor,
  EmployeeCommand,
  SignStorage,
  SignRealtime,
  EmployeeHealth,
} from './employee-contracts.mts';
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export function validEvidence(bucket: unknown, path: unknown) {
  return (
    typeof bucket === 'string' &&
    ['post-media', 'avatars', 'moderation-evidence'].includes(bucket) &&
    typeof path === 'string' &&
    path.length > 0 &&
    path.length <= 1024 &&
    !/[\x00-\x1f\x7f%?#\\]/.test(path) &&
    !path.split('/').some((p) => !p || p === '.' || p === '..') &&
    (bucket !== 'moderation-evidence' ||
      (/^[a-f0-9-]{36}\/original$/.test(path) && uuid(path.split('/')[0])))
  );
}
export interface EmployeeResourceConfig {
  storageOrigin: string;
  signStorage: SignStorage;
  signRealtime: SignRealtime;
  health?: EmployeeHealth;
}
export function createEmployeeResources(
  application: EmployeeApplication,
  { storageOrigin, signStorage, signRealtime, health }: EmployeeResourceConfig,
) {
  if (
    typeof application?.authorize !== 'function' ||
    typeof application?.command !== 'function' ||
    typeof signStorage !== 'function' ||
    typeof signRealtime !== 'function' ||
    !/^https:\/\/[a-z]{20}\.supabase\.co$/.test(storageOrigin)
  )
    throw fail(503);
  return Object.freeze({
    authorize: (actor: EmployeeActor, signal: AbortSignal) => application.authorize(actor, signal),
    async command(actor: EmployeeActor, input: EmployeeCommand, signal: AbortSignal) {
      if (input?.name === 'portal_platform_health_v1') {
        if (!input.args || Object.keys(input.args).length) throw fail(400);
        if (typeof health !== 'function') throw fail(503);
        return health(actor, signal);
      }
      if (input?.name === 'portal_sign_evidence_v1') {
        const args = input.args;
        if (
          !args ||
          Object.keys(args).length !== 2 ||
          typeof args.bucket !== 'string' ||
          typeof args.path !== 'string' ||
          !validEvidence(args.bucket, args.path)
        )
          throw fail(400);
        const authorized = await application.command(
          actor,
          {
            name: 'portal_evidence_authorization_v1',
            args: { p_bucket: args.bucket, p_path: args.path },
          },
          signal,
        );
        if (
          !record(authorized) ||
          authorized.bucket !== args.bucket ||
          authorized.path !== args.path ||
          authorized.expiresIn !== 300
        )
          throw fail();
        signal.throwIfAborted();
        const signed = await signStorage(
          { bucket: authorized.bucket, path: authorized.path, expiresIn: 300 },
          signal,
        );
        signal.throwIfAborted();
        // Require the exact authorized object, not merely the same bucket/origin.
        const url = new URL(signed),
          expected =
            '/storage/v1/object/sign/' +
            args.bucket +
            '/' +
            args.path.split('/').map(encodeURIComponent).join('/');
        if (
          url.origin !== storageOrigin ||
          url.pathname !== expected ||
          url.username ||
          url.password ||
          url.hash ||
          !url.searchParams.get('token')
        )
          throw fail(503);
        return { signedUrl: url.href, expiresIn: 300 };
      }
      if (input?.name === 'portal_realtime_token_v1') {
        if (!input.args || Object.keys(input.args).length) throw fail(400);
        const capability = await application.command(
          actor,
          { name: 'get_admin_realtime_token_capabilities', args: {} },
          signal,
        );
        if (
          !record(capability) ||
          !uuid(capability.userId) ||
          capability.isAdmin !== true ||
          !Array.isArray(capability.authorizedPostIds) ||
          capability.authorizedPostIds.length
        )
          throw fail();
        signal.throwIfAborted();
        // Preserve existing admin channels and TTL. Never accept channels from UI.
        const request = await signRealtime(
          {
            clientId: capability.userId,
            ttl: 900000,
            capability: { 'doji:global': ['subscribe'], 'moderation:global': ['subscribe'] },
          },
          signal,
        );
        signal.throwIfAborted();
        return request;
      }
      // These intermediate authorizations are not standalone browser operations.
      if (
        ['portal_evidence_authorization_v1', 'get_admin_realtime_token_capabilities'].includes(
          input?.name,
        )
      )
        throw fail();
      return application.command(actor, input, signal);
    },
  });
}
