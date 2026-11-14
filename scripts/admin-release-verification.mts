import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { targets, type AdminTarget } from './admin-release-policy.mts';

export type VerificationStage =
  | 'upload'
  | 'cloud-readback'
  | 'cloud-configuration'
  | 'deployment-status'
  | 'deployment-source'
  | 'release-identity'
  | 'entrypoint'
  | 'security-headers'
  | 'runtime-config'
  | 'same-origin-session'
  | 'cross-origin-session'
  | 'complete';

export type DeploymentReadback = {
  deployment_configs: Record<string, unknown>;
  canonical_deployment: {
    id: string;
    latest_stage: { status: string };
    deployment_trigger: { metadata: { commit_hash: string } };
  };
};

/** Read-only checks; checkpoints contain fixed labels, never provider errors or secret values. */
export async function verifyAdminDeployment(input: {
  directory: string;
  target: AdminTarget;
  sourceSha: string;
  configurationHash: string;
  project: () => Promise<DeploymentReadback>;
  publicRead: (path: string, origin?: string) => Promise<Response>;
  checkpoint: (stage: VerificationStage, deploymentId?: string) => Promise<void>;
}) {
  const { directory, target, sourceSha, configurationHash, project, publicRead, checkpoint } =
    input;
  await checkpoint('cloud-readback');
  const after = await project();
  await checkpoint('cloud-configuration', after.canonical_deployment.id);
  assert.equal(
    createHash('sha256').update(JSON.stringify(after.deployment_configs)).digest('hex'),
    configurationHash,
  );
  await checkpoint('deployment-status');
  assert.equal(after.canonical_deployment.latest_stage.status, 'success');
  await checkpoint('deployment-source');
  assert.equal(after.canonical_deployment.deployment_trigger.metadata.commit_hash, sourceSha);
  await checkpoint('release-identity');
  const release = await publicRead('/release.json');
  assert.equal(release.status, 200);
  assert.deepEqual(await release.json(), { sourceSha, target });
  await checkpoint('entrypoint');
  const page = await publicRead('/');
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes(`/react-admin/${sourceSha}/assets/`));
  await checkpoint('security-headers');
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  assert.ok(page.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"));
  await checkpoint('runtime-config');
  const flags = await publicRead('/react-admin-config.js');
  assert.equal(flags.status, 200);
  assert.equal(
    await flags.text(),
    await readFile(join(directory, 'site/react-admin-config.js'), 'utf8'),
  );
  for (const [stage, origin, status] of [
    ['same-origin-session', targets[target].origin, 401],
    ['cross-origin-session', 'https://business.dojipro.com', 403],
  ] as const) {
    await checkpoint(stage);
    const response = await publicRead('/api/session', origin);
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  await checkpoint('complete');
}

export function deploymentFailure(stage: VerificationStage): Error {
  // Assertion messages can contain provider payloads or config values. Do not attach a cause.
  return Error(
    `Admin deployment failed at ${stage}. Inspect the retained receipt before retry or rollback.`,
  );
}
