// OFFLINE component package only. No provider, cloud CLI, credentials or deployment.
// Not a replacement for a fresh production baseline and gated acceptance release.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from '../infra/doji-orchestrator/node_modules/esbuild/lib/main.js';
import { runtimeSourceClosure } from './business-runtime-source-closure.mts';

assert.equal(
  process.argv.length,
  2,
  'This offline packager accepts no target or deployment arguments',
);
const root = resolve(import.meta.dirname, '..');
const outputParent = resolve(root, 'test-results');
await mkdir(outputParent, { recursive: true });
const output = await mkdtemp(resolve(outputParent, 'business-owned-candidate-'));
const files: Record<string, string> = {};
async function put(path: string, contents: string | Uint8Array) {
  assert.ok(/^[a-zA-Z0-9_./-]+$/.test(path) && !path.split('/').includes('..'));
  assert.ok(!path.startsWith('/') && !Object.hasOwn(files, path));
  const target = resolve(output, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents, { flag: 'wx' });
  files[path] = createHash('sha256').update(contents).digest('hex');
}
async function copy(from: string, to: string) {
  await put(to, await readFile(resolve(root, from)));
}
const closure = await runtimeSourceClosure(
  resolve(root, 'infra/portal-identity'),
  'business-runtime.mts',
);
const edge = 'edge/supabase/functions/business-portal-v2';
for (const file of [...closure].sort()) {
  assert.match(file, /^[a-z0-9-]+\.mts$/);
  await copy(`infra/portal-identity/${file}`, `${edge}/runtime/${file}`);
}
assert.ok(
  closure.has('business-owned-runtime.mts') && closure.has('business-owned-reset-events.mts'),
);
const entry = await readFile(
  resolve(root, 'supabase/functions/business-portal-v2/index.ts'),
  'utf8',
);
assert.equal(entry.split('../../../infra/portal-identity/').length, 2);
assert.ok(entry.includes("Deno.env.get('BUSINESS_OWNED_AUTH_ENABLED')"));
await put(
  `${edge}/index.ts`,
  entry.replace('../../../infra/portal-identity/', './runtime/'),
);
await copy('supabase/functions/business-portal-v2/deno.json', `${edge}/deno.json`);

// Bundle-check the edge entry without downloading dependencies or running Deno.
// Deno/provider acceptance is a separate gate; this proves only import/bundle closure.
await build({
  entryPoints: [resolve(output, `${edge}/index.ts`)],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  external: ['node:*', 'pg', 'jose'],
  logLevel: 'silent',
});
const worker = await build({
  entryPoints: [resolve(root, 'infra/portal-identity/business-pages-worker.mts')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  external: ['node:*'],
  logLevel: 'silent',
});
assert.equal(worker.outputFiles.length, 1);
await put('pages-components/_worker.js', worker.outputFiles[0]!.contents);

// Frontend assets are inputs to the approved Pages merger, not a standalone release.
const dist = resolve(root, 'web/apps/business/dist');
const html = await readFile(resolve(dist, 'index.html'), 'utf8');
assert.match(html, /name="referrer" content="no-referrer"/);
assert.doesNotMatch(html, /DOJI_REACT_BUSINESS_CONFIG\s*=/);
await put('frontend/index.html', html);
let gzipBytes = 0;
let passwordStrengthGzipBytes = 0;
let passwordStrengthChunks = 0;
for (const file of (await readdir(resolve(dist, 'assets'))).sort()) {
  assert.match(file, /^[A-Za-z0-9_.-]+\.(js|css|svg|png|woff2?)$/);
  const bytes = await readFile(resolve(dist, 'assets', file));
  if (file.endsWith('.js')) {
    const compressed = gzipSync(bytes).length;
    gzipBytes += compressed;
    // The separately lazy-loaded, local-only estimator includes full dictionaries.
    // Preserve the existing budget for every other business chunk.
    if (/^password-strength-[A-Za-z0-9_-]+\.js$/.test(file)) {
      passwordStrengthGzipBytes += compressed;
      passwordStrengthChunks++;
    }
  }
  await put(`frontend/assets/${file}`, bytes);
}
assert.ok(gzipBytes > 0 && gzipBytes - passwordStrengthGzipBytes <= 200 * 1024, 'Business JavaScript budget exceeded');
assert.ok(passwordStrengthChunks <= 1 && passwordStrengthGzipBytes <= 900 * 1024,
  'Lazy password estimator budget exceeded');
for (const file of [
  'business_owned_auth_guard_v1.sql',
  'business_owned_recovery_email_v1.sql',
  'business_owned_recovery_email_v1.rollback.sql',
  'business_owned_auth_guard_v1.rollback.sql',
  'business_owned_reset_links_v1.sql',
  'business_owned_reset_links_v1.rollback.sql',
  'business_owned_store_v1.sql',
  'business_owned_acceptance_v1.sql',
  'business_owned_acceptance_v1.rollback.sql',
  'business_owned_cutover_v1.sql',
  'business_owned_cutover_v1.rollback.sql',
])
  await copy(`supabase/overlays/${file}`, `sql/${file}`);
await copy('docs/releases/BUSINESS_OWNED_AUTH_CUTOVER_2026-10-10.md', 'RUNBOOK.md');
await put(
  'GATES.json',
  JSON.stringify(
    {
      status: 'local-components-only',
      deployable: false,
      productionBaselineVerified: false,
      providerAcceptanceVerified: false,
      BUSINESS_OWNED_AUTH_ENABLED: false,
      ownedAuthEnabled: false,
      sendingEnabled: false,
      signupEnabled: false,
      databaseGuardEnabled: false,
    },
    null,
    2,
  ) + '\n',
);
await put(
  'README.txt',
  'Offline candidate components, not a deployable site. No credentials included.\n' +
    'Do not deploy frontend/ or pages-components/ directly. Preserve the verified live Pages headers, legal pages and config.\n' +
    'All gates remain closed. Follow RUNBOOK.md; no production or provider acceptance is asserted.\n',
);
await writeFile(
  resolve(output, 'manifest.json'),
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      status: 'local-components-only',
      gzipBytes,
      passwordStrengthGzipBytes,
      runtimeFiles: closure.size,
      files,
    },
    null,
    2,
  ) + '\n',
  { flag: 'wx' },
);
for (const [file, expected] of Object.entries(files))
  assert.equal(
    createHash('sha256')
      .update(await readFile(resolve(output, file)))
      .digest('hex'),
    expected,
  );
console.log(
  JSON.stringify(
    {
      package: relative(root, output).replaceAll('\\', '/'),
      files: Object.keys(files).length,
      runtimeFiles: closure.size,
      gzipBytes,
      verified: true,
      deployed: false,
      providerCalls: 0,
    },
    null,
    2,
  ),
);
