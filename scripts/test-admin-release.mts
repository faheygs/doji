import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { affectsAdmin, adminTarget, targets, trustedRun } from './admin-release-policy.mts';
import { assembleAdminRelease } from './build-admin-release.mts';
import { assembleStagingSite } from './build-admin-staging.mts';
import { verifyAdminPackage, verifyStagedRelease } from './deploy-admin-release.mts';
import productionWorker from '../infra/portal-identity/employee-production-pages-worker.mts';

const original = globalThis.fetch;
before(() => {
  globalThis.fetch = () => {
    throw Error('Unexpected external request');
  };
});
after(() => {
  globalThis.fetch = original;
});
const sha = 'a'.repeat(40);

test('admin dependency selection excludes independent business, site, mobile and database releases', () => {
  for (const path of [
    'web/apps/admin/src/Home.tsx',
    'web/packages/ui/src/theme.tsx',
    'web/packages/portal-data/src/employee-session.ts',
    'website/admin-portal/live-client.mts',
    'infra/portal-identity/employee-proxy.mts',
    'infra/portal-identity/business-contracts.mts',
    'website/business-portal/application-form.mts',
    'infra/doji-orchestrator/src/portal-read.ts',
    'web/package-lock.json',
    'package-lock.json',
    'scripts/build-admin-release.mts',
    '.github/workflows/admin-staging.yml',
    '.github/workflows/admin-production.yml',
  ])
    assert.ok(affectsAdmin(path), path);
  for (const path of [
    'web/apps/business/src/App.tsx',
    'infra/portal-identity/business-runtime.mts',
    'website/business-portal/access/registration.mts',
    'web/apps/site/app/page.tsx',
    'app/index.tsx',
    'supabase/migrations/change.sql',
    'infra/doji-orchestrator/src/index.ts',
    'docs/README.md',
  ])
    assert.equal(affectsAdmin(path), false, path);
  assert.throws(() => adminTarget('business'));
});
test('promotion requires successful same-repository main workflow provenance, not a PR or fork run', () => {
  const run = {
    path: '.github/workflows/admin-staging.yml',
    head_branch: 'main',
    status: 'completed',
    conclusion: 'success',
    event: 'workflow_run',
    repository: { full_name: 'faheygs/doji' },
    head_repository: { full_name: 'faheygs/doji' },
  };
  const check = (value: Record<string, unknown>) => trustedRun(value, run.path, ['workflow_run']);
  check(run);
  for (const overrides of [
    { path: '.github/workflows/quality.yml' },
    { head_branch: 'feature' },
    { status: 'in_progress' },
    { conclusion: 'failure' },
    { event: 'pull_request' },
    { head_repository: { full_name: 'other/fork' } },
    { repository: { full_name: 'other/fork' } },
  ])
    assert.throws(() => check({ ...run, ...overrides }));
});
test('release packages share exact frontend bytes but keep environment policy and rollback receipts separate', async () => {
  const root = await mkdtemp(join(tmpdir(), 'doji-release-test-'));
  try {
    const candidate = join(root, 'candidate');
    await mkdir(join(candidate, 'assets'), { recursive: true });
    await writeFile(join(candidate, 'assets/app.js'), 'synthetic frontend');
    await writeFile(
      join(candidate, 'connected.html'),
      `<head><title>Candidate</title><script src="/react-admin/${sha}/assets/app.js"></script></head>`,
    );
    await writeFile(join(candidate, 'doji-icon.png'), 'synthetic icon');
    await mkdir(join(root, 'staging'));
    await assembleStagingSite(candidate, join(root, 'staging/site'), 'staging proxy', sha);
    await assembleAdminRelease(root, sha, 'production proxy');
    const stage = await verifyAdminPackage(join(root, 'staging'), 'staging', sha);
    await verifyAdminPackage(join(root, 'production'), 'production', sha);
    assert.ok((await readFile(join(root, 'production/site/admin-portal/admin.css'))).length);
    assert.doesNotMatch(
      await readFile(join(root, 'production/site/_redirects'), 'utf8'),
      /\/admin-portal\/\*/,
    );
    assert.deepEqual(
      await readFile(join(root, `staging/site/react-admin/${sha}/assets/app.js`)),
      await readFile(join(root, `production/site/react-admin/${sha}/assets/app.js`)),
    );
    assert.equal(
      await readFile(join(root, 'production/site/_headers'), 'utf8'),
      targets.production.headers,
    );
    assert.doesNotMatch(
      await readFile(join(root, 'production/site/index.html'), 'utf8'),
      /Staging/,
    );
    await assert.rejects(verifyAdminPackage(join(root, 'staging'), 'production', sha));
    await assert.rejects(verifyAdminPackage(join(root, 'staging'), 'staging', 'b'.repeat(40)));
    await assert.rejects(verifyStagedRelease(root, sha));
    const receipt = {
      target: 'staging',
      sourceSha: sha,
      status: 'verified',
      previousDeployment: 'old',
      deploymentId: 'new',
      packageHash: createHash('sha256').update(JSON.stringify(stage)).digest('hex'),
    };
    await writeFile(
      join(root, 'staging/deployment.json'),
      JSON.stringify({ ...receipt, status: 'attempted' }),
    );
    await assert.rejects(verifyStagedRelease(root, sha));
    await writeFile(join(root, 'staging/deployment.json'), JSON.stringify(receipt));
    await verifyStagedRelease(root, sha);
    await writeFile(join(root, 'production/site/react-admin-config.js'), 'tampered');
    await assert.rejects(verifyStagedRelease(root, sha));
    await assert.rejects(assembleAdminRelease(root, sha, 'overwrite'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('production entry denies staging bindings and preview hosts before accessing assets or APIs', async () => {
  let reads = 0;
  const env = {
    EMPLOYEE_V2_ENABLED: 'false',
    EMPLOYEE_V2_ENDPOINT:
      'https://tvixsmqxotuvyjqzmjla.supabase.co/functions/v1/employee-portal-v2',
    EMPLOYEE_V2_PROXY_KEY: 'ab'.repeat(32),
    ASSETS: {
      fetch: async () => {
        reads++;
        return new Response('page');
      },
    },
  };
  for (const [origin, override] of [
    ['https://admin-staging.dojipro.com', {}],
    ['https://preview.doji-admin.pages.dev', {}],
    ['https://admin.dojipro.com', { EMPLOYEE_V2_ORIGIN: 'https://admin-staging.dojipro.com' }],
    [
      'https://admin.dojipro.com',
      {
        EMPLOYEE_V2_ENDPOINT:
          'https://ohrcupagdoilkwhecict.supabase.co/functions/v1/employee-portal-v2',
      },
    ],
  ] as const)
    assert.equal(
      (await productionWorker.fetch(new Request(origin), { ...env, ...override })).status,
      503,
    );
  assert.equal(reads, 0);
  assert.equal(
    (await productionWorker.fetch(new Request('https://admin.dojipro.com'), env)).status,
    200,
  );
  assert.equal(reads, 1);
});
test('release workflows have separate protected environments and no untrusted input in shell expressions', async () => {
  for (const [name, environment] of [
    ['staging', 'admin-staging'],
    ['production', 'admin-production'],
  ]) {
    const text = await readFile(`.github/workflows/admin-${name}.yml`, 'utf8');
    assert.match(text, new RegExp('name: ' + environment));
    assert.match(text, /ADMIN_DEPLOYMENTS_ENABLED == 'true'/);
    assert.match(text, /cancel-in-progress: false/);
    assert.doesNotMatch(text, /run:.*\$\{\{.*inputs/);
    assert.doesNotMatch(text, /supabase db|wrangler deploy|eas build|business.*deploy/);
    assert.match(text, /persist-credentials: false/);
  }
});
