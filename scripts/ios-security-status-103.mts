import { createEasReadClient } from './eas-read-client.mts';
const reader = createEasReadClient();
// Read-only exact-build and already scheduled Apple upload status. No retries.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
(async () => {
  const b = await reader.build('42873c98-ce5a-430e-b7f8-ea75033bb023');
  assert.equal(b.project.id, '064b68b6-f138-4962-8aeb-f00970ba39c8');
  assert.equal(b.appVersion, '1.0.8'); assert.equal(b.appBuildVersion, '103'); assert.equal(b.platform, 'IOS');
  const s = await reader.submission('f58203f9-773c-45f5-b8da-de05d1543376');
  const prefix = 'https://expo.dev/accounts/faheybaby/projects/doit-challenge-app';
  const result = { at: new Date().toISOString(), build: { id: b.id, status: b.status, version: b.appVersion, build: b.appBuildVersion, completedAt: b.completedAt, error: b.error, url: `${prefix}/builds/${b.id}` }, appleUpload: { id: s.id, status: s.status, error: s.error, url: `${prefix}/submissions/${s.id}` } };
  writeFileSync('test-results/ios-security-103/latest-status.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
})().catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; });
