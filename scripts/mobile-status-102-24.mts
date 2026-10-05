import { createEasReadClient } from './eas-read-client.mts';
const reader = createEasReadClient();
// Read-only status of the exact October 2 builds and already scheduled Apple upload.
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
(async () => {
  const ids = { ios: '8ea6d259-a652-4a20-9df0-6666a0921c5c', android: '35c53463-dedf-4648-b153-c187084ecb39' };
  const builds = await Promise.all(Object.entries(ids).map(async ([platform, id]) => {
    const b = await reader.build(id);
    assert.equal(b.project.id, '064b68b6-f138-4962-8aeb-f00970ba39c8');
    assert.equal(b.appVersion, '1.0.8'); assert.equal(b.appBuildVersion, platform === 'ios' ? '102' : '24');
    return { id, platform, status: b.status, version: b.appVersion, build: b.appBuildVersion, completedAt: b.completedAt, error: b.error, url: `https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/${id}` };
  }));
  const s = await reader.submission('18fd36af-7634-49bb-a9b2-44d06a79626f');
  const result = { at: new Date().toISOString(), builds, appleUpload: { id: s.id, status: s.status, error: s.error, url: `https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/submissions/${s.id}` } };
  writeFileSync('test-results/mobile-release-20261002/latest-status.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})().catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; });
