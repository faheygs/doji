// Read-only EAS check; optional exact AAB download. Never builds/submits/retries.
const { createHash } = require('node:crypto');
const { writeFileSync, existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const base = 'C:/Users/gfahe/AppData/Roaming/npm/node_modules/eas-cli/build';
const SessionManager = require(`${base}/user/SessionManager`).default;
const { createGraphqlClient } = require(`${base}/commandUtils/context/contextUtils/createGraphqlClient`);
const { BuildQuery } = require(`${base}/graphql/queries/BuildQuery`);
const session = new SessionManager({ setActor() {} });
const client = createGraphqlClient({ accessToken: session.getAccessToken(), sessionSecret: session.getSessionSecret() });
const id = '289458a9-0586-49ff-90cd-3a6dac396c99';
const root = resolve('test-results/android-recovery-23');
(async () => {
  assert.ok(!process.argv[2] || process.argv[2] === '--download');
  const b = await BuildQuery.byIdAsync(client, id, { useCache: false });
  assert.equal(b.project.id, '064b68b6-f138-4962-8aeb-f00970ba39c8');
  assert.equal(b.appVersion, '1.0.8'); assert.equal(b.appBuildVersion, '23');
  assert.equal(b.platform, 'ANDROID');
  const result = { at: new Date().toISOString(), id, status: b.status, version: b.appVersion, build: b.appBuildVersion, completedAt: b.completedAt, queuePosition: b.queuePosition, error: b.error, url: `https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/${id}` };
  writeFileSync(resolve(root, 'latest-status.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (process.argv[2] !== '--download') return;
  assert.equal(b.status, 'FINISHED', 'Wait for the exact finished artifact');
  const dest = resolve(root, 'doji-1.0.8-23.aab');
  const record = resolve(root, 'android-artifact.json');
  if (existsSync(dest)) {
    const a = JSON.parse(readFileSync(record, 'utf8'));
    assert.equal(a.buildId, id);
    assert.equal(createHash('sha256').update(readFileSync(dest)).digest('hex'), a.sha256);
    console.log(JSON.stringify(a)); return;
  }
  const url = b.artifacts?.applicationArchiveUrl || b.artifacts?.buildUrl;
  assert.ok(url && new URL(url).protocol === 'https:');
  const response = await fetch(url); assert.ok(response.ok, `Artifact HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length > 1000000); assert.equal(bytes.subarray(0, 2).toString(), 'PK');
  writeFileSync(dest, bytes, { flag: 'wx' });
  const a = { path: dest, buildId: id, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  writeFileSync(record, JSON.stringify(a, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(a));
})().catch(e => { console.error(e.message); process.exitCode = 1; });
