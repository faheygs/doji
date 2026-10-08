// Candidate only. Each execute is its OWN bounded, committed DB operation.
// Never wrap withSession in a DB transaction, or use a browser/service-role token.
import { createHash, randomBytes } from 'node:crypto';
import { isRecord, errorStatus } from './business-contracts.mts';
import type { BusinessActor } from './business-contracts.mts';
export interface BusinessStoreConfig {
  enabled: boolean;
  realm: 'business';
  origin: string;
  clientId: string;
}
export interface HeldBusinessSession {
  value: string;
  remove: () => Promise<void>;
  replace: (value: string) => Promise<void>;
}
export type BusinessSessionLease = { value: null } | HeldBusinessSession;
export type StoreExecute = (
  role: 'doji_business_session',
  sql: string,
  parameters: (string | number | null)[],
  signal: AbortSignal,
) => Promise<unknown>;
const denied = (status = 503) => Object.assign(Error('Business session unavailable'), { status });
export function createBusinessSessionStore(
  config: BusinessStoreConfig,
  execute: StoreExecute,
  now = Date.now,
) {
  if (
    config?.enabled !== true ||
    config.realm !== 'business' ||
    typeof execute !== 'function' ||
    new URL(config.origin).origin !== config.origin ||
    !config.origin.startsWith('https://') ||
    !/^client_[A-Za-z0-9]+$/.test(config.clientId || '')
  )
    throw denied();
  const scope = createHash('sha256').update(`${config.origin}|${config.clientId}`).digest('hex');
  const run = async (
    op: 'put' | 'peek' | 'take' | 'acquire' | 'remove' | 'replace' | 'release',
    kind: 'flow' | 'session',
    key: string,
    value: string | null = null,
    ttl: number | null = null,
    lease: string | null = null,
    expected: string | null = null,
    signal?: AbortSignal,
  ) => {
    if (!/^[a-f0-9]{64}$/.test(key || '')) throw denied();
    signal?.throwIfAborted();
    try {
      const result = await execute(
        'doji_business_session',
        'select business_session_private.execute_store($1,$2,$3,$4,$5,$6::integer,$7,$8) as result',
        [scope, op, kind, key, value, ttl, lease, expected],
        signal ? AbortSignal.any([signal, AbortSignal.timeout(4000)]) : AbortSignal.timeout(4000),
      );
      if (!isRecord(result)) throw denied();
      return result;
    } catch {
      throw denied();
    }
  };
  const put = async (
    kind: 'flow' | 'session',
    key: string,
    value: string,
    expires: number,
    signal?: AbortSignal,
  ) => {
    const ttl = Math.ceil(expires - now());
    if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > (kind === 'flow' ? 300000 : 28800000))
      throw denied();
    const result = await run('put', kind, key, value, ttl, null, null, signal);
    if (result?.state !== 'ok') throw denied(result?.state === 'capacity' ? 429 : 503);
  };
  return Object.freeze({
    putFlow: (key: string, value: string, expires: number, signal?: AbortSignal) =>
      put('flow', key, value, expires, signal),
    async putSession(
      key: string,
      value: string,
      expires: number,
      signal?: AbortSignal,
      actor?: BusinessActor,
    ) {
      // Legacy local fixtures retain the original store primitive; the independent
      // HTTP callback always supplies the verified actor and uses the atomic bind.
      if (!actor) return put('session', key, value, expires, signal);
      const ttl = Math.ceil(expires - now());
      if (
        actor.realm !== 'business' ||
        !/^[a-f0-9]{64}$/.test(key) ||
        !Number.isSafeInteger(ttl) ||
        ttl < 1 ||
        ttl > 28800000
      )
        throw denied();
      const result = await execute(
        'doji_business_session',
        'select business_session_private.put_bound_session($1,$2,$3,$4::integer,$5,$6,$7,$8) as result',
        [scope, key, value, ttl, actor.issuer, actor.audience, actor.subject, actor.sessionId],
        signal ? AbortSignal.any([signal, AbortSignal.timeout(4000)]) : AbortSignal.timeout(4000),
      );
      if (!isRecord(result) || result.state !== 'ok')
        throw denied(isRecord(result) && result.state === 'capacity' ? 429 : 503);
    },
    async consumeFlow(key: string, accept: (value: string) => boolean, signal?: AbortSignal) {
      const peek = await run('peek', 'flow', key, null, null, null, null, signal);
      if (peek?.state === 'missing') return null;
      if (peek?.state !== 'ok' || typeof peek.value !== 'string') throw denied();
      // Wrong browser bindings leave the valid browser's flow intact. Only the
      // conditional delete winner receives a value and can exchange the code.
      if (accept(peek.value) !== true) return null;
      const taken = await run('take', 'flow', key, null, null, null, peek.value, signal);
      if (taken?.state === 'missing') return null;
      if (taken?.state !== 'ok' || taken.value !== peek.value) throw denied();
      return taken.value;
    },
    async withSession<T>(
      key: string,
      fn: (session: BusinessSessionLease) => Promise<T>,
      signal?: AbortSignal,
    ): Promise<T> {
      const lease = randomBytes(32).toString('hex');
      const acquired = await run('acquire', 'session', key, null, null, lease, null, signal);
      if (acquired?.state === 'missing') return fn({ value: null });
      // Fail promptly instead of polling or holding a DB connection across HTTP.
      if (acquired?.state === 'busy') throw denied(409);
      if (acquired?.state !== 'ok' || typeof acquired.value !== 'string') throw denied();
      let removed = false;
      const remove = async () => {
        if (removed) return;
        const result = await run('remove', 'session', key, null, null, lease);
        if (result.state !== 'ok' && result.state !== 'missing') throw denied();
        removed = true;
      };
      try {
        signal?.throwIfAborted();
        const result = await fn({
          value: acquired.value,
          remove,
          replace: async (value: string) => {
            if (removed) throw denied(401);
            const replaced = await run('replace', 'session', key, value, null, lease, null, signal);
            if (replaced?.state !== 'ok') throw denied(401);
          },
        });
        if (!removed) {
          signal?.throwIfAborted();
          const released = await run('release', 'session', key, null, null, lease, null, signal);
          if (released?.state !== 'ok') throw denied(401);
        }
        return result;
      } catch (error) {
        const status = errorStatus(error);
        if (
          !removed &&
          !signal?.aborted &&
          status !== undefined &&
          [400, 403, 404, 409, 413, 429].includes(status)
        ) {
          // A rejected input or stale application revision is not revocation.
          const released = await run('release', 'session', key, null, null, lease).catch(
            () => null,
          );
          if (released?.state === 'ok') throw error;
        }
        // Persist denial even if the HTTP request aborted. Cleanup has its own
        // short deadline; ambiguous cleanup leaves a lease that expires closed.
        await remove().catch(() => {});
        throw error;
      }
    },
  });
}
