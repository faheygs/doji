import test from 'node:test';
import assert from 'node:assert/strict';
import pages from '../infra/portal-identity-candidate/business-pages-worker.mts';
import {
  createBusinessProxy,
  createBusinessEdgeIngress,
} from '../infra/portal-identity-candidate/business-proxy.mts';
const config = {
  enabled: true,
  origin: 'https://business.dojipro.com',
  endpoint: 'https://abcdefghijklmnopqrst.supabase.co/functions/v1/business-portal-v2',
  proxyKey: 'ab'.repeat(32),
};

test('Supabase infrastructure cookie is discarded without losing session status or business cookie', async () => {
  const headers = new Headers({'content-type':'application/json'});
  headers.append('set-cookie','__cf_bm=synthetic; Path=/; Domain=.supabase.co; Secure; HttpOnly');
  headers.append('set-cookie','__Host-doji_business='+'x'.repeat(43)+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800');
  const proxy = createBusinessProxy(config,async()=>new Response('{}',{status:401,headers}));
  const response = await proxy(new Request(config.origin+'/api/session',{headers:{origin:config.origin}}));
  assert.equal(response.status,401);
  assert.deepEqual(response.headers.getSetCookie(),['__Host-doji_business='+'x'.repeat(43)+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800']);
});
test('Pages serves static assets without credentials and fails closed for disabled or invalid API configuration', async () => {
  let assets = 0;
  const env = {
    BUSINESS_V2_ENABLED: 'false',
    BUSINESS_V2_ENDPOINT: config.endpoint,
    BUSINESS_V2_PROXY_KEY: config.proxyKey,
    ASSETS: {
      async fetch() {
        assets++;
        return new Response('static');
      },
    },
  };
  assert.equal(
    await (await pages.fetch(new Request(config.origin + '/business-portal/access/'), env)).text(),
    'static',
  );
  assert.equal(assets, 1);
  assert.equal((await pages.fetch(new Request(config.origin + '/api/session'), env)).status, 503);
  assert.equal(
    (
      await pages.fetch(new Request(config.origin + '/auth/start'), {
        ...env,
        BUSINESS_V2_ENABLED: 'true',
        BUSINESS_V2_ENDPOINT: 'https://evil.invalid',
      })
    ).status,
    503,
  );
  assert.equal(
    (
      await pages.fetch(new Request(config.origin + '/api/unknown'), {
        ...env,
        BUSINESS_V2_ENABLED: 'true',
      })
    ).status,
    404,
  );
  assert.equal(assets, 1);
});
const request = (path = '/auth/start', options: RequestInit = {}) =>
  new Request(config.origin + path, {
    method: 'POST',
    headers: {
      origin: config.origin,
      'content-type': 'application/json',
      'cf-connecting-ip': '192.0.2.4',
    },
    body: '{}',
    ...options,
  });
for (const patch of [
  { origin: 'https://admin.dojipro.com' },
  { endpoint: config.endpoint.replace('business-', 'employee-') },
  { proxyKey: '' },
])
  test('business transport rejects incorrect boundary ' + JSON.stringify(patch), () => {
    assert.throws(() => createBusinessProxy({ ...config, ...patch }));
    assert.throws(() =>
      createBusinessEdgeIngress({ ...config, ...patch }, async () => new Response()),
    );
  });
test('proxy forwards only business credentials and trusted client fields, never pins region', async () => {
  const proxy = createBusinessProxy(config, async (url, init) => {
    assert.equal(url, config.endpoint + '/auth/start');
    const h = new Headers(init.headers);
    assert.equal(h.get('cookie'), '__Host-doji_business=' + 'x'.repeat(43));
    assert.equal(h.get('authorization'), null);
    assert.equal(h.get('x-region'), null);
    assert.equal(h.get('x-doji-portal-proxy-key'), config.proxyKey);
    assert.equal(h.get('x-doji-client-ip'), '192.0.2.4');
    assert.equal(h.get('x-doji-client-country'), null);
    assert.equal(init.redirect, 'manual');
    return Response.json({ ok: true }, { headers: { 'x-secret': 'never-forward' } });
  });
  const r = request();
  r.headers.set('cookie', 'employee=secret; __Host-doji_business=' + 'x'.repeat(43));
  r.headers.set('authorization', 'Bearer wrong-realm');
  r.headers.set('x-region', 'eu-west-1');
  const result = await proxy(r);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('x-secret'), null);
  assert.equal(result.headers.get('cache-control'), 'no-store');
});
test('proxy rejects cross-origin, wrong routes/methods/query before upstream', async () => {
  const proxy = createBusinessProxy(config, async () => {
    throw Error('Must not call');
  });
  for (const [r, status] of [
    [request('/api/rpc'), 404],
    [request('/api/application?token=x'), 404],
    [request('/auth/start', { headers: { origin: 'https://admin.dojipro.com' } }), 403],
    [
      request('/auth/start', {
        headers: { origin: config.origin, 'sec-fetch-site': 'cross-site' },
      }),
      403,
    ],
    [new Request('https://evil.invalid/auth/start', { method: 'POST' }), 404],
    [request('/auth/callback?' + 'x'.repeat(4097), { method: 'GET', body: null }), 404],
  ] as const)
    assert.equal((await proxy(r)).status, status);
  assert.equal((await createBusinessProxy({ ...config, enabled: false })(request())).status, 503);
});
test('same-origin browser reads and signed registration use distinct headers', async () => {
  const proxy = createBusinessProxy(config, async (_url, init) => {
    const h = new Headers(init.headers);
    if (init.method === 'POST') {
      assert.equal(h.get('workos-signature'), 'synthetic-signature');
      assert.equal(h.get('cookie'), null);
      assert.equal(h.get('origin'), null);
    }
    return Response.json({ ok: true });
  });
  assert.equal(
    (
      await proxy(
        request('/api/session', {
          method: 'GET',
          body: null,
          headers: { 'sec-fetch-site': 'same-origin' },
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await proxy(
        request('/auth/workos-registration', {
          headers: {
            'content-type': 'application/json',
            'workos-signature': 'synthetic-signature',
            cookie: 'employee=x',
          },
        }),
      )
    ).status,
    200,
  );
});
test('callback redirects only to exact business pages and only emits business secure cookies', async () => {
  const r = () =>
    request('/auth/callback?code=synthetic&state=synthetic', {
      method: 'GET',
      body: null,
      headers: {},
    });
  const cookie = '__Host-doji_business_login=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
  for (const path of ['/business-portal/application/', '/business-portal/access/?signin=failed']) {
    const result = await createBusinessProxy(
      config,
      async () =>
        new Response(null, {
          status: 303,
          headers: { location: config.origin + path, 'set-cookie': cookie },
        }),
    )(r());
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('set-cookie'), cookie);
  }
  for (const location of [
    'https://evil.invalid/',
    config.origin + '/business-portal/application/?token=secret',
    '',
  ])
    assert.equal(
      (
        await createBusinessProxy(
          config,
          async () => new Response(null, { status: 303, headers: { location } }),
        )(r())
      ).status,
      503,
    );
  for (const value of ['employee=secret', '__Host-doji_business=x; Domain=.dojipro.com'])
    assert.equal(
      (
        await createBusinessProxy(config, async () =>
          Response.json({}, { headers: { 'set-cookie': value } }),
        )(request())
      ).status,
      503,
    );
  assert.equal(
    (await createBusinessProxy(config, async () => new Response(null, { status: 302 }))(request()))
      .status,
    503,
  );
});
test('oversized bodies and upstream failures fail closed without retries', async () => {
  let calls = 0;
  const proxy = createBusinessProxy(config, async () => {
    calls++;
    throw Error('private upstream failure');
  });
  assert.equal((await proxy(request('/auth/start', { body: 'x'.repeat(16385) }))).status, 413);
  assert.equal(calls, 0);
  assert.equal((await proxy(request())).status, 503);
  assert.equal(calls, 1);
});
test('edge requires exact server key and route before reaching business handler', async () => {
  let calls = 0;
  const edge = createBusinessEdgeIngress(config, async (r, client) => {
    calls++;
    assert.equal(new URL(r.url).origin, config.origin);
    assert.equal(r.headers.get('x-doji-portal-proxy-key'), null);
    assert.equal(client.ip, '192.0.2.4');
    return Response.json({ ok: true });
  });
  const headers = { 'x-doji-portal-proxy-key': config.proxyKey, 'x-doji-client-ip': '192.0.2.4' };
  for (const base of [
    config.endpoint,
    'http://abcdefghijklmnopqrst.supabase.co/business-portal-v2',
  ])
    assert.equal(
      (await edge(new Request(base + '/auth/callback?code=x', { headers }))).status,
      200,
    );
  assert.equal(calls, 2);
  for (const key of ['', 'ff'.repeat(32), 'é'.repeat(64)])
    assert.equal(
      (
        await edge(
          new Request(config.endpoint + '/api/session', {
            headers: { 'x-doji-portal-proxy-key': key },
          }),
        )
      ).status,
      403,
    );
  for (const url of [
    config.endpoint + '/api/rpc',
    config.endpoint + '/api/session?x=1',
    'https://evil.invalid/functions/v1/business-portal-v2/api/session',
    'http://abcdefghijklmnopqrst.supabase.co:80/evil/api/session',
  ])
    assert.equal((await edge(new Request(url, { headers }))).status, 404);
  assert.equal(calls, 2);
  assert.equal(
    (
      await createBusinessEdgeIngress(
        { ...config, enabled: false },
        async () => new Response(),
      )(new Request(config.endpoint))
    ).status,
    503,
  );
  assert.equal(
    (
      await createBusinessEdgeIngress(config, async () => {
        throw Error('private');
      })(new Request(config.endpoint + '/api/session', { headers }))
    ).status,
    503,
  );
});
