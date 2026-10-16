import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildAdminStaging, inventory, reserveOutput } from './build-admin-staging.mts';
import { targets } from './admin-release-policy.mts';

export async function buildAdminRelease(output: string, sourceSha: string) {
  assert.match(sourceSha, /^[a-f0-9]{40}$/);
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceSha);
  assert.equal(
    execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
    '',
    'Release packages require a clean, reviewed checkout.',
  );
  const root = await reserveOutput(output);
  await buildAdminStaging(join(root, 'staging'), sourceSha);
  const { build } = await import('../infra/doji-orchestrator/node_modules/esbuild/lib/main.js');
  const worker = await build({
    entryPoints: [resolve('infra/portal-identity/employee-production-pages-worker.mts')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    external: ['node:*'],
  });
  assert.ok(worker.outputFiles[0]);
  await assembleAdminRelease(root, sourceSha, worker.outputFiles[0].text);
  console.log('Both admin packages built from the same frontend assets. No deployment performed.');
}
export async function assembleAdminRelease(
  root: string,
  sourceSha: string,
  productionWorker: string,
) {
  assert.match(sourceSha, /^[a-f0-9]{40}$/);
  await mkdir(join(root, 'production'));
  const site = join(root, 'production/site');
  await cp(join(root, 'staging/site'), site, { recursive: true, errorOnExist: true, force: false });
  await writeFile(join(site, '_worker.js'), productionWorker);
  await writeFile(join(site, '_headers'), targets.production.headers);
  await writeFile(
    join(site, 'react-admin-config.js'),
    `window.DOJI_REACT_ADMIN_CONFIG = Object.freeze(${JSON.stringify(targets.production.flags)});\n`,
  );
  for (const name of ['index.html', 'connected.html'])
    await writeFile(
      join(site, name),
      (await readFile(join(site, name), 'utf8')).replace(
        '<title>Doji Admin · Staging</title>',
        '<title>Doji Admin</title>',
      ),
    );
  for (const target of ['staging', 'production'] as const) {
    const directory = join(root, target, 'site');
    await writeFile(
      join(directory, '_redirects'),
      '/employee-setup/* / 302\n/admin-portal/ / 302\n/admin-portal/index.html / 302\n',
    );
    await writeFile(join(directory, 'release.json'), JSON.stringify({ sourceSha, target }) + '\n');
    await writeFile(
      join(root, target, 'manifest.json'),
      JSON.stringify(
        {
          sourceSha,
          target,
          ...targets[target],
          assets: await inventory(directory),
        },
        null,
        2,
      ) + '\n',
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(
    process.argv.length,
    4,
    'Usage: build-admin-release.mts <new absolute directory> <commit SHA>',
  );
  await buildAdminRelease(process.argv[2]!, process.argv[3]!);
}
