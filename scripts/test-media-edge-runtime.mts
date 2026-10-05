// No hosted traffic: real installed Edge runtime, synthetic 100 MiB streams.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, copyFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from '../infra/doji-orchestrator/node_modules/esbuild/lib/main.js';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url),
  podman = 'C:/Program Files/RedHat/Podman/podman.exe';
await mkdir('test-results', { recursive: true });
const folder = await mkdtemp('test-results/media-edge-runtime-');
await mkdir(`${folder}/main`);
await mkdir(`${folder}/worker`);
await copyFile('scripts/fixtures/media-runtime/main.ts', `${folder}/main/index.ts`);
await build({
  entryPoints: ['scripts/fixtures/media-runtime/worker.ts'],
  outfile: `${folder}/worker/index.ts`,
  bundle: true,
  platform: 'neutral',
  format: 'esm',
  target: 'es2022',
  plugins: [
    {
      name: 'pinned-local-noble',
      setup(b) {
        b.onResolve({ filter: /^npm:@noble\/hashes@1\.8\.0\/sha256$/ }, () => ({
          path: require.resolve('@noble/hashes/sha256'),
        }));
      },
    },
  ],
});
const name = `doji-media-runtime-${process.pid}-${Date.now()}`;
assert.match(name, /^doji-media-runtime-\d+-\d+$/);
let created = false;
const run = (args: string[]) =>
  execFileSync(podman, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20000,
  });
try {
  run([
    'run',
    '--detach',
    '--name',
    name,
    '--network',
    'none',
    '--volume',
    `${resolve(folder).replaceAll('\\', '/')}:/verify:ro`,
    'public.ecr.aws/supabase/edge-runtime:v1.74.3',
    'start',
    '--main-service',
    '/verify/main',
    '--policy',
    'oneshot',
  ]);
  created = true;
  let logs = '';
  for (let i = 0; i < 45; i++) {
    const logRun = spawnSync(podman, ['logs', name], { encoding: 'utf8', timeout: 10000 });
    logs = (logRun.stdout || '') + (logRun.stderr || '');
    if (logs.includes('MEDIA_RUNTIME_RESULT ')) break;
    await new Promise<void>((r) => {
      setTimeout(r, 1000);
    });
  }
  const line = logs.split('\n').find((l) => l.includes('MEDIA_RUNTIME_RESULT '));
  await writeFile(`${folder}/runtime.log`, logs);
  assert.ok(line, `Runtime result unavailable; inspect retained test files ${folder}`);
  const result: unknown = JSON.parse(line.slice(line.indexOf('MEDIA_RUNTIME_RESULT ') + 21));
  assert.ok(result && typeof result === 'object' && 'status' in result && 'body' in result);
  assert.ok(
    result.body &&
      typeof result.body === 'object' &&
      'bytesHashed' in result.body &&
      'deleted' in result.body,
  );
  await writeFile(
    `${folder}/result.json`,
    JSON.stringify(
      { at: new Date().toISOString(), limits: { cpuMs: 2000, memoryMiB: 256 }, result },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ evidence: folder, ...result }));
  assert.equal(result.status, 200);
  assert.equal(result.body.bytesHashed, 209715200);
  assert.equal(result.body.deleted, true);
} finally {
  if (created) {
    run(['stop', '--time', '1', name]);
    run(['rm', name]);
  }
}
