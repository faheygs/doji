import { randomBytes } from 'node:crypto';
import { employeeStagingOrigin } from '../../../../infra/portal-identity/employee-contracts.mts';
import { boundedBody } from '../../../../infra/portal-identity/bounded-body.mts';
import { localAdminOrigin, localRoutes } from './transport.ts';

const cookieName = 'doji_admin_staging_dev_4313';
const remoteNames = ['__Host-doji_employee', '__Host-doji_employee_login'];
type Session = {
  cookies: Map<string, { value: string; expires: number }>;
  expires: number;
  busy: boolean;
};
const failure = (status: number) =>
  Response.json(
    { message: 'Local staging request unavailable. No automatic retry was made.' },
    { status, headers: { 'cache-control': 'no-store' } },
  );

// Per-process jars prevent sharing a single upstream login across local browsers.
// No hosted cookie, password or key is written to disk or placed in a local cookie.
export function createLocalStagingProxy(upstream: typeof fetch = fetch, now = Date.now) {
  const sessions = new Map<string, Session>();
  return {
    dispose: () => sessions.clear(),
    async handle(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (
        url.origin !== localAdminOrigin ||
        url.search ||
        localRoutes[url.pathname] !== request.method
      )
        return failure(404);
      const origin = request.headers.get('origin');
      if (
        request.headers.get('sec-fetch-site') !== 'same-origin' ||
        (origin !== localAdminOrigin && !(request.method === 'GET' && origin === null))
      )
        return failure(403);
      if (request.method === 'POST' && request.headers.get('content-type') !== 'application/json')
        return failure(415);
      const tokens = (request.headers.get('cookie') ?? '')
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.startsWith(cookieName + '='));
      if (tokens.length > 1) return failure(403);
      let id = tokens[0]?.slice(cookieName.length + 1) ?? '';
      for (const [key, cell] of sessions)
        if (
          !cell.busy &&
          (cell.expires <= now() || ![...cell.cookies.values()].some((c) => c.expires > now()))
        )
          sessions.delete(key);
      let session = sessions.get(id);
      if (session?.busy) return failure(409);
      if (!session && sessions.size >= 64) return failure(503);
      if (session) session.busy = true;
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15000)]);
      try {
        const bytes =
          request.method === 'POST' ? await boundedBody(request.body, signal, 16384) : undefined;
        const headers = new Headers({
          origin: employeeStagingOrigin,
          'sec-fetch-site': 'same-origin',
        });
        for (const key of ['content-type', 'x-doji-csrf']) {
          const value = request.headers.get(key);
          if (value) headers.set(key, value);
        }
        if (session)
          headers.set(
            'cookie',
            [...session.cookies]
              .filter(([, c]) => c.expires > now())
              .map(([k, c]) => `${k}=${c.value}`)
              .join('; '),
          );
        const response = await upstream(employeeStagingOrigin + url.pathname, {
          method: request.method,
          headers,
          signal,
          redirect: 'manual',
          ...(bytes ? { body: new Uint8Array(bytes) } : {}),
        });
        if (
          (response.status >= 300 && response.status < 400) ||
          !response.headers.get('content-type')?.startsWith('application/json')
        ) {
          await response.body?.cancel();
          return failure(503);
        }
        const cookies = response.headers.getSetCookie().map((value) => {
          const match =
            /^(__Host-doji_employee(?:_login)?)=([A-Za-z0-9_-]*); Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=(\d+)$/.exec(
              value,
            );
          if (
            !match ||
            !remoteNames.includes(match[1]!) ||
            (match[2] && match[2].length !== 43) ||
            Number(match[3]) > 28800
          )
            throw Error('Unexpected staging cookie.');
          return { name: match[1]!, value: match[2]!, seconds: Number(match[3]) };
        });
        // Preserve a known jar even if a later response-body read fails. A
        // failed response does not prove that the remote operation rolled back.
        if (!session && cookies.some((c) => c.value && c.seconds)) {
          if (sessions.size >= 64) return failure(503);
          id = randomBytes(32).toString('base64url');
          session = { cookies: new Map(), expires: now() + 28800000, busy: true };
          sessions.set(id, session);
        }
        for (const c of cookies) {
          if (!c.value || !c.seconds) session?.cookies.delete(c.name);
          else session?.cookies.set(c.name, { value: c.value, expires: now() + c.seconds * 1000 });
        }
        const output = new Headers({
          'content-type': 'application/json',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
        });
        if (session)
          output.set(
            'set-cookie',
            `${cookieName}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor((session.expires - now()) / 1000))}`,
          );
        const body = await boundedBody(response.body, signal, 2 * 1024 * 1024);
        return new Response(new Uint8Array(body), { status: response.status, headers: output });
      } catch (error) {
        const result = failure(
          error instanceof Error && 'status' in error && error.status === 413 ? 413 : 503,
        );
        if (session)
          result.headers.set(
            'set-cookie',
            `${cookieName}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor((session.expires - now()) / 1000))}`,
          );
        return result;
      } finally {
        if (session) session.busy = false;
      }
    },
  };
}
