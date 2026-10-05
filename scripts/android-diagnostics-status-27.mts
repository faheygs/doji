import {evidenceRecord} from './release-evidence.mts';
import { createEasReadClient } from './eas-read-client.mts';
const reader = createEasReadClient();
// Read-only status / optional exact artifact download. Never builds or submits.
import { createHash } from 'node:crypto';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const id = '242c9a8b-f1f2-45d8-8e17-0b25cc18bf66';
const root = resolve('test-results/android-diagnostics-27');
(async () => {
  assert.ok(!process.argv[2] || process.argv[2] === '--download');
  const b = await reader.build(id);
  assert.equal(b.project.id, '064b68b6-f138-4962-8aeb-f00970ba39c8');
  assert.equal(b.appVersion, '1.0.8'); assert.equal(b.appBuildVersion, '27');
  assert.equal(b.platform, 'ANDROID');
  const result = { at: new Date().toISOString(), id, status: b.status, version: b.appVersion,
    build: b.appBuildVersion, completedAt: b.completedAt, queuePosition: b.queuePosition,
    error: b.error, url: `https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/${id}` };
  writeFileSync(resolve(root, 'latest-status.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (process.argv[2] !== '--download') return;
  assert.equal(b.status, 'FINISHED', 'Wait for the exact finished artifact');
  const dest = resolve(root, 'doji-1.0.8-27.aab');
  const record = resolve(root, 'android-artifact.json');
  if (existsSync(dest)) {
    const a = evidenceRecord(JSON.parse(readFileSync(record, 'utf8')));
    assert.equal(a.buildId, id);
    assert.equal(createHash('sha256').update(readFileSync(dest)).digest('hex'), a.sha256);
    console.log(JSON.stringify(a)); return;
  }
  const url = b.artifacts?.applicationArchiveUrl || b.artifacts?.buildUrl;
  assert.ok(url && new URL(url).protocol === 'https:');
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  assert.ok(response.ok, `Artifact HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length > 1000000); assert.equal(bytes.subarray(0, 2).toString(), 'PK');
  writeFileSync(dest, bytes, { flag: 'wx' });
  const a = { path: dest, buildId: id, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  writeFileSync(record, JSON.stringify(a, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(a));
})().catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; });
