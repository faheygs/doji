// Download only the exact approved, completed Android artifact. No cloud mutations.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import {createEasReadClient} from './eas-read-client.mts';
import {evidenceRecord} from './release-evidence.mts';
const client=createEasReadClient();
(async () => {
  const id = '35c53463-dedf-4648-b153-c187084ecb39';
  const b = await client.build(id);
  assert.equal(b.status, 'FINISHED'); assert.equal(b.platform, 'ANDROID');
  assert.equal(b.project.id, '064b68b6-f138-4962-8aeb-f00970ba39c8');
  assert.equal(b.appVersion, '1.0.8'); assert.equal(b.appBuildVersion, '24');
  const path = resolve('test-results/mobile-release-20261002/doji-1.0.8-24.aab');
  const record = resolve('test-results/mobile-release-20261002/android-artifact.json');
  if (fs.existsSync(path)) {
    const saved = evidenceRecord(JSON.parse(fs.readFileSync(record, 'utf8')));
    assert.equal(saved.buildId, id);
    assert.equal(createHash('sha256').update(fs.readFileSync(path)).digest('hex'), saved.sha256);
    console.log(JSON.stringify(saved)); return;
  }
  const url = b.artifacts?.applicationArchiveUrl || b.artifacts?.buildUrl;
  assert.ok(url);
  assert.equal(new URL(url).protocol, 'https:');
  const response = await fetch(url); assert.ok(response.ok);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length > 1000000); assert.equal(bytes.subarray(0, 2).toString(), 'PK');
  const evidence = { at: new Date().toISOString(), path, buildId: id, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  fs.writeFileSync(path, bytes, { flag: 'wx' });
  fs.writeFileSync(record, JSON.stringify(evidence, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(evidence));
})().catch(e => { console.error(e.message); process.exitCode = 1; });
