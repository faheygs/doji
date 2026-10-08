// Tests the real locally installed Workers runtime, never a hosted Worker.
import assert from 'node:assert/strict';
import {
  Miniflare,
  convertV4MiniflareOptions,
} from '../infra/doji-orchestrator/node_modules/miniflare/dist/src/index.js';
import { build } from '../infra/doji-orchestrator/node_modules/esbuild/lib/main.js';
const bundle = await build({
  entryPoints: ['scripts/fixtures/business-cloudflare-runtime.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  external: ['node:*'],
});
const script = bundle.outputFiles[0]?.text;
assert.ok(script);
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script,
    compatibilityDate: '2026-08-11',
    compatibilityFlags: process.argv.includes('--without-request-signal')
      ? ['nodejs_compat']
      : ['nodejs_compat', 'enable_request_signal'],
    host: '127.0.0.1',
  }),
);
try {
  const response = await runtime.dispatchFetch(
    'https://business.dojipro.com/auth/callback?code=synthetic&state=synthetic',
    {
      headers: {
        'sec-fetch-site': 'cross-site',
        authorization: 'Bearer synthetic-employee',
        'x-region': 'us-west-2',
      },
    },
  );
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(result, {
    status: 303,
    location: 'https://business.dojipro.com/business-portal/application/',
    cookies: [
      '__Host-doji_business=' +
        'x'.repeat(43) +
        '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800',
    ],
    calls: 1,
  });
  const denied = await runtime.dispatchFetch('https://business.dojipro.com/api/session', {
    headers: { origin: 'https://admin.dojipro.com' },
  });
  const denial = await denied.json();
  assert.deepEqual(denial, { status: 403, location: null, cookies: [], calls: 0 });
  console.log(
    'PASS: real local workerd preserves business callback, secure cookies and cross-realm denial; no provider/database requests.',
  );
} finally {
  await runtime.dispose();
}
