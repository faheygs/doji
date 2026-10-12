// Exact, isolated frontend packages. Read-only cloud baseline; never deploys.
import assert from 'node:assert/strict';
import { cp, readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { hash, inventory, cf, cli } from './prepare-safety-launch.mts';
import { pages } from './business-disabled-release-reads.mts';
const root = resolve(import.meta.dirname, '..');
const kind = process.argv[2];
assert.ok(kind === 'business' || kind === 'public', 'Choose business or public');
const previous =
  kind === 'business'
    ? resolve(root, 'test-results/business-session-flow-20261005/site')
    : 'D:/ChallengeApp/DoIt/test-results/safety-launch-20260929/public';
const expected =
  kind === 'business'
    ? 'e8ebfc1e-2a64-464a-b252-d25b1d425afc'
    : 'd352e4ed-89ec-47c4-b8e2-bfea5688acc3';
const project = kind === 'business' ? 'doji-business' : 'doji-site';
const before = await pages();
assert.equal(
  (before[project] as { id: string }).id,
  expected,
  'Live baseline changed. Reconcile before packaging.',
);
const configHashes: Record<string, string> = {};
for (const name of ['doji-admin', 'doji-business', 'doji-site']) {
  const value = await cf<{ deployment_configs: unknown }>(`/pages/projects/${name}`);
  configHashes[name] = hash(JSON.stringify(value.deployment_configs));
}
const folder = await mkdtemp(resolve(root, `test-results/react-${kind}-migration-`));
const output = join(folder, 'site');
const baseline = await inventory(previous);
let registration:
  | {
      registration_enabled: boolean;
      registration_until: string;
      registration_limit: number;
      registrations_used: number;
    }
  | undefined;
const npm =
  process.platform === 'win32'
    ? 'C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js'
    : 'node_modules/npm/bin/npm-cli.js';
const build = (workspace: string, env: Record<string, string>) =>
  execFileSync(process.execPath, [npm, 'run', 'build', '--workspace', workspace], {
    cwd: join(root, 'web'),
    env: { ...process.env, ...env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120000,
  });
if (kind === 'business') {
  const result = cli<{
    rows: {
      registration_enabled: boolean;
      registration_until: string;
      registration_limit: number;
      registrations_used: number;
    }[];
  }>([
    'db',
    'query',
    "begin read only;set local statement_timeout='3s';select registration_enabled,registration_until,registration_limit,registrations_used from business_session_private.settings where singleton;rollback;",
    '--linked',
    '--workdir',
    'D:/ChallengeApp/DoIt',
    '--output-format',
    'json',
  ]);
  registration = result.rows[0];
  assert.ok(registration && Number.isFinite(Date.parse(registration.registration_until)));
  const namespace = '/react-business/20261010a/';
  build('@doji/business', { DOJI_BUSINESS_ASSET_BASE: namespace });
  await cp(previous, output, { recursive: true, errorOnExist: true });
  await cp(join(root, 'web/apps/business/dist/assets'), join(output, namespace, 'assets'), {
    recursive: true,
  });
  await cp(join(root, 'web/apps/business/dist/doji-icon.png'), join(output, 'doji-icon.png'));
  const until =
    registration.registration_enabled &&
    registration.registrations_used < registration.registration_limit
      ? new Date(registration.registration_until).toISOString()
      : new Date(0).toISOString();
  await writeFile(
    join(output, namespace, 'release-config.js'),
    `window.DOJI_REACT_BUSINESS_CONFIG = Object.freeze(${JSON.stringify({ registrationUntil: until })});\n`,
  );
  const html = (await readFile(join(root, 'web/apps/business/dist/index.html'), 'utf8'))
    .replace('Doji for Business · Migration preview', 'Doji for Business')
    .replace(
      '<head>',
      `<head><script src="${namespace}release-config.js"></script><script src="/business-portal/config.js"></script><link rel="icon" href="/doji-icon.png">`,
    );
  for (const path of [
    'index.html',
    'business-portal/access/index.html',
    'business-portal/application/index.html',
      'business-portal/setup/index.html',
  ])
    await writeFile(join(output, path), html);
  for (const path of [
    '_worker.js',
    '_routes.json',
    '_headers',
    '_redirects',
    'business-portal/config.js',
    'business-terms/index.html',
    'business-privacy/index.html',
  ])
    assert.equal(
      hash(await readFile(join(output, path))),
      hash(await readFile(join(previous, path))),
      `Preserve ${path}`,
    );
} else {
  build('@doji/site', { DOJI_SITE_RELEASE: 'true' });
  await cp(join(root, 'web/apps/site/out'), output, { recursive: true, errorOnExist: true });
  // Keep the exact live reviewed intake controller, taxonomy, presentation and config.
  for (const [from, to] of [
    ['styles.css', 'legacy-safety/styles.css'],
    ['portal.css', 'legacy-safety/portal.css'],
    ['safety-removal/safety.css', 'legacy-safety/safety.css'],
    ['portal-select.js', 'legacy-safety/portal-select.js'],
    ['safety-removal/form.js', 'legacy-safety/form.js'],
    ['safety-removal/taxonomy.js', 'legacy-safety/taxonomy.js'],
    ['safety-removal/config.js', 'safety-removal/config.js'],
  ])
    await cp(join(previous, from!), join(output, to!));
  // Static export needs bootstrap scripts, but not unsafe-inline or a new server.
  // Externalize exact emitted executable bytes; do not modify the payload or reorder scripts.
  const scriptFolder = join(output, 'next-bootstrap');
  await mkdir(scriptFolder);
  for (const asset of await inventory(output)) {
    if (!asset.path.endsWith('.html')) continue;
    let html = await readFile(join(output, asset.path), 'utf8');
    const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
    for (const match of scripts) {
      if (/\bsrc=/.test(match[1]!) || !match[2]) continue;
      assert.ok(!/\btype=/.test(match[1]!), 'Review non-executable inline script separately');
      const file = `${hash(match[2]).slice(0, 32)}.js`;
      await writeFile(join(scriptFolder, file), match[2]);
      html = html.replace(match[0], `<script${match[1]} src="/next-bootstrap/${file}"></script>`);
    }
    assert.ok(
      !/<script[^>]*>(?!<\/script>)[\s\S]+?<\/script>/.test(html),
      'Unexpected inline script remains',
    );
    await writeFile(join(output, asset.path), html);
  }
  const ordinary =
    "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'; frame-ancestors 'none'";
  const safety = ordinary
    .replace("script-src 'self'", "script-src 'self' https://challenges.cloudflare.com")
    .replace(
      "connect-src 'self'",
      "connect-src 'self' https://tvixsmqxotuvyjqzmjla.supabase.co/functions/v1/safety-removal",
    )
    .replace("frame-src 'none'", 'frame-src https://challenges.cloudflare.com');
  let headers =
    '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  X-Frame-Options: DENY\n  Cache-Control: no-cache, no-transform\n\n';
  const routes = [
    '',
    'business',
    'privacy',
    'terms',
    'community-guidelines',
    'child-safety',
    'support',
    'delete-account',
    'delete-data',
    'safety-removal',
    '404.html',
    '_not-found',
  ];
  for (const path of routes) {
    const patterns =
      path === ''
        ? ['/', '/index.html']
        : path.endsWith('.html')
          ? [`/${path}`]
          : [`/${path}`, `/${path}/*`];
    for (const pattern of patterns)
      headers += `${pattern}\n  Content-Security-Policy: ${path === 'safety-removal' ? safety : ordinary}\n\n`;
  }
  headers +=
    'https://doji-site.pages.dev/*\n  X-Robots-Tag: noindex\n\nhttps://:branch.doji-site.pages.dev/*\n  X-Robots-Tag: noindex\n';
  assert.ok(headers.split('\n').every((line) => line.length <= 2000));
  await writeFile(join(output, '_headers'), headers);
  await writeFile(
    join(output, '_redirects'),
    '/business-portal/* https://business.dojipro.com/business-portal/:splat 302\n',
  );
  assert.ok(
    !(await inventory(output)).some((asset) => asset.path === '_worker.js'),
    'Public website remains static',
  );
}
const assets = await inventory(output);
await writeFile(
  join(folder, 'prepared.json'),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      kind,
      project,
      previous,
      expected,
      before,
      configHashes,
      baseline,
      registration,
      assets,
      deploymentReady: false,
      gates: [
        'Exact-package browser checks',
        'Legal and public route parity',
        'Hosted read-only acceptance after isolated cutover',
      ],
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ folder, kind, assets: assets.length, deploymentReady: false }));
