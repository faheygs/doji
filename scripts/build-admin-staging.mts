import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  employeeSharedStagingClient,
  employeeStagingOrigin,
  employeeStagingProject,
} from '../infra/portal-identity/employee-contracts.mts';

const repository = resolve(import.meta.dirname, '..');
export const stagingFlags = Object.freeze({
  independentEmployeeIdentity: true,
  staffWorkflowEnabled: true,
  staffWorkflowRealtimeEnabled: false,
  businessApplicationsEnabled: true,
  businessPrivacyEnabled: true,
  healthEventsEnabled: false,
  announcementComposeEnabled: true,
  historyReadsEnabled: true,
});
export const stagingHeaders = `/*
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://${employeeStagingProject}.supabase.co; media-src 'self' https://${employeeStagingProject}.supabase.co; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store
`;

export function stagingHtml(source: string, assetPath = 'staging'): string {
  assert.match(assetPath, /^(staging|[a-f0-9]{40})$/);
  assert.match(source, /<head>/);
  assert.ok(source.includes(`/react-admin/${assetPath}/assets/`));
  assert.doesNotMatch(source, /DOJI_REACT_ADMIN_CONFIG/);
  return source
    .replace('<head>', '<head>\n<script src="/react-admin-config.js"></script>')
    .replace(/<title>[^<]*<\/title>/, '<title>Doji Admin · Staging</title>');
}

export async function reserveOutput(output: string): Promise<string> {
  assert.ok(isAbsolute(output), 'Use an absolute, new output directory outside the repository.');
  const target = resolve(await realpath(resolve(output, '..')), basename(output));
  const local = relative(await realpath(repository), target);
  assert.ok(
    local === '..' || local.startsWith('..' + sep) || isAbsolute(local),
    'Staging packages belong outside the repository.',
  );
  // Never remove or overwrite an existing release, worktree, or caller directory.
  await mkdir(target);
  return target;
}

export async function assembleStagingSite(
  candidate: string,
  destination: string,
  worker: string,
  assetPath = 'staging',
) {
  assert.match(assetPath, /^(staging|[a-f0-9]{40})$/);
  await mkdir(destination);
  const files = await readdir(join(candidate, 'assets'));
  assert.ok(files.length > 0, 'Missing connected assets.');
  assert.ok(
    files.every((file) => /^[\w.-]+\.(js|css)$/.test(file)),
    'Unexpected build asset.',
  );
  await mkdir(join(destination, 'react-admin', assetPath), { recursive: true });
  await cp(join(candidate, 'assets'), join(destination, 'react-admin', assetPath, 'assets'), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  const html = stagingHtml(await readFile(join(candidate, 'connected.html'), 'utf8'), assetPath);
  for (const entry of ['index.html', 'connected.html'])
    await writeFile(join(destination, entry), html, { flag: 'wx' });
  await cp(join(candidate, 'doji-icon.png'), join(destination, 'doji-icon.png'));
  // The independent identity callback still serves its retained, non-login page.
  for (const file of [
    'styles.css',
    'portal.css',
    'admin-portal/admin.css',
    'assets/doji-icon.png',
  ]) {
    await mkdir(resolve(destination, file, '..'), { recursive: true });
    await cp(join(repository, 'website', file), join(destination, file));
  }
  await mkdir(join(destination, 'identity'));
  const { readBrowserSource } = await import('../website/browser-source.mts');
  await writeFile(
    join(destination, 'identity/setup-return.js'),
    readBrowserSource('identity/setup-return.js'),
  );
  await writeFile(
    join(destination, 'react-admin-config.js'),
    `window.DOJI_REACT_ADMIN_CONFIG = Object.freeze(${JSON.stringify(stagingFlags)});\n`,
    { flag: 'wx' },
  );
  await writeFile(join(destination, '_headers'), stagingHeaders, { flag: 'wx' });
  await writeFile(join(destination, 'robots.txt'), 'User-agent: *\nDisallow: /\n', { flag: 'wx' });
  await writeFile(join(destination, '_worker.js'), worker, { flag: 'wx' });
}

export async function inventory(
  directory: string,
  prefix = '',
): Promise<{ path: string; sha256: string }[]> {
  const files: { path: string; sha256: string }[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert.ok(!entry.isSymbolicLink(), 'No symlinks in release packages.');
    const path = prefix + entry.name;
    if (entry.isDirectory())
      files.push(...(await inventory(join(directory, entry.name), path + '/')));
    else
      files.push({
        path,
        sha256: createHash('sha256')
          .update(await readFile(join(directory, entry.name)))
          .digest('hex'),
      });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function buildAdminStaging(output: string, sourceSha?: string) {
  if (sourceSha) assert.match(sourceSha, /^[a-f0-9]{40}$/);
  assert.equal(process.versions.node.split('.')[0], '24', 'Node 24 is required.');
  const destination = await reserveOutput(output);
  const scratch = await mkdtemp(join(tmpdir(), 'doji-admin-build-'));
  try {
    const { build: viteBuild } = await import('../web/node_modules/vite/dist/node/index.js');
    const { build: bundle } =
      await import('../infra/doji-orchestrator/node_modules/esbuild/lib/main.js');
    const candidate = join(scratch, 'connected');
    await viteBuild({
      root: join(repository, 'web/apps/admin'),
      configFile: join(repository, 'web/apps/admin/vite.config.ts'),
      envDir: false,
      mode: 'connected',
      base: `/react-admin/${sourceSha ?? 'staging'}/`,
      build: { outDir: candidate, emptyOutDir: false, sourcemap: false },
    });
    execFileSync(
      process.execPath,
      [join(repository, 'web/tests/connected-artifacts.ts'), candidate],
      {
        cwd: join(repository, 'web'),
        stdio: 'inherit',
        timeout: 30000,
      },
    );
    const worker = await bundle({
      entryPoints: [join(repository, 'infra/portal-identity/employee-staging-pages-worker.mts')],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'neutral',
      target: 'es2022',
      external: ['node:*'],
    });
    assert.ok(worker.outputFiles[0]);
    await assembleStagingSite(
      candidate,
      join(destination, 'site'),
      worker.outputFiles[0].text,
      sourceSha ?? 'staging',
    );
    await writeFile(
      join(destination, 'manifest.json'),
      JSON.stringify(
        {
          origin: employeeStagingOrigin,
          pagesProject: 'doji-admin-staging',
          supabaseProject: employeeStagingProject,
          workosClient: employeeSharedStagingClient,
          flags: stagingFlags,
          ...(sourceSha ? { sourceSha } : {}),
          assets: await inventory(join(destination, 'site')),
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx' },
    );
    console.log(
      `Admin staging package: ${destination}\nNo deployment, credentials, invitations or production configuration used.`,
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(
    process.argv.length,
    3,
    'Usage: npm run build:admin-staging -- <new absolute output directory>',
  );
  await buildAdminStaging(process.argv[2]!);
}
