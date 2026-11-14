import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  deploymentFailure,
  verifyAdminDeployment,
  type VerificationStage,
} from './admin-release-verification.mts';

const stages: VerificationStage[] = [
  'cloud-readback',
  'cloud-configuration',
  'deployment-status',
  'deployment-source',
  'release-identity',
  'entrypoint',
  'security-headers',
  'runtime-config',
  'same-origin-session',
  'cross-origin-session',
  'complete',
];
const sha = 'a'.repeat(40);

async function fixture(failure?: VerificationStage, transport = false) {
  const directory = await mkdtemp(join(tmpdir(), 'doji-release-readback-test-'));
  const checkpoints: VerificationStage[] = [];
  const deployments: string[] = [];
  let reads = 0,
    projectReads = 0;
  try {
    await mkdir(join(directory, 'site'));
    await writeFile(join(directory, 'site/react-admin-config.js'), 'exact config');
    const operation = verifyAdminDeployment({
      directory,
      target: 'staging',
      sourceSha: sha,
      configurationHash: createHash('sha256').update('{}').digest('hex'),
      checkpoint: async (stage, id) => {
        checkpoints.push(stage);
        if (id) deployments.push(id);
      },
      project: async () => {
        projectReads++;
        if (failure === 'cloud-readback') throw Error('PRIVATE_TOKEN provider body');
        return {
          deployment_configs: failure === 'cloud-configuration' ? { changed: true } : {},
          canonical_deployment: {
            id: 'synthetic-deployment',
            latest_stage: { status: failure === 'deployment-status' ? 'active' : 'success' },
            deployment_trigger: {
              metadata: { commit_hash: failure === 'deployment-source' ? 'b'.repeat(40) : sha },
            },
          },
        };
      },
      publicRead: async (path, origin) => {
        reads++;
        const current = checkpoints.at(-1);
        if (transport && failure === current) throw Error('PRIVATE_TOKEN transport error');
        if (path === '/release.json')
          return Response.json({ sourceSha: failure === current ? 'old' : sha, target: 'staging' });
        if (path === '/')
          return new Response(
            `/react-admin/${failure === 'entrypoint' ? 'old' : sha}/assets/app.js`,
            {
              headers:
                failure === 'security-headers'
                  ? {}
                  : {
                      'x-content-type-options': 'nosniff',
                      'referrer-policy': 'no-referrer',
                      'content-security-policy': "frame-ancestors 'none'",
                    },
            },
          );
        if (path === '/react-admin-config.js')
          return new Response(failure === current ? 'PRIVATE_TOKEN wrong config' : 'exact config');
        assert.equal(path, '/api/session');
        const status = origin === 'https://admin-staging.dojipro.com' ? 401 : 403;
        return new Response(null, {
          status: failure === current ? 200 : status,
          headers: { 'cache-control': 'no-store' },
        });
      },
    });
    if (failure) {
      await assert.rejects(operation);
      assert.equal(checkpoints.at(-1), failure);
      const safe = deploymentFailure(failure);
      assert.equal(
        safe.message,
        `Admin deployment failed at ${failure}. Inspect the retained receipt before retry or rollback.`,
      );
      assert.equal(safe.cause, undefined);
      assert.doesNotMatch(safe.stack!, /PRIVATE_TOKEN/);
    } else {
      await operation;
      assert.deepEqual(checkpoints, stages);
      assert.equal(reads, 5);
    }
    assert.equal(projectReads, 1);
    assert.ok(reads <= 5, 'No retry or upload in readback verification');
    assert.deepEqual(deployments, failure === 'cloud-readback' ? [] : ['synthetic-deployment']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('post-upload verification preserves every exact-source/config/authentication check', async () => {
  await fixture();
  for (const stage of stages.filter((stage) => stage !== 'complete')) await fixture(stage);
});

test('provider read failures retain fixed stages without raw errors or implicit retries', async () => {
  for (const stage of [
    'release-identity',
    'entrypoint',
    'runtime-config',
    'same-origin-session',
    'cross-origin-session',
  ] as const)
    await fixture(stage, true);
  assert.match(deploymentFailure('upload').message, /failed at upload/);
});

test('verification checkpoint failure cannot become success', async () => {
  let reads = 0;
  await assert.rejects(
    verifyAdminDeployment({
      directory: '',
      target: 'staging',
      sourceSha: sha,
      configurationHash: '',
      project: async () => {
        reads++;
        throw Error('Must not read');
      },
      publicRead: async () => {
        throw Error('Must not read');
      },
      checkpoint: async () => {
        throw Error('Receipt storage failed');
      },
    }),
    /Receipt storage failed/,
  );
  assert.equal(reads, 0);
});
