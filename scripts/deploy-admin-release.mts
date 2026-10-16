import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { adminTarget, targets, type AdminTarget } from './admin-release-policy.mts';
import { inventory } from './build-admin-staging.mts';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function verifyAdminPackage(
  directory: string,
  target: AdminTarget,
  sourceSha: string,
) {
  assert.match(sourceSha, /^[a-f0-9]{40}$/);
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  assert.deepEqual(
    manifest,
    {
      sourceSha,
      target,
      ...targets[target],
      assets: await inventory(join(directory, 'site')),
    },
    'Admin package identity, configuration or hashes do not match.',
  );
  assert.ok(manifest.assets.length > 5, 'Incomplete release package.');
  return manifest;
}
export async function verifyStagedRelease(directory: string, sourceSha: string) {
  const manifest = await verifyAdminPackage(join(directory, 'staging'), 'staging', sourceSha);
  await verifyAdminPackage(join(directory, 'production'), 'production', sourceSha);
  const receipt = JSON.parse(await readFile(join(directory, 'staging/deployment.json'), 'utf8'));
  assert.equal(receipt.status, 'verified', 'Staging was not verified.');
  assert.equal(receipt.target, 'staging');
  assert.equal(receipt.sourceSha, sourceSha);
  assert.equal(receipt.packageHash, hash(manifest), 'Staged package changed.');
  assert.ok(receipt.deploymentId && receipt.previousDeployment);
}

export async function deployAdminRelease(
  directory: string,
  target: AdminTarget,
  sourceSha: string,
) {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Use the protected GitHub deployment workflow.');
  assert.equal(process.env.GITHUB_REPOSITORY, 'faheygs/doji');
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
  const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
  const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
  assert.match(account, /^[a-f0-9]{32}$/);
  assert.ok(token, 'Missing environment-scoped Cloudflare deploy token.');
  const manifest = await verifyAdminPackage(directory, target, sourceSha);
  const config = targets[target];
  async function project() {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${config.pagesProject}`,
      {
        headers: { authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      },
    );
    assert.ok(response.ok, 'Cannot verify existing Cloudflare project.');
    const body = (await response.json()) as {
      success: boolean;
      result: {
        name: string;
        production_branch: string;
        deployment_configs: Record<string, unknown>;
        canonical_deployment: {
          id: string;
          latest_stage: { status: string };
          deployment_trigger: { metadata: { commit_hash: string } };
        };
      };
    };
    assert.equal(body.success, true);
    return body.result;
  }
  async function publicRead(path: string, origin?: string) {
    return fetch(config.origin + path, {
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
      ...(origin ? { headers: { origin } } : {}),
    });
  }
  const before = await project();
  assert.equal(before.name, config.pagesProject);
  assert.equal(before.production_branch, 'main');
  assert.equal(
    before.canonical_deployment.latest_stage.status,
    'success',
    'No healthy rollback deployment.',
  );
  const binding = (
    before.deployment_configs.production as {
      env_vars: Record<string, { type: string; value?: string }>;
    }
  ).env_vars;
  assert.equal(binding.EMPLOYEE_V2_ENABLED?.value, 'true');
  assert.equal(
    binding.EMPLOYEE_V2_ENDPOINT?.value,
    `https://${config.supabaseProject}.supabase.co/functions/v1/employee-portal-v2`,
  );
  assert.equal(binding.EMPLOYEE_V2_ORIGIN?.value ?? 'https://admin.dojipro.com', config.origin);
  assert.equal(binding.EMPLOYEE_V2_PROXY_KEY?.type, 'secret_text');
  if (target === 'production') {
    const live = await publicRead('/react-admin-config.js');
    assert.equal(live.status, 200);
    const match = (await live.text()).match(
      /^window\.DOJI_REACT_ADMIN_CONFIG = Object\.freeze\((\{[^\n]*\})\);\s*$/,
    );
    assert.ok(match?.[1], 'Unrecognized production flags; review before release.');
    assert.deepEqual(
      JSON.parse(match[1]),
      config.flags,
      'Production gates changed; stop and review.',
    );
  }
  const receipt = {
    target,
    sourceSha,
    project: config.pagesProject,
    previousDeployment: before.canonical_deployment.id,
    configurationHash: hash(before.deployment_configs),
    packageHash: hash(manifest),
    status: 'prepared',
    deploymentId: '',
  };
  const receiptPath = join(directory, 'deployment.json');
  const save = () => writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  await save();
  const latest = await project();
  assert.equal(
    latest.canonical_deployment.id,
    receipt.previousDeployment,
    'Another deployment intervened.',
  );
  assert.equal(hash(latest.deployment_configs), receipt.configurationHash);
  receipt.status = 'attempted';
  await save();
  try {
    execFileSync(
      process.execPath,
      [
        resolve('infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js'),
        'pages',
        'deploy',
        join(directory, 'site'),
        '--project-name',
        config.pagesProject,
        '--branch',
        'main',
        '--commit-hash',
        sourceSha,
        '--commit-dirty=false',
        '--commit-message',
        `Admin ${target} ${sourceSha}`,
      ],
      {
        cwd: join(directory, 'site'),
        stdio: 'inherit',
        timeout: 180000,
        env: {
          ...process.env,
          CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
          WRANGLER_SEND_METRICS: 'false',
        },
      },
    );
    const after = await project();
    receipt.deploymentId = after.canonical_deployment.id;
    await save();
    assert.equal(
      hash(after.deployment_configs),
      receipt.configurationHash,
      'Cloud configuration drifted.',
    );
    assert.equal(after.canonical_deployment.latest_stage.status, 'success');
    assert.equal(after.canonical_deployment.deployment_trigger.metadata.commit_hash, sourceSha);
    const release = await publicRead('/release.json');
    assert.equal(release.status, 200);
    assert.deepEqual(await release.json(), { sourceSha, target });
    const page = await publicRead('/');
    assert.equal(page.status, 200);
    assert.ok((await page.text()).includes(`/react-admin/${sourceSha}/assets/`));
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
    assert.ok(page.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"));
    const flags = await publicRead('/react-admin-config.js');
    assert.equal(flags.status, 200);
    assert.equal(
      await flags.text(),
      await readFile(join(directory, 'site/react-admin-config.js'), 'utf8'),
    );
    for (const [origin, status] of [
      [config.origin, 401],
      ['https://business.dojipro.com', 403],
    ] as const) {
      const response = await publicRead('/api/session', origin);
      assert.equal(response.status, status);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    receipt.status = 'verified';
    await save();
    console.log(`Verified ${config.origin}; rollback deployment ${receipt.previousDeployment}`);
  } catch {
    receipt.status = 'needs-inspection';
    await save();
    throw Error(
      'Deployment or verification was inconclusive. Inspect the deployment receipt and Cloudflare before retry or rollback.',
    );
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(
    process.argv.length,
    5,
    'Usage: deploy-admin-release.mts <package> <staging|production> <SHA>',
  );
  if (process.argv[3] === 'verify-staged')
    await verifyStagedRelease(resolve(process.argv[2]!), process.argv[4]!);
  else
    await deployAdminRelease(
      resolve(process.argv[2]!),
      adminTarget(process.argv[3]!),
      process.argv[4]!,
    );
}
