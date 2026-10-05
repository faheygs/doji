// Same-origin Pages -> isolated employee function transport. This secret is a
// server binding, never an HTML config value. It does not authorize an employee;
// the destination still verifies the cookie, CSRF, WorkOS MFA and SQL authority.
import { timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { boundedBody } from './bounded-body.mts';
import { errorStatus } from './business-contracts.mts';
import type { PortalFetch } from './portal-contracts.mts';
export interface EmployeeProxyConfig {
  enabled: boolean;
  origin: string;
  endpoint: string;
  proxyKey: string;
}
const methods: Readonly<Record<string, string>> = Object.freeze({
  '/auth/start': 'POST',
  '/auth/complete': 'POST',
  '/auth/logout': 'POST',
  '/api/session': 'GET',
  '/api/rpc': 'POST',
});
const allowedHeaders = ['content-type', 'cookie', 'x-doji-csrf', 'origin', 'sec-fetch-site'];
const reply = (status: number) =>
  new Response(null, {
    status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
function configValid(c: EmployeeProxyConfig) {
  return (
    c.origin === 'https://admin.dojipro.com' &&
    /^https:\/\/[a-z]{20}\.supabase\.co\/functions\/v1\/employee-portal-v2$/.test(c.endpoint) &&
    /^[a-f0-9]{64}$/.test(c.proxyKey || '')
  );
}
const copyHeaders = (request: Request) => {
  const headers = new Headers();
  for (const k of allowedHeaders)
    if (request.headers.has(k)) headers.set(k, request.headers.get(k) ?? '');
  return headers;
};
export function createEmployeeProxy(config: EmployeeProxyConfig, upstream: PortalFetch = fetch) {
  if (!configValid(config)) throw Error('Employee proxy configuration unavailable');
  const policy = structuredClone(config);
  return async (request: Request) => {
    let stage = 'request';
    try {
      if (policy.enabled !== true) return reply(503);
      const url = new URL(request.url);
      if (url.origin !== policy.origin || url.search || methods[url.pathname] !== request.method)
        return reply(404);
      if (
        (request.headers.get('origin') !== policy.origin &&
          !(
            request.method === 'GET' &&
            !request.headers.has('origin') &&
            request.headers.get('sec-fetch-site') === 'same-origin'
          )) ||
        ![null, 'same-origin'].includes(request.headers.get('sec-fetch-site'))
      )
        return reply(403);
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15000)]);
      const bytes =
        request.method === 'POST' ? await boundedBody(request.body, signal, 16384) : undefined;
      const headers = copyHeaders(request);
      headers.set('x-doji-portal-proxy-key', policy.proxyKey);
      headers.set('x-doji-client-ip', request.headers.get('cf-connecting-ip') || '');
      // Owner-approved employee-only locality; the database is in Oregon.
      // Never accept a browser region override or replay an uncertain write.
      // Pinning disables automatic region rerouting; remove this pin to roll back.
      headers.set('x-region', 'us-west-2');
      stage = 'upstream';
      const response = await upstream(policy.endpoint + url.pathname, {
        method: request.method,
        headers,
        body: bytes ? new Uint8Array(bytes) : undefined,
        signal,
        // workerd does not implement redirect:'error'. Never follow a redirect
        // with the server credential: return failure for every 3xx instead.
        redirect: 'manual',
      });
      stage = 'response';
      if (response.status >= 300 && response.status < 400) return reply(503);
      const safe = new Headers({
        'cache-control': 'no-store',
        'content-type': 'application/json',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      });
      for (const c of response.headers.getSetCookie()) safe.append('set-cookie', c);
      // Only our fixed numeric timing schema. No provider headers or descriptions.
      const timing = response.headers.get('server-timing') || '';
      if (
        /^total;dur=\d{1,5}, connect;dur=\d{1,5}, query;dur=\d{1,5}, close;dur=\d{1,5}, identity;dur=\d{1,5}$/.test(
          timing,
        )
      )
        safe.set('server-timing', timing);
      const region = response.headers.get('x-sb-edge-region') || '';
      if (/^[a-z]{2}-[a-z]+-\d$/.test(region)) safe.set('x-doji-edge-region', region);
      return new Response(response.body, { status: response.status, headers: safe });
    } catch (error) {
      const response = reply(errorStatus(error) === 413 ? 413 : 503);
      // Fixed, content-free stages only: no exception text, tokens or user data.
      response.headers.set('x-doji-failure-stage', stage);
      return response;
    }
  };
}
export function createEmployeeEdgeIngress(
  config: EmployeeProxyConfig,
  handler: (request: Request, clientIp: string) => Promise<Response>,
) {
  if (!configValid(config) || typeof handler !== 'function')
    throw Error('Employee ingress configuration unavailable');
  const policy = structuredClone(config),
    key = Buffer.from(policy.proxyKey);
  return async (request: Request) => {
    try {
      if (policy.enabled !== true) return reply(503);
      const value = request.headers.get('x-doji-portal-proxy-key') || '';
      if (value.length !== 64 || !timingSafeEqual(key, Buffer.from(value))) return reply(403);
      const url = new URL(request.url),
        endpoint = new URL(policy.endpoint);
      // Supabase's gateway removes /functions/v1 before the function router.
      // Accept only the exact documented function-name prefix (and the public
      // prefix for direct runtime tests); never an arbitrary suffix match.
      const prefix = url.pathname.startsWith('/employee-portal-v2/')
        ? '/employee-portal-v2'
        : endpoint.pathname;
      // Hosted gateway terminates HTTPS and supplies an internal HTTP request
      // with this exact project hostname. This is not an outbound HTTP call:
      // proxy traffic remains pinned to HTTPS and the server key was checked
      // above. Do not trust forwarded-host headers or arbitrary internal hosts.
      const gatewayOrigin =
        url.protocol === 'http:' &&
        !url.port &&
        url.hostname === endpoint.hostname &&
        prefix === '/employee-portal-v2';
      if (
        (url.origin !== endpoint.origin && !gatewayOrigin) ||
        !url.pathname.startsWith(prefix + '/') ||
        url.search
      )
        return reply(404);
      const path = url.pathname.slice(prefix.length);
      if (methods[path] !== request.method) return reply(404);
      const headers = copyHeaders(request);
      const forwarded = new Request(policy.origin + path, {
        method: request.method,
        headers,
        body: request.body,
        signal: request.signal,
        ...(request.body ? { duplex: 'half' } : {}),
      });
      return await handler(forwarded, request.headers.get('x-doji-client-ip') || '');
    } catch {
      return reply(503);
    }
  };
}
