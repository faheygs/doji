// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalStagingProxy } from './proxy';
import { localAdminOrigin, localStagingFetch } from './transport';
import { employeeStagingOrigin } from '../../../../infra/portal-identity/employee-contracts.mts';

afterEach(() => vi.unstubAllGlobals());
const token = 'a'.repeat(43);
const cookie = (name = '__Host-doji_employee', value = token, age = 1800) =>
  `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
const json = (value: unknown, cookies: string[] = [], status = 200) => {
  const headers = new Headers({ 'content-type': 'application/json' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(JSON.stringify(value), { status, headers });
};
function request(path = '/api/session', headers: Record<string, string> = {}, body?: string) {
  return new Request(localAdminOrigin + path, {
    method: path === '/api/session' ? 'GET' : 'POST',
    headers: {
      origin: localAdminOrigin,
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
      ...headers,
    },
    ...(path === '/api/session' ? {} : { body: body ?? '{}' }),
  });
}
function fixture(reply: typeof fetch = async () => json({ signedIn: false }, [], 401)) {
  vi.stubGlobal('fetch', () => {
    throw Error('Unmocked network denied');
  });
  const upstream = vi.fn(reply);
  const proxy = createLocalStagingProxy(upstream);
  return { proxy, upstream };
}
describe('local staging relay', () => {
  it('rejects cross-site, missing provenance, other origins, queries, routes and methods', async () => {
    const { proxy, upstream } = fixture();
    for (const headers of [
      { origin: 'https://evil.example' },
      { origin: 'null' },
      { 'sec-fetch-site': 'cross-site' },
      { 'sec-fetch-site': 'same-site' },
      { 'sec-fetch-site': '' },
    ])
      expect((await proxy.handle(request('/auth/start', headers))).status).toBe(403);
    for (const url of [
      'https://admin.dojipro.com/api/session',
      localAdminOrigin + '/api/session?target=production',
      localAdminOrigin + '/api/other',
    ])
      expect((await proxy.handle(new Request(url))).status).toBe(404);
    expect((await proxy.handle(new Request(localAdminOrigin + '/auth/start'))).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('requires JSON and bounds request bodies before any network call', async () => {
    const { proxy, upstream } = fixture();
    expect(
      (await proxy.handle(request('/auth/start', { 'content-type': 'text/plain' }))).status,
    ).toBe(415);
    expect((await proxy.handle(request('/api/rpc', {}, 'a'.repeat(16385)))).status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('pins HTTPS staging and forwards only protocol headers, never browser credentials', async () => {
    const { proxy, upstream } = fixture();
    await proxy.handle(
      request('/api/session', {
        authorization: 'Bearer synthetic',
        cookie: '__Host-doji_employee=' + token,
        'x-doji-portal-proxy-key': 'synthetic',
        'x-doji-csrf': token,
      }),
    );
    const [url, options] = upstream.mock.calls[0]!;
    expect(url).toBe(employeeStagingOrigin + '/api/session');
    expect(options?.redirect).toBe('manual');
    const h = new Headers(options?.headers);
    expect([...h.keys()].sort()).toEqual([
      'content-type',
      'origin',
      'sec-fetch-site',
      'x-doji-csrf',
    ]);
    expect(h.get('origin')).toBe(employeeStagingOrigin);
  });
  it('keeps upstream cookies in separate per-browser jars and preserves MFA/CSRF', async () => {
    const { proxy, upstream } = fixture(async (input, init) => {
      if (String(input).endsWith('/auth/start'))
        return json({ step: 'totp', csrf: token }, [cookie('__Host-doji_employee_login')]);
      if (String(input).endsWith('/auth/complete')) {
        expect(new Headers(init?.headers).get('x-doji-csrf')).toBe(token);
        return json({ signedIn: true, assurance: 'aal2', csrf: token }, [
          cookie(),
          cookie('__Host-doji_employee_login', '', 0),
        ]);
      }
      return json({ signedIn: false }, [], 401);
    });
    const first = await proxy.handle(request('/auth/start'));
    expect(await first.json()).toEqual({ step: 'totp', csrf: token });
    const local = first.headers.get('set-cookie')!.split(';')[0]!;
    expect(local).not.toContain(token);
    expect(first.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Strict');
    await proxy.handle(request('/auth/complete', { cookie: local, 'x-doji-csrf': token }));
    expect(new Headers(upstream.mock.calls[1]![1]?.headers).get('cookie')).toBe(
      '__Host-doji_employee_login=' + token,
    );
    await proxy.handle(request('/api/session', { cookie: local }));
    expect(new Headers(upstream.mock.calls[2]![1]?.headers).get('cookie')).toBe(
      '__Host-doji_employee=' + token,
    );
    await proxy.handle(request());
    expect(new Headers(upstream.mock.calls[3]![1]?.headers).has('cookie')).toBe(false);
    proxy.dispose();
    await proxy.handle(request('/api/session', { cookie: local }));
    expect(new Headers(upstream.mock.calls[4]![1]?.headers).has('cookie')).toBe(false);
  });
  it('does not follow redirects, return provider HTML or retry an uncertain write', async () => {
    for (const reply of [
      async () =>
        new Response(null, { status: 302, headers: { location: 'https://admin.dojipro.com' } }),
      async () => new Response('<html>gateway failure</html>'),
      async () => {
        throw Error('synthetic secret must not escape');
      },
    ]) {
      const { proxy, upstream } = fixture(reply);
      const result = await proxy.handle(request('/api/rpc'));
      expect(result.status).toBe(503);
      expect(await result.text()).not.toContain('synthetic secret');
      expect(upstream).toHaveBeenCalledTimes(1);
    }
  });
  it('rejects unexpected cookies and bounds response bodies', async () => {
    const { proxy } = fixture(async () => json({}, ['other=secret; Path=/']));
    expect((await proxy.handle(request())).status).toBe(503);
    const large = fixture(async () => json('a'.repeat(2 * 1024 * 1024)));
    expect((await large.proxy.handle(request())).status).toBe(413);
  });
  it('rejects duplicate local cookies and expires jars without network polling', async () => {
    let now = 0;
    const upstream = vi.fn<typeof fetch>(async () => json({}, [cookie()]));
    const proxy = createLocalStagingProxy(upstream, () => now);
    const result = await proxy.handle(request('/auth/start'));
    const local = result.headers.get('set-cookie')!.split(';')[0]!;
    expect(
      (await proxy.handle(request('/api/session', { cookie: `${local}; ${local}` }))).status,
    ).toBe(403);
    now = 28800001;
    await proxy.handle(request('/api/session', { cookie: local }));
    expect(new Headers(upstream.mock.calls.at(-1)?.[1]?.headers).has('cookie')).toBe(false);
  });
});
it('browser adapter only maps the five staging protocol routes to the fixed loopback origin', async () => {
  const upstream = vi.fn<typeof fetch>(async () => json({}));
  expect(() => localStagingFetch('https://admin.dojipro.com', upstream)).toThrow();
  const local = localStagingFetch(localAdminOrigin, upstream);
  for (const url of [
    'https://admin.dojipro.com/api/session',
    employeeStagingOrigin + '/api/session?q=x',
    employeeStagingOrigin + '/api/unknown',
  ])
    expect(() => local(url, {})).toThrow();
  await local(employeeStagingOrigin + '/api/session', {});
  expect(upstream.mock.calls[0]?.[0]).toBe(localAdminOrigin + '/api/session');
});
