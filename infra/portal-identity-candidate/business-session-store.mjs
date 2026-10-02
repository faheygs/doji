// Candidate only. Each execute is its OWN bounded, committed DB operation.
// Never wrap withSession in a DB transaction, or use a browser/service-role token.
import { createHash, randomBytes } from 'node:crypto';
const denied = (status = 503) => Object.assign(Error('Business session unavailable'), { status });
export function createBusinessSessionStore(config, execute, now = Date.now) {
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
    op,
    kind,
    key,
    value = null,
    ttl = null,
    lease = null,
    expected = null,
    signal,
  ) => {
    if (!/^[a-f0-9]{64}$/.test(key || '')) throw denied();
    signal?.throwIfAborted();
    try {
      return await execute(
        'doji_business_session',
        'select business_session_private.execute_store($1,$2,$3,$4,$5,$6::integer,$7,$8) as result',
        [scope, op, kind, key, value, ttl, lease, expected],
        signal ? AbortSignal.any([signal, AbortSignal.timeout(4000)]) : AbortSignal.timeout(4000),
      );
    } catch {
      throw denied();
    }
  };
  const put = async (kind, key, value, expires, signal) => {
    const ttl = Math.ceil(expires - now());
    if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > (kind === 'flow' ? 300000 : 28800000))
      throw denied();
    const result = await run('put', kind, key, value, ttl, null, null, signal);
    if (result?.state !== 'ok') throw denied(result?.state === 'capacity' ? 429 : 503);
  };
  return Object.freeze({
    putFlow: (key, value, expires, signal) => put('flow', key, value, expires, signal),
    putSession: (key, value, expires, signal) => put('session', key, value, expires, signal),
    async consumeFlow(key, accept, signal) {
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
    async withSession(key, fn, signal) {
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
        if (!['ok', 'missing'].includes(result?.state)) throw denied();
        removed = true;
      };
      try {
        signal?.throwIfAborted();
        const result = await fn({
          value: acquired.value,
          remove,
          replace: async (value) => {
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
        if (!removed && !signal?.aborted && [400, 403, 404, 409, 413, 429].includes(error.status)) {
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
