// Existing installed runtime, no network, ports, secrets or hosted requests.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, copyFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { build } from '../infra/doji-orchestrator/node_modules/esbuild/lib/main.js';
const podman = 'C:/Program Files/RedHat/Podman/podman.exe';
await mkdir('test-results', { recursive: true });
const folder = await mkdtemp('test-results/employee-edge-runtime-');
const cache = resolve('test-results/employee-edge-dependency-cache');
await mkdir(cache, { recursive: true });
// An explicit one-time pass downloads only public Node compatibility types.
// Auth/database/provider/signing are still synthetic; default runs have no network.
const prime = process.argv.includes('--prime-public-dependencies');
await mkdir(`${folder}/main`);
await mkdir(`${folder}/worker`);
await copyFile('scripts/fixtures/employee-runtime/main.ts', `${folder}/main/index.ts`);
await build({
  entryPoints: ['scripts/fixtures/employee-runtime/worker.ts'],
  outfile: `${folder}/worker/index.ts`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'es2022',
  define: { global: 'globalThis' },
  external: ['pg-native'],
  banner: {
    js: "import { createRequire as dojiCreateRequire } from 'node:module'; import {Buffer as dojiBuffer} from 'node:buffer'; import dojiProcess from 'node:process'; globalThis.Buffer ??= dojiBuffer; globalThis.process ??= dojiProcess; const require = dojiCreateRequire(import.meta.url);",
  },
});
const name = `doji-employee-runtime-${process.pid}-${Date.now()}`;
const run = (args: string[]) =>
  execFileSync(podman, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20000,
  });
let created = false;
try {
  run([
    'run',
    '--detach',
    '--name',
    name,
    '--network',
    prime ? 'bridge' : 'none',
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
  for (let i = 0; i < 30; i++) {
    const r = spawnSync(podman, ['logs', name], { encoding: 'utf8', timeout: 5000 });
    logs = (r.stdout || '') + (r.stderr || '');
    if (logs.includes('EMPLOYEE_RUNTIME_RESULT ')) break;
    await new Promise<void>((r) => {
      setTimeout(r, 500);
    });
  }
  await writeFile(`${folder}/runtime.log`, logs);
  const line = logs.split('\n').find((l) => l.includes('EMPLOYEE_RUNTIME_RESULT '));
  assert.ok(line, `Inspect retained runtime evidence ${folder}`);
  const result: unknown = JSON.parse(line.slice(line.indexOf('EMPLOYEE_RUNTIME_RESULT ') + 24));
  assert.ok(result && typeof result === 'object' && 'status' in result && 'body' in result);
  assert.ok(result.body && typeof result.body === 'object' && 'passed' in result.body);
  await writeFile(
    `${folder}/result.json`,
    JSON.stringify(
      { at: new Date().toISOString(), network: prime ? 'public-dependency-prime' : 'none', result },
      null,
      2,
    ),
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
