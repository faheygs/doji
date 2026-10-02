// LOCAL CANDIDATE ONLY: not mounted in production or a shared Worker.
// Store contract: bounded TTL/capacity; consumeFlow is atomic; withSession must
// serialize across instances, persist deletion on errors and never resurrect it.
// Encryption keys are server-only. Production requires a reviewed durable adapter.
import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from 'node:crypto';
import { boundedBody } from './bounded-body.mjs';
const random = () => randomBytes(32).toString('base64url');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const equal = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const opaque = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);
const fail = (status = 401) =>
  Object.assign(Error('Business access could not be verified. Please sign in again.'), { status });
const cookieName = '__Host-doji_business';
const flowName = '__Host-doji_business_login';
function cookie(request, name) {
  const matches = (request.headers.get('cookie') || '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.startsWith(name + '='));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return opaque(value) ? value : null;
}
const setCookie = (name, value, seconds) =>
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
  config,
  { store, provider, verify, application, admission, now = Date.now },
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
  const key = Buffer.from(policy.encryptionKey, 'hex');
  const aad = Buffer.from(`doji-business-v1|${policy.origin}|${policy.clientId}`);
  const seal = (data) => {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad);
    const text = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), text]).toString('base64url');
  };
  const open = (text) => {
    if (typeof text !== 'string' || text.length > 50000) throw fail();
    const bytes = Buffer.from(text, 'base64url'),
      decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAAD(aad);
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'),
    );
  };
  const json = (data, status = 200, extra) => {
    const h = headers();
    h.set('Content-Type', 'application/json');
    for (const [k, v] of extra || []) h.append(k, v);
    return new Response(JSON.stringify(data), { status, headers: h });
  };
  const redirect = (path, cookies = []) => {
    const h = headers();
    h.set('Location', policy.origin + path);
    for (const c of cookies) h.append('Set-Cookie', c);
    return new Response(null, { status: 303, headers: h });
  };
  async function body(request) {
    if (request.headers.get('content-type') !== 'application/json') throw fail(400);
    if (!request.body) throw fail(400);
    const bytes = await boundedBody(request.body, request.signal, 16384);
    let value;
    try {
      value = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw fail(400);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail(400);
    return value;
  }
  async function identity(tokens, signal) {
    const result = await verify(
      new Request(policy.origin + '/internal/verify', {
        headers: { origin: policy.origin, authorization: `Bearer ${tokens.accessToken}` },
        signal,
      }),
    );
    if (
      result.realm !== 'business' ||
      result.audience !== policy.clientId ||
      result.issuer !== `https://api.workos.com/user_management/${policy.clientId}` ||
      result.subject !== tokens.subject
    )
      throw fail();
    return result;
  }
  return async function handle(request) {
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
            const value = open(envelope);
            return value.expires > now() && equal(value.binding, hash(binding));
          },
          request.signal,
        );
        if (!flow) throw fail();
        const pending = open(flow),
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
      const routes = ['/api/session', '/api/application', '/auth/logout'];
      if (
        !routes.includes(path) ||
        !['GET', 'POST'].includes(request.method) ||
        (path === '/api/session' && request.method !== 'GET') ||
        (path === '/auth/logout' && request.method !== 'POST')
      )
        throw fail(404);
      const raw = cookie(request, cookieName);
      if (!raw) throw fail();
      const input = request.method === 'POST' ? await body(request) : null;
      return await store.withSession(
        hash(raw),
        async (cell) => {
          if (!cell.value) throw fail();
          let saved;
          try {
            saved = open(cell.value);
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
            if (Object.keys(input).length) throw fail(400);
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
            if (path === '/api/session') await application.authorize(saved.actor, request.signal);
          } catch {
            await cell.remove();
            throw fail();
          }
          saved.touched = now();
          request.signal.throwIfAborted();
          await cell.replace(seal(saved));
          if (path === '/api/session')
            return json({
              signedIn: true,
              csrf: saved.csrf,
              assurance: saved.actor.mfaVerified ? 'aal2' : 'aal1',
            });
          try {
            const result =
              request.method === 'GET'
                ? await application.read(saved.actor, request.signal)
                : await application.command(saved.actor, input, request.signal);
            return json(result);
          } catch (error) {
            if ([401, 403].includes(error.status)) await cell.remove();
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
        [400, 401, 403, 404, 409, 413, 429, 503].includes(error.status) ? error.status : 503,
      );
    }
  };
}
