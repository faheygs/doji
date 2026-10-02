import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmployeeProxy,
  createEmployeeEdgeIngress,
} from '../infra/portal-identity-candidate/employee-proxy.mjs';
const config = {
  enabled: true,
  origin: 'https://admin.dojipro.com',
  endpoint: 'https://abcdefghijklmnopqrst.supabase.co/functions/v1/employee-portal-v2',
  proxyKey: 'ab'.repeat(32),
};
const request = (path = '/auth/start', patch = {}) =>
  new Request(config.origin + path, {
    method: 'POST',
    headers: {
      origin: config.origin,
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
      'cf-connecting-ip': '192.0.2.3',
      cookie: '__Host-doji_employee=opaque',
      'x-doji-csrf': 'csrf',
      authorization: 'Bearer MUST-NOT-FORWARD',
      'x-doji-client-ip': 'forged',
      'x-doji-portal-proxy-key': 'forged',
    },
    body: '{"email":"synthetic@example.test"}',
    ...patch,
  });
test('same-origin proxy forwards only reviewed headers and trusted edge IP', async () => {
  let seen;
  const ingress = createEmployeeEdgeIngress(config, async (req, ip) => {
    seen = { url: req.url, ip, headers: req.headers, body: await req.json() };
    const headers = new Headers({
      'set-cookie': '__Host-doji_employee=x; Secure; HttpOnly; Path=/',
      'access-control-allow-origin': '*',
      'x-provider-secret': 'no',
    });
    return new Response('{"ok":true}', { headers });
  });
  const proxy = createEmployeeProxy(config, (url, options) => ingress(new Request(url, options)));
  const r = await proxy(request());
  assert.equal(r.status, 200);
  assert.equal(seen.url, config.origin + '/auth/start');
  assert.equal(seen.ip, '192.0.2.3');
  assert.equal(seen.headers.has('authorization'), false);
  assert.equal(seen.headers.has('x-doji-portal-proxy-key'), false);
  assert.equal(seen.headers.get('cookie'), '__Host-doji_employee=opaque');
  assert.equal(seen.headers.get('x-doji-csrf'), 'csrf');
  assert.equal(r.headers.getSetCookie().length, 1);
  assert.equal(r.headers.has('x-provider-secret'), false);
  assert.equal(r.headers.has('access-control-allow-origin'), false);
});
for (const [path, patch, status] of [
  ['/auth/start', { headers: { origin: 'https://attacker.test' } }, 403],
  ['/auth/start', { headers: { origin: config.origin, 'sec-fetch-site': 'cross-site' } }, 403],
  ['/auth/start?redirect=evil', {}, 404],
  ['/auth/start', { method: 'PUT' }, 404],
  ['/api/sql', {}, 404],
  ['/auth/start', { body: 'x'.repeat(17000) }, 413],
])
  test(`proxy rejects ${path} ${status} ${JSON.stringify(patch).slice(0, 90)}`, async () => {
    const proxy = createEmployeeProxy(config, () => assert.fail('no upstream call'));
    assert.equal((await proxy(request(path, patch))).status, status);
  });
test('direct edge request without exact server secret cannot reach application', async () => {
  const edge = createEmployeeEdgeIngress(config, () => assert.fail('no application call'));
  for (const key of ['', 'cd'.repeat(32), 'é'.repeat(64)]) {
    const r = await edge(
      new Request(config.endpoint + '/api/session', {
        headers: { 'x-doji-portal-proxy-key': key },
      }),
    );
    assert.ok([403, 503].includes(r.status));
  }
});

test('Supabase gateway function-name routing preserves strict origin and route checks', async () => {
  let count = 0;
  const edge = createEmployeeEdgeIngress(config, req => {
    count++; assert.equal(req.url, config.origin + '/api/session');
    return new Response(null, {status: 401});
  });
  for(const [url,status] of [
    [new URL(config.endpoint).origin+'/employee-portal-v2/api/session',401],
    [new URL(config.endpoint).origin.replace('https:','http:')+'/employee-portal-v2/api/session',401],
    [config.endpoint.replace('https:','http:')+'/api/session',404],
    ['https://attacker.test/employee-portal-v2/api/session',404],
    [new URL(config.endpoint).origin+'/other/employee-portal-v2/api/session',404],
    [new URL(config.endpoint).origin+'/employee-portal-v2/api/sql',404],
  ]) assert.equal((await edge(new Request(url,{headers:{'x-doji-portal-proxy-key':config.proxyKey}}))).status,status);
  assert.equal(count,2);
});
test('disabled deployment makes no upstream or application calls', async () => {
  const proxy = createEmployeeProxy({ ...config, enabled: false }, () => assert.fail());
  const edge = createEmployeeEdgeIngress({ ...config, enabled: false }, () => assert.fail());
  assert.equal((await proxy(request())).status, 503);
  assert.equal((await edge(request())).status, 503);
});

test('redirect is rejected without following it or forwarding its cookies', async () => {
  let calls=0;
  const proxy=createEmployeeProxy(config,async(url,options)=>{
    calls++;assert.equal(options.redirect,'manual');
    return new Response(null,{status:302,headers:{location:'https://attacker.test','set-cookie':'bad=value'}});
  });
  const r=await proxy(request());assert.equal(r.status,503);assert.equal(calls,1);
  assert.equal(r.headers.has('location'),false);assert.equal(r.headers.has('set-cookie'),false);
});
test('same-origin session GET works without exposing tokens', async () => {
  const edge = createEmployeeEdgeIngress(config, async (req) => {
    assert.equal(req.method, 'GET');
    return Response.json({ signedIn: false });
  });
  const proxy = createEmployeeProxy(config, (url, options) => edge(new Request(url, options)));
  const r = await proxy(
    request('/api/session', {
      method: 'GET',
      body: undefined,
      headers: { 'sec-fetch-site': 'same-origin', 'cf-connecting-ip': '192.0.2.1' },
    }),
  );
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { signedIn: false });
});
