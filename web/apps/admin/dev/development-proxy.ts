import { randomBytes, randomUUID } from 'node:crypto';
import { boundedBody } from '../../../../infra/portal-identity/bounded-body.mts';
import { developmentEndpoint } from '../../../../infra/portal-identity/admin-development.mts';
import { localAdminOrigin } from './transport.ts';

const cookieName = 'doji_admin_development_4313';
const secret = () => randomBytes(32).toString('base64url');
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
type Session = { csrf: string; persona: string | null; expires: number; busy: boolean };
const fail = (
  status: number,
  message = 'Local staging request unavailable. No automatic retry was made.',
) => Object.assign(Error(message), { status });

export function createDevelopmentProxy(
  token: string,
  upstream: typeof fetch = fetch,
  now = Date.now,
) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw Error(
      'Load your approved DOJI_ADMIN_DEVELOPMENT_TOKEN before starting connected development.',
    );
  const sessions = new Map<string, Session>();
  async function invoke(
    persona: string | null,
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ) {
    const response = await upstream(developmentEndpoint, {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ persona, name, args, requestId: randomUUID() }),
    });
    if (!response.headers.get('content-type')?.startsWith('application/json')) throw fail(503);
    const result: unknown = JSON.parse(
      new TextDecoder().decode(await boundedBody(response.body, signal, 2 * 1024 * 1024)),
    );
    if (!response.ok)
      throw fail(
        [400, 401, 403, 409].includes(response.status) ? response.status : 503,
        response.status === 401
          ? 'Development access expired or was revoked. Ask for a new staging credential.'
          : response.status === 403
            ? 'This persona does not have permission.'
            : undefined,
      );
    return result;
  }
  return {
    dispose: () => sessions.clear(),
    async handle(request: Request): Promise<Response> {
      const headers = new Headers({
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      let session: Session | undefined;
      let locked = false;
      try {
        const url = new URL(request.url);
        const path = url.pathname;
        const methods: Record<string, string> = {
          '/api/dev/personas': 'GET',
          '/api/dev/select': 'POST',
          '/api/dev/session': 'GET',
          '/api/dev/rpc': 'POST',
          '/api/dev/logout': 'POST',
        };
        if (url.origin !== localAdminOrigin || url.search || methods[path] !== request.method)
          throw fail(404);
        if (
          request.headers.get('sec-fetch-site') !== 'same-origin' ||
          (request.headers.get('origin') !== localAdminOrigin &&
            !(request.method === 'GET' && !request.headers.has('origin')))
        )
          throw fail(403);
        if (request.method === 'POST' && request.headers.get('content-type') !== 'application/json')
          throw fail(415);
        const cookie = (request.headers.get('cookie') ?? '')
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.startsWith(cookieName + '='));
        if (cookie.length > 1) throw fail(403);
        let id = cookie[0]?.slice(cookieName.length + 1) ?? '';
        for (const [key, value] of sessions)
          if (value.expires <= now() && !value.busy) sessions.delete(key);
        session = sessions.get(id);
        if (session?.busy)
          throw fail(409, 'Another request is finishing. Try again once it completes.');
        if (
          path !== '/api/dev/personas' &&
          (!session || request.headers.get('x-doji-csrf') !== session.csrf)
        )
          throw fail(401, 'Development session changed. Choose a persona again.');
        if (!session) {
          if (sessions.size >= 32) throw fail(503);
          id = secret();
          session = { csrf: secret(), persona: null, expires: now() + 8 * 3600000, busy: false };
          sessions.set(id, session);
        }
        session.busy = true;
        locked = true;
        headers.set(
          'set-cookie',
          `${cookieName}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor((session.expires - now()) / 1000))}`,
        );
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(12000)]);
        const args: unknown =
          request.method === 'POST'
            ? JSON.parse(new TextDecoder().decode(await boundedBody(request.body, signal, 16384)))
            : {};
        if (!record(args)) throw fail(400);
        if (path === '/api/dev/personas') {
          const list = await invoke(null, 'personas', {}, signal);
          if (
            !record(list) ||
            typeof list.developer !== 'string' ||
            !Array.isArray(list.personas) ||
            list.personas.length > 100 ||
            !list.personas.every(
              (p) => record(p) && typeof p.id === 'string' && typeof p.label === 'string',
            )
          )
            throw fail(503);
          return Response.json(
            { ...list, csrf: session.csrf, selected: session.persona },
            { headers },
          );
        }
        if (path === '/api/dev/logout') {
          if (Object.keys(args).length) throw fail(400);
          session.persona = null;
          session.csrf = secret();
          return Response.json({ signedIn: false }, { headers });
        }
        if (path === '/api/dev/select') {
          if (
            Object.keys(args).length !== 1 ||
            typeof args.persona !== 'string' ||
            !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(args.persona)
          )
            throw fail(400);
          // Invalidate the previous persona before dispatch. A failed selection
          // cannot leave a browser operating as its former privileged identity.
          session.persona = null;
          session.csrf = secret();
          const operator = await invoke(args.persona, 'get_admin_portal_session_v3', {}, signal);
          if (!record(operator) || operator.user_id !== args.persona) throw fail(503);
          session.persona = args.persona;
          return Response.json({ csrf: session.csrf }, { headers });
        }
        if (!session.persona) throw fail(401, 'Choose a staging persona to continue.');
        if (path === '/api/dev/session') {
          const operator = await invoke(session.persona, 'get_admin_portal_session_v3', {}, signal);
          if (!record(operator) || operator.user_id !== session.persona) throw fail(401);
          return Response.json(
            { signedIn: true, assurance: 'staging_development', operator },
            { headers },
          );
        }
        if (Object.keys(args).length !== 2 || typeof args.name !== 'string' || !record(args.args))
          throw fail(400);
        return Response.json(await invoke(session.persona, args.name, args.args, signal), {
          headers,
        });
      } catch (error) {
        const status = record(error) && typeof error.status === 'number' ? error.status : 503;
        if (locked && session && status === 401) {
          session.persona = null;
          session.csrf = secret();
        }
        return Response.json(
          {
            message:
              error instanceof Error && record(error) && error.status
                ? error.message
                : 'Staging unavailable. No automatic retry was made.',
          },
          { status, headers },
        );
      } finally {
        if (locked && session) session.busy = false;
      }
    },
  };
}
