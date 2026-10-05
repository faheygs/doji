// Real local workerd, synthetic data, no provider or database access.
import assert from 'node:assert/strict';
import {
  Miniflare,
  convertV4MiniflareOptions,
} from '../infra/doji-orchestrator/node_modules/miniflare/dist/src/index.js';
import { build } from '../infra/doji-orchestrator/node_modules/esbuild/lib/main.js';
const bundled = await build({
  entryPoints: ['scripts/fixtures/employee-cloudflare-runtime.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  external: ['node:*'],
});
const script = bundled.outputFiles[0]?.text;
assert.ok(script, 'Missing synthetic Worker bundle');
for (const flags of [['nodejs_compat'], ['nodejs_compat', 'enable_request_signal']]) {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script,
      compatibilityDate: '2026-08-11',
      compatibilityFlags: flags,
      host: '127.0.0.1',
    }),
  );
  try {
    const r = await mf.dispatchFetch('https://admin.dojipro.com/api/session', {
      headers: { origin: 'https://admin.dojipro.com', 'cf-connecting-ip': '192.0.2.1' },
    });
    const result: unknown = await r.json();
    assert.ok(result && typeof result === 'object' && 'status' in result && 'cookies' in result);
    console.log(JSON.stringify({ flags, ...result }));
    if (flags.includes('enable_request_signal')) {
      assert.equal(result.status, 401);
      assert.ok(typeof result.cookies === 'string' && result.cookies.includes('HttpOnly'));
    }
  } finally {
    await mf.dispose();
  }
}
