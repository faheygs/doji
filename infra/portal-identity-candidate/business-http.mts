// LOCAL CANDIDATE ONLY: not mounted in production or a shared Worker.
// Store contract: bounded TTL/capacity; consumeFlow is atomic; withSession must
// serialize across instances, persist deletion on errors and never resurrect it.
// Encryption keys are server-only. Production requires a reviewed durable adapter.
import { createHash } from 'node:crypto';
import { boundedBody } from './bounded-body.mts';
import { businessMfaCommand } from './business-mfa-session.mts';
import { isRecord, errorStatus } from './business-contracts.mts';
import {
  random,
  hash,
  equal,
  opaque,
  fail,
  createBusinessCipher,
  loginFlow,
  savedSession,
  isVerifiedBusinessActor,
} from './business-http-state.mts';
import type { BusinessHttpConfig, BusinessHttpDependencies } from './business-http-contracts.mts';
import type { BusinessTokens } from './workos-business-provider.mts';
const cookieName = '__Host-doji_business';
const flowName = '__Host-doji_business_login';
function cookie(request: Request, name: string) {
  const matches = (request.headers.get('cookie') || '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.startsWith(name + '='));
  const match = matches[0];
  if (matches.length !== 1 || !match) return null;
  const value = match.slice(name.length + 1);
  return opaque(value) ? value : null;
}
const setCookie = (name: string, value: string, seconds: number) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
const headers = () =>
  new Headers({
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  });

export function createBusinessHttp(
  config: BusinessHttpConfig,
  {
    store,
    provider,
    verify,
    application,
    admission,
    mfa,
    now = Date.now,
  }: BusinessHttpDependencies,
) {
  const policy = structuredClone(config);
  const origin = new URL(policy.origin);
  if (
    origin.protocol !== 'https:' ||
    origin.origin !== policy.origin ||
    policy.realm !== 'business' ||
    !/^client_[A-Za-z0-9]+$/.test(policy.clientId || '') ||
    !/^[a-f0-9]{64}$/.test(policy.encryptionKey || '') ||
    !store ||
    !provider ||
    typeof verify !== 'function' ||
    typeof admission !== 'function'
  )
    throw fail(503);
  const { seal, open } = createBusinessCipher(policy.origin, policy.clientId, policy.encryptionKey);
  const json = (data: unknown, status = 200, extra?: [string, string][]) => {
    const h = headers();
    h.set('Content-Type', 'application/json');
    for (const [k, v] of extra || []) h.append(k, v);
    return new Response(JSON.stringify(data), { status, headers: h });
  };
  const redirect = (path: string, cookies: string[] = []) => {
    const h = headers();
    h.set('Location', policy.origin + path);
    for (const c of cookies) h.append('Set-Cookie', c);
    return new Response(null, { status: 303, headers: h });
  };
  async function body(request: Request) {
    if (request.headers.get('content-type') !== 'application/json') throw fail(400);
    if (!request.body) throw fail(400);
    const bytes = await boundedBody(request.body, request.signal, 16384);
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw fail(400);
    }
    if (!isRecord(value)) throw fail(400);
    return value;
  }
  async function identity(tokens: BusinessTokens, signal: AbortSignal) {
    const result = await verify(
      new Request(policy.origin + '/internal/verify', {
        headers: { origin: policy.origin, authorization: `Bearer ${tokens.accessToken}` },
        signal,
      }),
    );
    if (
      !isVerifiedBusinessActor(result) ||
      result.audience !== policy.clientId ||
      result.issuer !== `https://api.workos.com/user_management/${policy.clientId}` ||
      result.subject !== tokens.subject
    )
      throw fail();
    return result;
  }
  return async function handle(request: Request): Promise<Response> {
    request = new Request(request, {
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
    });
    const url = new URL(request.url),
      path = url.pathname;
    try {
      if (policy.enabled !== true) throw fail(503);
      if (url.origin !== policy.origin || request.signal.aborted) throw fail(403);
      const callback = path === '/auth/callback' && request.method === 'GET';
      const sameOriginRead =
        request.method === 'GET' &&
        !request.headers.has('origin') &&
        request.headers.get('sec-fetch-site') === 'same-origin';
      if (
        !callback &&
        ((!sameOriginRead && request.headers.get('origin') !== policy.origin) ||
          !['same-origin', null].includes(request.headers.get('sec-fetch-site')))
      )
        throw fail(403);
      if (!callback && url.search) throw fail(400);
      if (path === '/auth/start' && request.method === 'POST') {
        const existing = cookie(request, cookieName);
        if (existing)
          await store.withSession(
            hash(existing),
            async (cell) => {
              if (cell.value) throw fail(409);
            },
            request.signal,
          );
        const input = await body(request);
        if (
          Object.keys(input).some(
            (k) =>
              ![
                'signup',
                'termsAccepted',
                'privacyAcknowledged',
                'country',
                'termsVersion',
                'privacyVersion',
                'proof',
              ].includes(k),
          )
        )
          throw fail(400);
        const signup = input.signup === true;
        if (input.signup !== false && !signup) throw fail(400);
        if (
          signup &&
          (policy.signupEnabled !== true ||
            input.termsAccepted !== true ||
            input.privacyAcknowledged !== true ||
            input.country !== 'US' ||
            input.termsVersion !== policy.termsVersion ||
            input.privacyVersion !== policy.privacyVersion)
        )
          throw fail(403);
        // Mandatory server-owned budget/CAPTCHA check; screen_hint is not signup enforcement.
        const allowed = await admission({ signup, proof: input.proof, signal: request.signal });
        request.signal.throwIfAborted();
        if (allowed !== true) throw fail(429);
        const binding = random(),
          state = random(),
          verifier = random();
        const agreements = signup
          ? {
              termsAccepted: true,
              privacyAcknowledged: true,
              country: 'US',
              termsVersion: policy.termsVersion,
              privacyVersion: policy.privacyVersion,
            }
          : null;
        await store.putFlow(
          hash(state),
          seal({ binding: hash(binding), verifier, agreements, expires: now() + 300000 }),
          now() + 300000,
          request.signal,
        );
        const authorizationUrl = provider.authorizationUrl({
          state,
          challenge: createHash('sha256').update(verifier).digest('base64url'),
          redirectUri: policy.origin + '/auth/callback',
          signup,
        });
        return json({ authorizationUrl }, 200, [['Set-Cookie', setCookie(flowName, binding, 300)]]);
      }
      if (callback) {
        const binding = cookie(request, flowName),
          state = url.searchParams.get('state');
        if (
          !binding ||
          !opaque(state) ||
          [...url.searchParams.keys()].some(
            (k) => !['state', 'code', 'error', 'error_description'].includes(k),
          ) ||
          [...new Set(url.searchParams.keys())].some((k) => url.searchParams.getAll(k).length !== 1)
        )
          throw fail();
        // Store consumes only a matching binding, atomically, before provider exchange.
        const flow = await store.consumeFlow(
          hash(state),
          (envelope) => {
            const value = loginFlow(open(envelope));
            return value.expires > now() && equal(value.binding, hash(binding));
          },
          request.signal,
        );
        if (!flow) throw fail();
        const pending = loginFlow(open(flow)),
          code = url.searchParams.get('code');
        if (url.searchParams.has('error') || !code || !/^[A-Za-z0-9_-]{8,2048}$/.test(code))
          throw fail();
        const tokens = await provider.exchange(code, pending.verifier, request.signal);
        const actor = await identity(tokens, request.signal);
        let installed = false;
        try {
          request.signal.throwIfAborted();
          if (pending.agreements)
            await application.enroll(actor, pending.agreements, request.signal);
          else await application.authorize(actor, request.signal); // Never auto-enroll on sign-in.
          request.signal.throwIfAborted();
          const session = random(),
            csrf = random(),
            created = now();
          await store.putSession(
            hash(session),
            seal({ tokens, actor, csrf, created, touched: created }),
            created + 8 * 3600000,
            request.signal,
            actor,
          );
          installed = true;
          return redirect('/business-portal/application/', [
            setCookie(cookieName, session, 28800),
            setCookie(flowName, '', 0),
          ]);
        } finally {
          if (!installed)
            await provider.revoke(actor.sessionId, AbortSignal.timeout(10000)).catch(() => {});
        }
      }
      const mfaRoute = path === '/auth/mfa/prepare' || path === '/auth/mfa/complete';
      const routes = [
        '/api/session',
        '/api/application',
        '/api/workspace',
        '/auth/logout',
        '/auth/mfa/prepare',
        '/auth/mfa/complete',
      ];
      if (
        !routes.includes(path) ||
        !['GET', 'POST'].includes(request.method) ||
        (path === '/api/session' && request.method !== 'GET') ||
        (path === '/api/workspace' && request.method !== 'GET') ||
        (path === '/auth/logout' && request.method !== 'POST') ||
        (mfaRoute && (request.method !== 'POST' || !mfa))
      )
        throw fail(404);
      const raw = cookie(request, cookieName);
      if (!raw) throw fail();
      const input = request.method === 'POST' ? await body(request) : null;
      return await store.withSession(
        hash(raw),
        async (cell) => {
          if (cell.value === null) throw fail();
          let saved;
          try {
            saved = savedSession(open(cell.value));
          } catch {
            await cell.remove();
            throw fail();
          }
          if (saved.created + 8 * 3600000 <= now() || saved.touched + 30 * 60000 <= now()) {
            await cell.remove();
            throw fail();
          }
          if (request.method === 'POST' && !equal(request.headers.get('x-doji-csrf'), saved.csrf))
            throw fail(403);
          if (path === '/auth/logout') {
            if (!input || Object.keys(input).length) throw fail(400);
            await cell.remove(); // Local denial precedes remote revoke, including timeout.
            let remoteConfirmed = true;
            try {
              await provider.revoke(saved.actor.sessionId, request.signal);
            } catch {
              remoteConfirmed = false;
            }
            return json({ signedIn: false, remoteConfirmed }, 200, [
              ['Set-Cookie', setCookie(cookieName, '', 0)],
            ]);
          }
          try {
            if (saved.actor.expiresAtSeconds <= now() / 1000 + 30) {
              const tokens = await provider.refresh(saved.tokens.refreshToken, request.signal);
              const actor = await identity(tokens, request.signal);
              if (
                actor.subject !== saved.actor.subject ||
                actor.sessionId !== saved.actor.sessionId
              )
                throw fail();
              saved.tokens = tokens;
              saved.actor = actor;
            } else saved.actor = await identity(saved.tokens, request.signal);
            if (mfa) saved.actor = mfa.attest(saved.actor, saved.mfaReceipt);
            if (path === '/api/session' || mfaRoute)
              await application.authorize(saved.actor, request.signal);
          } catch {
            await cell.remove();
            throw fail();
          }
          saved.touched = now();
          request.signal.throwIfAborted();
          await cell.replace(seal(saved));
          if (mfaRoute && mfa) {
            try {
              return json(
                await businessMfaCommand(
                  path,
                  input,
                  saved,
                  () => cell.replace(seal(saved)),
                  mfa,
                  request.signal,
                  now,
                ),
              );
            } catch (error) {
              // Match browser denial: invalid identity/challenge bindings remove
              // the durable session; a simple rejected code (400) does not.
              if ([401, 403].includes(errorStatus(error) ?? 0)) await cell.remove();
              throw error;
            }
          }
          if (path === '/api/session')
            return json({
              signedIn: true,
              csrf: saved.csrf,
              assurance: saved.actor.mfaVerified ? 'aal2' : 'aal1',
            });
          try {
            const result =
              path === '/api/workspace'
                ? await application.workspace(saved.actor, request.signal)
                : request.method === 'GET'
                  ? await application.read(saved.actor, request.signal)
                  : await application.command(saved.actor, input, request.signal);
            return json(result);
          } catch (error) {
            const status = errorStatus(error);
            if (status === 401 || status === 403) await cell.remove();
            throw error;
          }
        },
        request.signal,
      );
    } catch (error) {
      if (path === '/auth/callback')
        return redirect('/business-portal/access/?signin=failed', [setCookie(flowName, '', 0)]);
      return json(
        { message: 'Business access could not be completed. Please retry or sign in again.' },
        [400, 401, 403, 404, 409, 413, 429, 503].includes(errorStatus(error) ?? 503)
          ? (errorStatus(error) ?? 503)
          : 503,
      );
    }
  };
}
