import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { reserveOutput } from './build-admin-staging.mts';

export const stagingFunctions = Object.freeze([
  'orchestrate-doji',
  'schedule-daily-challenge',
  'run-data-maintenance',
  'operational-health',
  'relay-domain-events',
  'fanout-doji-push',
  'realtime-token',
]);

// Separate artifact: ordinary backend packaging must not redeploy local impersonation.
export async function buildAdminDevelopmentEdge(output: string) {
  const target = await reserveOutput(output);
  const { build } = await import('../infra/doji-orchestrator/node_modules/esbuild/lib/main.js');
  const result = await build({
    absWorkingDir: resolve(import.meta.dirname, '..'),
    entryPoints: ['supabase/functions/admin-development/index.ts'],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'esnext',
    external: ['npm:pg@8.16.3', 'npm:ably@2.26.0'],
    write: false,
    metafile: true,
  });
  assert.equal(result.outputFiles.length, 1);
  const code = result.outputFiles[0]!.text;
  assert.ok(code.includes('ADMIN_DEVELOPMENT_RESOURCES_ENABLED'));
  const functions = join(target, 'supabase/functions/admin-development');
  await mkdir(functions, { recursive: true });
  await writeFile(join(functions, 'index.ts'), code, { flag: 'wx' });
  await writeFile(
    join(target, 'supabase/config.toml'),
    'project_id = "doji-staging-development"\n[functions.admin-development]\nverify_jwt = false\n',
    { flag: 'wx' },
  );
  await writeFile(
    join(target, 'manifest.json'),
    JSON.stringify(
      {
        projectRef: 'ohrcupagdoilkwhecict',
        function: 'admin-development',
        sha256: createHash('sha256').update(code).digest('hex'),
        inputs: Object.keys(result.metafile.inputs).sort(),
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
  return target;
}

export async function buildStagingEdge(output: string) {
  const target = await reserveOutput(output);
  const source = resolve(import.meta.dirname, '../supabase/functions');
  const functions = join(target, 'supabase/functions');
  await mkdir(functions, { recursive: true });
  await cp(join(source, '_shared'), join(functions, '_shared'), { recursive: true });
  await cp(join(source, 'deno.d.ts'), join(functions, 'deno.d.ts'));
  const hashes: Record<string, string> = {};
  for (const name of stagingFunctions) {
    const handler = await readFile(join(source, name, 'index.ts'), 'utf8');
    hashes[name] = createHash('sha256').update(handler).digest('hex');
    await mkdir(join(functions, name));
    for (const file of await readdir(join(source, name))) {
      if (file === 'index.ts') continue;
      assert.match(file, /^[\w-]+\.ts$/, 'Unexpected function dependency.');
      await cp(join(source, name, file), join(functions, name, file));
    }
    await writeFile(join(functions, name, 'handler.ts'), handler, { flag: 'wx' });
    await writeFile(
      join(functions, name, 'index.ts'),
      `import { stagingFetch } from '../_shared/staging-egress.ts';
globalThis.fetch = stagingFetch({
  projectUrl: Deno.env.get('SUPABASE_URL'),
  orchestratorUrl: Deno.env.get('DOJI_ORCHESTRATOR_URL'),
  ablyKey: Deno.env.get('ABLY_API_KEY'),
}, globalThis.fetch);
await import('./handler.ts');
`,
      { flag: 'wx' },
    );
  }
  await writeFile(
    join(target, 'supabase/config.toml'),
    'project_id = "doji-staging-backend"\n\n' +
      stagingFunctions.map((name) => `[functions.${name}]\nverify_jwt = false\n`).join('\n'),
    { flag: 'wx' },
  );
  await writeFile(
    join(target, 'manifest.json'),
    JSON.stringify(
      {
        projectRef: 'ohrcupagdoilkwhecict',
        functions: hashes,
        egressSha256: createHash('sha256')
          .update(await readFile(join(source, '_shared/staging-egress.ts')))
          .digest('hex'),
        realDelivery: 'denied',
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.versions.node.split('.')[0], '24', 'Node 24 is required.');
  assert.equal(
    process.argv.length,
    3,
    'Usage: node scripts/build-staging-edge.mts <new absolute directory outside repo>',
  );
  console.log(await buildStagingEdge(process.argv[2]!));
}
