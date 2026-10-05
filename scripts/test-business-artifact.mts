// Builds local artifacts only, with synthetic public configuration. No deployment.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const dir = resolve('website/.business-dist');
const read = (file: string) => readFileSync(`${dir}/${file}`, 'utf8');
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('DOJI_BUSINESS_')),
);
const run = (extra: NodeJS.ProcessEnv = {}) =>
  execFileSync(process.execPath, ['website/build-business.mts'], {
    env: { ...cleanEnv, ...extra },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const config = (): Record<string, unknown> => {
  const match = read('business-portal/config.js').match(/Object.freeze\((.*)\);/);
  assert.ok(match?.[1], 'Expected one frozen browser configuration');
  const parsed: unknown = JSON.parse(match[1]);
  assert.ok(parsed && typeof parsed === 'object' && !Array.isArray(parsed));
  return Object.fromEntries(Object.entries(parsed));
};
const enabled = {
  DOJI_BUSINESS_ENABLED: 'true',
  DOJI_BUSINESS_SUPABASE_URL: 'https://business-test.supabase.co',
  DOJI_BUSINESS_ANON_KEY: 'sb_publishable_synthetic-only',
  DOJI_BUSINESS_TURNSTILE_SITE_KEY: 'synthetic-business-sitekey',
  DOJI_BUSINESS_TERMS_URL: 'https://example.test/business-terms',
  DOJI_BUSINESS_PRIVACY_URL: 'https://example.test/business-privacy',
  DOJI_BUSINESS_TERMS_VERSION: 'test-terms',
  DOJI_BUSINESS_PRIVACY_VERSION: 'test-privacy',
};
let count = 0;
const check = (label: string, fn: () => void) => {
  fn();
  count++;
  console.log(`PASS: ${label}`);
};
try {
  run();
  check('business artifact is default off with no credentials', () =>
    assert.deepEqual(config(), { enabled: false, publicAdmission: false, realtimeEnabled: false }),
  );
  for (const field of [
    'DOJI_BUSINESS_TERMS_VERSION',
    'DOJI_BUSINESS_PRIVACY_URL',
    'DOJI_BUSINESS_TURNSTILE_SITE_KEY',
  ])
    check(`enabled artifact requires ${field}`, () =>
      assert.throws(() => run({ ...enabled, [field]: '' })),
    );
  check('service key rejected at build time', () =>
    assert.throws(() => run({ ...enabled, DOJI_BUSINESS_ANON_KEY: 'sb_secret_never-public' })),
  );
  run(enabled);
  check('configured artifact is public not allowlisted, realtime remains off', () => {
    assert.equal(config().publicAdmission, true);
    assert.equal(config().realtimeEnabled, false);
  });
  check('both entry pages load one public configuration before runtime', () => {
    for (const page of ['access', 'application']) {
      const html = read(`business-portal/${page}/index.html`);
      assert.equal(html.match(/src="\/business-portal\/config.js"/g)?.length, 1);
      assert.ok(html.indexOf('/business-portal/config.js') < html.indexOf('/portal-select.js'));
      assert.ok(html.includes('https://dojipro.com/business/'));
    }
  });
  check('artifact excludes admin, sample/localStorage workspace and private test data', () => {
    for (const path of [
      'admin-portal',
      'test-results',
      'business-portal/index.html',
      'business-portal/e2e',
      '.env.local',
    ])
      assert.equal(existsSync(`${dir}/${path}`), false);
    assert.deepEqual(
      readdirSync(dir).sort(),
      [
        '_headers',
        '_redirects',
        'assets',
        'business-portal',
        'business-terms',
        'business-privacy',
        'portal-select.js',
        'portal.css',
        'portal.js',
        'robots.txt',
        'styles.css',
        'theme-init.js',
      ].sort(),
    );
  });
  check('business-only CSP permits challenge and exact backend, no Ably or broad domains', () => {
    const headers = read('_headers');
    assert.equal(headers.match(/Content-Security-Policy:/g)?.length, 1);
    assert.match(headers, /frame-src https:\/\/challenges.cloudflare.com;/);
    assert.match(
      headers,
      /connect-src 'self' https:\/\/business-test.supabase.co https:\/\/challenges.cloudflare.com;/,
    );
    assert.ok(!headers.includes('ably') && !headers.includes('unsafe-eval'));
    assert.match(headers, /Cache-Control: no-store/);
  });
  check('business root redirects to real application, never demo', () =>
    assert.match(read('_redirects'), /^\/ \/business-portal\/application\/ 302/m),
  );
} finally {
  run();
}
console.log(
  `${count} local business artifact checks passed; final artifact disabled, nothing deployed.`,
);
