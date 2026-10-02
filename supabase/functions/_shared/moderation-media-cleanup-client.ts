import { guardedMediaCleanup } from './moderation-media-cleanup.ts';
import { moderationStorage } from './moderation-media-storage.ts';
import { employeeServiceHeaders } from './employee-service-headers.ts';

/** One bounded budget per caller/queue. No retry loop.
 * Feature activation requires the SQL fence and both service callers together.
 */
export function createMediaCleanupClient(baseUrl: string, serviceKey: string,
  upstream: typeof fetch = fetch, milliseconds = 45000, maximumObjects = 20) {
  const deadline = Date.now() + milliseconds;
  let remaining = maximumObjects;
  const boundedFetch: typeof fetch = (input, init = {}) => upstream(input, {
    ...init, signal: AbortSignal.any([...(init.signal ? [init.signal] : []),
      AbortSignal.timeout(Math.max(1, deadline - Date.now()))]),
  });
  const port = moderationStorage(baseUrl, serviceKey, boundedFetch);
  const rpc = async (name: string, args: Record<string, unknown>) => {
    try {
    const response = await boundedFetch(`${baseUrl.replace(/\/$/,'')}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: employeeServiceHeaders(serviceKey), body: JSON.stringify(args),
      redirect: 'error', signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) { await response.body?.cancel(); throw Error('Cleanup database unavailable'); }
    return response.json();
    } catch { throw Error('Cleanup database unavailable'); }
  };
  return {
    available: () => remaining > 0 && Date.now() < deadline,
    fetch: boundedFetch,
    async remove(bucket: string, paths: string[]): Promise<{ completed: string[]; deferred: string[] }> {
      const completed: string[] = [];
      // Claim one file at a time, so budget exhaustion does not reserve unstarted
      // work for five minutes. A held file does not consume the object allowance.
      for (const path of [...new Set(paths)]) {
        if (remaining <= 0 || Date.now() >= deadline) break;
        const result = await guardedMediaCleanup(bucket, [path], rpc, port);
        if (result.completed.length) { remaining--; completed.push(path); }
      }
      const done = new Set(completed);
      return { completed, deferred: paths.filter(path => !done.has(path)) };
    },
  };
}
export type MediaCleanupClient = ReturnType<typeof createMediaCleanupClient>;
