// Existing local Edge image only, no network, host ports, secrets or real accounts.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, copyFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { build } from '../infra/doji-orchestrator/node_modules/esbuild/lib/main.js';
const podman = 'C:/Program Files/RedHat/Podman/podman.exe';
const run = (args: string[]) =>
  execFileSync(podman, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20000,
  });
run(['image', 'exists', 'public.ecr.aws/supabase/edge-runtime:v1.74.3']);
await mkdir('test-results', { recursive: true });
const folder = await mkdtemp('test-results/business-edge-runtime-');
const cache = resolve('test-results/employee-edge-dependency-cache');
await mkdir(cache, { recursive: true });
await mkdir(`${folder}/main`);
await mkdir(`${folder}/worker`);
await copyFile('scripts/fixtures/business-runtime/main.ts', `${folder}/main/index.ts`);
await build({
  entryPoints: ['scripts/fixtures/business-runtime/worker.ts'],
  outfile: `${folder}/worker/index.ts`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'es2022',
  define: { global: 'globalThis' },
  external: ['pg-native'],
  // esbuild flattens pg's CommonJS dependency scopes; restore the Node globals
  // Deno normally supplies to npm modules (same packaging as the employee probe).
  banner: {
    js: "import { createRequire as dojiCreateRequire } from 'node:module'; import {Buffer as dojiBuffer} from 'node:buffer'; import dojiProcess from 'node:process'; globalThis.Buffer ??= dojiBuffer; globalThis.process ??= dojiProcess; const require = dojiCreateRequire(import.meta.url);",
  },
});
const name = `doji-business-runtime-${process.pid}-${Date.now()}`;
let created = false;
try {
  run([
    'run',
    '--detach',
    '--pull=never',
    '--name',
    name,
    '--network',
    'none',
    '--env',
    'DENO_DIR=/cache',
    '--volume',
    `${cache.replaceAll('\\', '/')}:/cache:rw`,
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
  for (let attempt = 0; attempt < 30; attempt++) {
    const read = spawnSync(podman, ['logs', name], { encoding: 'utf8', timeout: 5000 });
    logs = (read.stdout || '') + (read.stderr || '');
    if (logs.includes('BUSINESS_RUNTIME_RESULT ')) break;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });
  }
  await writeFile(`${folder}/runtime.log`, logs);
  const line = logs.split('\n').find((value) => value.includes('BUSINESS_RUNTIME_RESULT '));
  assert.ok(line, `Inspect retained local runtime evidence ${folder}`);
  const result = JSON.parse(
    line.slice(line.indexOf('BUSINESS_RUNTIME_RESULT ') + 'BUSINESS_RUNTIME_RESULT '.length),
  );
  await writeFile(
    `${folder}/result.json`,
    JSON.stringify({ at: new Date().toISOString(), network: 'none', result }, null, 2),
  );
  console.log(JSON.stringify({ evidence: folder, ...result }));
  assert.equal(result.status, 200);
  assert.equal(result.body.passed, true);
} finally {
  if (created) {
    run(['stop', '--time', '1', name]);
    run(['rm', name]);
  }
}
