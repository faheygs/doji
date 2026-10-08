// Local artifact checks only: no credentials, network, deployment or account creation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildBusinessIdentity } from '../website/build-business-identity.mts';
const root = resolve(import.meta.dirname, '..');
const config = {
  enabled: true,
  origin: 'https://business.dojipro.com',
  turnstileSiteKey: 'synthetic-site-key',
  termsUrl: 'https://business.dojipro.com/business-terms/',
  privacyUrl: 'https://business.dojipro.com/business-privacy/',
  termsVersion: 'business-terms-20260930-v1',
  privacyVersion: 'business-privacy-20260930-v1',
};
test('artifact rejects broad output paths and unapproved public configuration before writing', async () => {
  for (const output of [
    root,
    resolve(root, 'website'),
    resolve(root, '../outside-business-artifact'),
  ])
    await assert.rejects(buildBusinessIdentity(output, config), /Dedicated local/);
  for (const patch of [
    { origin: 'https://admin.dojipro.com' },
    { termsUrl: 'https://evil.invalid/' },
    { privacyVersion: 'unapproved' },
    { turnstileSiteKey: '<script>' },
  ])
    await assert.rejects(
      buildBusinessIdentity(resolve(root, 'test-results/business-identity-invalid'), {
        ...config,
        ...patch,
      }),
      /Exact approved/,
    );
});
test('isolated package contains no password form, public database key, sample workspace or employee artifact', async () => {
  const output = resolve(root, 'test-results/business-identity-artifact');
  const callerConfig = { ...config, apiKey: 'synthetic-secret-must-not-serialize' };
  await buildBusinessIdentity(output, callerConfig);
  const read = (path: string) => readFile(resolve(output, path), 'utf8');
  const publicConfig = await read('business-portal/config.js');
  assert.doesNotMatch(publicConfig, /apiKey|supabase|anonKey|synthetic-secret/);
  for (const page of ['access', 'application']) {
    const html = await read(`business-portal/${page}/index.html`);
    assert.doesNotMatch(html, /type="password"|businessAccessForm/);
    assert.match(html, /business-portal\/config\.js/);
    const bundle = await read(`business-portal/${page}/${page}.js`);
    assert.doesNotMatch(
      bundle,
      /\/auth\/v1\/token|sb_secret_|SUPABASE_SERVICE_ROLE_KEY|localStorage\.setItem/,
    );
  }
  const names = await readdir(output);
  assert.match(
    await read('business-portal/access/index.html'),
    /id="identityEmail"[^>]*type="email"/,
  );
  assert.match(await read('business-portal/access/access.css'), /\.identityMain/);
  const access = await read('business-portal/access/index.html');
  assert.match(access, /id="businessAccountAccess"/);
  assert.match(access, /id="businessMain" hidden/);
  assert.equal((access.match(/id="businessSignout"/g) || []).length, 1);
  assert.equal((access.match(/type="module"/g) || []).length, 1);
  assert.doesNotMatch(access, /src="[^\"]*application\/application\.js"/);
  assert.ok(!names.includes('admin-portal') && !names.includes('employee-setup'));
  assert.deepEqual(JSON.parse(await read('_routes.json')), {
    version: 1,
    include: ['/auth/*', '/api/*'],
    exclude: [],
  });
  const worker = await read('_worker.js');
  assert.doesNotMatch(worker, /employee-portal-v2|EMPLOYEE_V2_|synthetic-secret/);
  assert.match(worker, /BUSINESS_V2_PROXY_KEY/);
  assert.match(await read('_headers'), /connect-src 'self' https:\/\/challenges.cloudflare.com;/);
  assert.doesNotMatch(await read('_redirects'), /^\/ /m);
  const home = await read('index.html');
  assert.match(home, /https:\/\/business.dojipro.com\//);
  assert.match(home, /mode=signin/);
  assert.match(home, /mode=register/);
  assert.doesNotMatch(home, /<script|<form|localStorage|supabase/i);
  assert.match(await read('robots.txt'), /Disallow: \/business-portal\//);
});
