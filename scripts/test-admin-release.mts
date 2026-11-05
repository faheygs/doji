import test, { before, after } from 'node:test';
import './test-admin-release-verification.mts';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  affectsAdmin,
  adminTarget,
  targets,
  trustedRun,
  productionHealthPredecessor,
  verifyProductionTransition,
} from './admin-release-policy.mts';
import { assembleAdminRelease } from './build-admin-release.mts';
import { assembleStagingSite } from './build-admin-staging.mts';
import {
  deployAdminRelease,
  verifyAdminPackage,
  verifyStagedRelease,
} from './deploy-admin-release.mts';
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

test('production permits only the reviewed health transition or an unchanged target policy', () => {
  const prior = productionHealthPredecessor;
  const release = { sourceSha: prior.sourceSha, target: 'production' };
  const check = (
    flags: unknown,
    identity: unknown = release,
    id: string = prior.deploymentId,
    source: string = prior.sourceSha,
  ) => verifyProductionTransition(flags, identity, id, source);
  check(prior.flags);
  check(targets.production.flags, { sourceSha: sha, target: 'production' }, 'new-deployment', sha);
  for (const flags of [
    null,
    {},
    { ...prior.flags, healthSnapshotEnabled: true },
    { ...prior.flags, healthEventsEnabled: false },
    { ...targets.production.flags, healthEventsEnabled: true },
    { ...prior.flags, unknownEnabled: true },
    { ...targets.production.flags, unknownEnabled: true },
  ])
    assert.throws(() => check(flags));
  for (const flags of [prior.flags, targets.production.flags]) {
    for (const key of Object.keys(flags)) {
      assert.throws(() => check({ ...flags, [key]: !flags[key as keyof typeof flags] }));
      assert.throws(() =>
        check(Object.fromEntries(Object.entries(flags).filter(([name]) => name !== key))),
      );
    }
    assert.throws(() => check(flags, { ...release, target: 'staging' }));
    assert.throws(() => check(flags, { ...release, sourceSha: sha }));
    assert.throws(() => check(flags, release, prior.deploymentId, 'invalid'));
  }
  assert.throws(() => check(prior.flags, release, 'unreviewed-deployment'));
  assert.throws(() =>
    check(prior.flags, { sourceSha: sha, target: 'production' }, prior.deploymentId, sha),
  );
});

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
    const productionConfig = await readFile(
      join(root, 'production/site/react-admin-config.js'),
      'utf8',
    );
    assert.match(productionConfig, /"healthSnapshotEnabled":true/);
    assert.match(productionConfig, /"healthEventsEnabled":false/);
    assert.doesNotMatch(productionConfig, /impersonat|developmentGateway/i);
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
    // Exercise the real preflight with an exact synthetic package. A changed
    // second project read stops before any deploy process can be started.
    const prior = productionHealthPredecessor;
    const envKeys = [
      'GITHUB_ACTIONS',
      'GITHUB_REPOSITORY',
      'GITHUB_REF',
      'CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_API_TOKEN',
    ] as const;
    const saved = envKeys.map((key) => [key, process.env[key]] as const);
    const blockedFetch = globalThis.fetch;
    try {
      Object.assign(process.env, {
        GITHUB_ACTIONS: 'true',
        GITHUB_REPOSITORY: 'faheygs/doji',
        GITHUB_REF: 'refs/heads/main',
        CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
        CLOUDFLARE_API_TOKEN: 'synthetic',
      });
      for (const accepted of [false, true]) {
        let projectReads = 0;
        globalThis.fetch = async (input) => {
          const url = String(input);
          if (
            url ===
            `https://api.cloudflare.com/client/v4/accounts/${'a'.repeat(32)}/pages/projects/doji-admin`
          ) {
            projectReads++;
            return Response.json({
              success: true,
              result: {
                name: 'doji-admin',
                production_branch: 'main',
                canonical_deployment: {
                  id: projectReads === 1 ? prior.deploymentId : 'intervening-deployment',
                  latest_stage: { status: 'success' },
                  deployment_trigger: { metadata: { commit_hash: prior.sourceSha } },
                },
                deployment_configs: {
                  production: {
                    env_vars: {
                      EMPLOYEE_V2_ENABLED: { value: 'true' },
                      EMPLOYEE_V2_ENDPOINT: {
                        value: `https://${targets.production.supabaseProject}.supabase.co/functions/v1/employee-portal-v2`,
                      },
                      EMPLOYEE_V2_PROXY_KEY: { type: 'secret_text' },
                    },
                  },
                },
              },
            });
          }
          if (url === targets.production.origin + '/release.json')
            return Response.json({ sourceSha: prior.sourceSha, target: 'production' });
          if (url === targets.production.origin + '/react-admin-config.js')
            return new Response(
              `window.DOJI_REACT_ADMIN_CONFIG = Object.freeze(${JSON.stringify(
                accepted ? prior.flags : { ...prior.flags, staffWorkflowEnabled: false },
              )});\n`,
            );
          throw Error(`Unexpected external request: ${url}`);
        };
        await assert.rejects(
          deployAdminRelease(join(root, 'production'), 'production', sha),
          accepted ? /Another deployment intervened/ : /Production gates changed/,
        );
        assert.equal(projectReads, accepted ? 2 : 1);
      }
    } finally {
      globalThis.fetch = blockedFetch;
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
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
