// Separate frontend cutovers. No database, Worker source, identity-provider or mobile changes.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { account, cf, hash, inventory, cli } from './prepare-safety-launch.mts';
import { pages } from './business-disabled-release-reads.mts';
const root = resolve(import.meta.dirname, '..');
const [mode, input] = process.argv.slice(2);
assert.ok(mode && ['qualify', 'deploy', 'verify'].includes(mode) && input);
const folder = resolve(root, input);
assert.ok(
  folder.startsWith(join(root, 'test-results') + sep) &&
    /react-(business|public)-migration-[A-Za-z0-9]+$/.test(folder),
);
const prepared = JSON.parse(await readFile(join(folder, 'prepared.json'), 'utf8'));
assert.ok(['business', 'public'].includes(prepared.kind));
const business = prepared.kind === 'business';
assert.equal(prepared.project, business ? 'doji-business' : 'doji-site');
const site = join(folder, 'site');
assert.deepEqual(await inventory(site), prepared.assets, 'Package changed; requalify');
const save = (name: string, value: unknown) =>
  writeFile(join(folder, `${name}.json`), JSON.stringify(value, null, 2), { flag: 'wx' });
if (mode === 'qualify') {
  let result: string;
  try {
    result = execFileSync(
      process.execPath,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--config',
        business ? 'playwright.business.config.ts' : 'playwright.public.config.ts',
        '--reporter=json',
      ],
      {
        cwd: join(root, 'web'),
        env: { ...process.env, [business ? 'DOJI_BUSINESS_PACKAGE' : 'DOJI_PUBLIC_PACKAGE']: site },
        timeout: 180000,
        maxBuffer: 8e6,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } catch (error) {
    const output = (error as { stdout?: string }).stdout;
    if (output) await save(`qualification-failed-${Date.now()}`, JSON.parse(output));
    throw Error(`Offline qualification failed; inspect ${folder}. No deployment performed.`);
  }
  const report = JSON.parse(result);
  assert.equal(report.stats.unexpected, 0);
  assert.equal(report.stats.flaky, 0);
  assert.equal(report.stats.skipped, 0);
  assert.ok(report.stats.expected >= (business ? 11 : 4));
  assert.deepEqual(await inventory(site), prepared.assets);
  await save('qualified', {
    at: new Date().toISOString(),
    packageHash: hash(JSON.stringify(prepared.assets)),
    tests: report.stats,
    offline: true,
    realCommandsSent: false,
  });
  console.log(
    JSON.stringify({ kind: prepared.kind, qualified: true, tests: report.stats.expected }),
  );
} else {
  const qualified = JSON.parse(await readFile(join(folder, 'qualified.json'), 'utf8'));
  assert.equal(qualified.packageHash, hash(JSON.stringify(prepared.assets)));
  for (const name of ['doji-admin', 'doji-business', 'doji-site']) {
    const value = await cf<{ deployment_configs: unknown }>(`/pages/projects/${name}`);
    assert.equal(
      hash(JSON.stringify(value.deployment_configs)),
      prepared.configHashes[name],
      `Project settings changed: ${name}`,
    );
  }
  if (mode === 'deploy') {
    assert.deepEqual(
      await pages(),
      prepared.before,
      'Another deployment occurred; reconcile instead of overwriting',
    );
    if (business) {
      const result = cli<{ rows: Array<Record<string, unknown> & { registration_until: string }> }>(
        [
          'db',
          'query',
          "begin read only;set local statement_timeout='3s';select registration_enabled,registration_until,registration_limit,registrations_used from business_session_private.settings where singleton;rollback;",
          '--linked',
          '--workdir',
          'D:/ChallengeApp/DoIt',
          '--output-format',
          'json',
        ],
      );
      const current = result.rows[0];
      assert.ok(current && Number.isFinite(Date.parse(current.registration_until)));
      assert.deepEqual(
        { ...current, registration_until: new Date(current.registration_until).toISOString() },
        {
          ...prepared.registration,
          registration_until: new Date(prepared.registration.registration_until).toISOString(),
        },
        'Pilot policy changed; rebuild the public registration hint',
      );
    }
    await save('deploy-started', {
      at: new Date().toISOString(),
      rollbackDeployment: prepared.expected,
      rollbackArtifact: prepared.previous,
    });
    try {
      execFileSync(
        process.execPath,
        [
          'infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js',
          'pages',
          'deploy',
          site,
          '--project-name',
          prepared.project,
          '--branch',
          'main',
          '--commit-dirty=true',
          '--commit-message',
          business
            ? 'Business React migration preserving independent identity and admission policy'
            : 'Public Next static migration preserving safety intake and legal content',
        ],
        {
          cwd: root,
          env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
          timeout: 180000,
          maxBuffer: 4e6,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
    } catch {
      throw Error('Unknown Pages deployment outcome. Inspect deployment status before retrying.');
    }
    const after = await pages();
    for (const name of ['doji-admin', 'doji-business', 'doji-site'].filter(
      (name) => name !== prepared.project,
    ))
      assert.deepEqual(after[name], prepared.before[name]);
    await save('deployed', { at: new Date().toISOString(), after });
    console.log(JSON.stringify({ kind: prepared.kind, deployed: after[prepared.project] }));
  } else {
    const deployed = JSON.parse(await readFile(join(folder, 'deployed.json'), 'utf8'));
    assert.deepEqual(await pages(), deployed.after);
    const origin = business ? 'https://business.dojipro.com' : 'https://dojipro.com';
    const paths = business
      ? [
          '/',
          '/business-portal/access/',
          '/business-portal/application/',
          '/business-portal/config.js',
          '/business-terms/',
          '/business-privacy/',
        ]
      : [
          '/',
          '/business/',
          '/privacy/',
          '/terms/',
          '/community-guidelines/',
          '/child-safety/',
          '/support/',
          '/delete-account/',
          '/delete-data/',
          '/safety-removal/',
          '/safety-removal/config.js',
          '/robots.txt',
          '/sitemap.xml',
        ];
    const checks = [];
    for (const path of paths) {
      const response = await fetch(origin + path, {
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(response.status, 200, path);
      const local = join(site, path.slice(1) + (path.endsWith('/') ? 'index.html' : ''));
      assert.equal(
        hash(Buffer.from(await response.arrayBuffer())),
        hash(await readFile(local)),
        path,
      );
      if (path.endsWith('/')) {
        const csp = response.headers.get('content-security-policy');
        assert.ok(typeof csp === 'string', `Missing CSP ${path}`);
        assert.ok(csp?.includes("script-src 'self'"), `Missing CSP ${path}`);
        assert.ok(
          !/script-src[^;]*'unsafe-(inline|eval)'/.test(csp),
          `Unsafe executable CSP ${path}`,
        );
      }
      checks.push({ path, status: response.status });
    }
    if (business)
      for (const [requestOrigin, status] of [
        [origin, 401],
        ['https://admin.dojipro.com', 403],
      ] as const) {
        const response = await fetch(origin + '/api/session', {
          headers: { origin: requestOrigin },
          redirect: 'manual',
          signal: AbortSignal.timeout(15000),
        });
        await response.body?.cancel();
        assert.equal(response.status, status);
        checks.push({ path: requestOrigin + ' -> /api/session', status });
      }
    await save('verified', {
      at: new Date().toISOString(),
      checks,
      now: deployed.after,
      noLiveDomainWrites: true,
      authenticatedAcceptance:
        'Requires existing business account sign-in; offline flows qualified',
    });
    console.log(JSON.stringify({ kind: prepared.kind, verified: true, checks: checks.length }));
  }
}
