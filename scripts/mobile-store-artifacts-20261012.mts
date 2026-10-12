// Read/download only. Does not build, submit, release or change update policy.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEasReadClient } from './eas-read-client.mts';
const root = resolve(import.meta.dirname, '../test-results/mobile-recovery-20261012');
const client = createEasReadClient();
for (const [platform, id, build, extension] of [
  ['ios', '0f532f3d-e133-4ce6-af84-16af6f574e26', '105', 'ipa'],
  ['android', '339a32a2-c5d8-4d40-b6d9-3cab4b580e5b', '30', 'aab'],
]) {
  assert.ok(platform && id && build && extension);
  const b = await client.buildAssessment(id);
  assert.equal(b.status, 'FINISHED'); assert.equal(b.appVersion, '1.0.10');
  assert.equal(b.appBuildVersion, build); assert.equal(b.platform, platform.toUpperCase());
  assert.equal(b.project.id, '064b68b6-f138-4962-8aeb-f00970ba39c8');
  assert.equal(b.buildProfile, 'production'); assert.equal(b.distribution, 'STORE');
  let uploaded = false;
  for (const url of b.logFiles) {
    const response = await fetch(url); assert.ok(response.ok);
    uploaded ||= (await response.text()).includes('Uploaded files to Sentry');
  }
  assert.ok(uploaded, 'Missing Sentry source-map upload confirmation');
  const path = resolve(root, platform, `doji-1.0.10-${build}.${extension}`);
  if (!existsSync(path)) {
    const url = b.artifacts?.applicationArchiveUrl ?? b.artifacts?.buildUrl;
    assert.ok(url && url.startsWith('https://'));
    const response = await fetch(url); assert.ok(response.ok);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.length > 1_000_000); assert.equal(bytes.subarray(0, 2).toString(), 'PK');
    writeFileSync(path, bytes, { flag: 'wx' });
  }
  const bytes = readFileSync(path);
  const proof = { id, platform, version: b.appVersion, build, completedAt: b.completedAt,
    path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), sentryUploadConfirmed: true };
  const proofPath = resolve(root, platform, 'store-artifact.json');
  if (!existsSync(proofPath)) writeFileSync(proofPath, JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(proof));
}
