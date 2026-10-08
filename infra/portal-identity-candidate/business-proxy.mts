// Business-only Pages/Edge boundary. Never forward employee cookies or bearer tokens.
import { timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { boundedBody } from './bounded-body.mts';
import { errorStatus } from './business-contracts.mts';
import type { PortalFetch } from './portal-contracts.mts';
export interface BusinessProxyConfig {
  enabled: boolean;
  origin: string;
  endpoint: string;
  proxyKey: string;
}
const routes: Readonly<Record<string, readonly string[]>> = Object.freeze({
  '/auth/start': ['POST'],
  '/auth/callback': ['GET'],
  '/auth/logout': ['POST'],
  '/auth/mfa/prepare': ['POST'],
  '/auth/mfa/complete': ['POST'],
  '/auth/workos-registration': ['POST'],
  '/api/session': ['GET'],
  '/api/application': ['GET', 'POST'],
  '/api/workspace': ['GET'],
});
const callback = '/auth/callback';
const registration = '/auth/workos-registration';
const reply = (status: number) =>
  new Response(null, {
    status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
function validate(config: BusinessProxyConfig) {
  if (
    config.origin !== 'https://business.dojipro.com' ||
    !/^https:\/\/[a-z]{20}\.supabase\.co\/functions\/v1\/business-portal-v2$/.test(
      config.endpoint,
    ) ||
    !/^[a-f0-9]{64}$/.test(config.proxyKey || '')
  )
    throw Error('Business transport configuration unavailable');
  return structuredClone(config);
}
function route(url: URL, method: string) {
  return (
    Object.hasOwn(routes, url.pathname) &&
    routes[url.pathname]?.includes(method) &&
    (url.pathname === callback ? url.search.length <= 4096 : !url.search)
  );
}
function requestHeaders(request: Request, path: string) {
  const headers = new Headers();
  const names =
    path === registration
      ? ['content-type', 'workos-signature']
      : ['content-type', 'x-doji-csrf', 'origin', 'sec-fetch-site'];
  for (const name of names) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (path !== registration) {
    const cookies = (request.headers.get('cookie') || '')
      .split(';')
      .map((s) => s.trim())
      .filter((s) => /^__Host-doji_business(?:_login)?=/.test(s));
    if (cookies.length) headers.set('cookie', cookies.join('; '));
  }
  return headers;
}
export function createBusinessProxy(config: BusinessProxyConfig, upstream: PortalFetch = fetch) {
  const policy = validate(config);
  return async (request: Request): Promise<Response> => {
    let stage = 'request';
    try {
      if (policy.enabled !== true) return reply(503);
      const url = new URL(request.url);
      if (url.origin !== policy.origin || !route(url, request.method)) return reply(404);
      if (
        url.pathname !== callback &&
        url.pathname !== registration &&
        ((request.headers.get('origin') !== policy.origin &&
          !(
            request.method === 'GET' &&
            !request.headers.has('origin') &&
            request.headers.get('sec-fetch-site') === 'same-origin'
          )) ||
          ![null, 'same-origin'].includes(request.headers.get('sec-fetch-site')))
      )
        return reply(403);
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15000)]);
      const body =
        request.method === 'POST' ? await boundedBody(request.body, signal, 16384) : undefined;
      const headers = requestHeaders(request, url.pathname);
      headers.set('x-doji-portal-proxy-key', policy.proxyKey);
      headers.set('x-doji-client-ip', request.headers.get('cf-connecting-ip') || '');
      stage = 'upstream';
      const response = await upstream(policy.endpoint + url.pathname + url.search, {
        method: request.method,
        headers,
        body: body ? new Uint8Array(body) : undefined,
        signal,
        redirect: 'manual',
      });
      stage = 'response';
      const safe = new Headers({
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (
          url.pathname !== callback ||
          response.status !== 303 ||
          ![
            policy.origin + '/business-portal/application/',
            policy.origin + '/business-portal/access/?signin=failed',
          ].includes(location || '')
        ) {
          console.warn('business_proxy_boundary', 'redirect', response.status);
          return reply(503);
        }
        safe.set('location', location!);
      } else safe.set('content-type', 'application/json');
      for (const value of response.headers.getSetCookie()) {
        // Supabase's Cloudflare edge adds this infrastructure cookie even to
        // anonymous 401s. It belongs to that host, not the business browser.
        if (value.startsWith('__cf_bm=')) continue;
        // Only this realm's exact host-only secure cookie contract may escape.
        if (
          !/^__Host-doji_business(?:_login)?=(?:[A-Za-z0-9_-]{43})?; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=(?:0|300|28800)$/.test(
            value,
          )
        ) {
          console.warn('business_proxy_boundary', 'cookie', response.status);
          return reply(503);
        }
        safe.append('set-cookie', value);
      }
      return new Response(response.body, { status: response.status, headers: safe });
    } catch (error) {
      // Bounded operational categories only: no URL, headers, cookie, key,
      // provider error message, body or account identity is logged.
      console.warn('business_proxy_boundary', stage, errorStatus(error));
      return reply(errorStatus(error) === 413 ? 413 : 503);
    }
  };
}
export function createBusinessEdgeIngress(
  config: BusinessProxyConfig,
  handler: (request: Request, client: { ip: string }) => Promise<Response>,
) {
  const policy = validate(config),
    key = Buffer.from(policy.proxyKey);
  return async (request: Request): Promise<Response> => {
    try {
      if (policy.enabled !== true) return reply(503);
      const supplied = Buffer.from(request.headers.get('x-doji-portal-proxy-key') || '');
      if (supplied.length !== key.length || !timingSafeEqual(key, supplied)) return reply(403);
      const url = new URL(request.url),
        endpoint = new URL(policy.endpoint);
      const prefix = url.pathname.startsWith('/business-portal-v2/')
        ? '/business-portal-v2'
        : endpoint.pathname;
      const internal =
        url.protocol === 'http:' &&
        !url.port &&
        url.hostname === endpoint.hostname &&
        prefix === '/business-portal-v2';
      if ((url.origin !== endpoint.origin && !internal) || !url.pathname.startsWith(prefix + '/'))
        return reply(404);
      const target = new URL(policy.origin + url.pathname.slice(prefix.length) + url.search);
      if (!route(target, request.method)) return reply(404);
      return await handler(
        new Request(target, {
          method: request.method,
          headers: requestHeaders(request, target.pathname),
          body: request.body,
          signal: request.signal,
          ...(request.body ? { duplex: 'half' } : {}),
        }),
        {
          ip: request.headers.get('x-doji-client-ip') || '',
        },
      );
    } catch {
      return reply(503);
    }
  };
}
