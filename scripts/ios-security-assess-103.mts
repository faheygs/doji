// Read-only assessment of the immutable iOS 103 candidate and its existing job.
// Writes only bounded, non-sensitive evidence; never installs, builds or submits.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type {BinaryLike} from 'node:crypto';
import {createRequire} from 'node:module';
import {createEasReadClient} from './eas-read-client.mts';
import {evidenceRecord,evidenceAt,evidenceText,evidenceStrings} from './release-evidence.mts';
const require=createRequire(import.meta.url);
const root = path.resolve('test-results/ios-security-103');
const candidate = path.join(root, 'upload');
const json = (p:string) => evidenceRecord(JSON.parse(fs.readFileSync(p, 'utf8')));
const sha = (v:BinaryLike) => crypto.createHash('sha256').update(v).digest('hex');
const manifest = json(path.join(root, 'manifest.json'));
const mismatches = Object.entries(evidenceRecord(manifest.files)).filter(([p, hash]) =>
  sha(fs.readFileSync(path.join(candidate, p))) !== hash).map(([p]) => p);
assert.deepEqual(mismatches, [], 'Frozen candidate changed');
const lock = json(path.join(candidate, 'package-lock.json'));
const app = evidenceAt(json(path.join(candidate, 'app.json')),'expo');
const eas = json(path.join(candidate, 'eas.json'));
assert.equal(evidenceAt(app,'ios').buildNumber, '103');
assert.equal(app.version, '1.0.8');
assert.equal(evidenceAt(eas,'build','production').developmentClient, undefined);
const updates=app.updates==null?{}:evidenceRecord(app.updates);
assert.equal(updates.codeSigningCertificate, undefined);
assert.equal(updates.url, undefined);
const mapDir = path.join(root, 'bundle-ios/_expo/static/js/ios');
const mapFiles = fs.readdirSync(mapDir).filter(p => p.endsWith('.map'));
assert.equal(mapFiles.length, 1);
const mapBytes = fs.readFileSync(path.join(mapDir, evidenceText(mapFiles[0])));
const map = evidenceRecord(JSON.parse(mapBytes.toString('utf8')));
const sources = evidenceStrings(map.sources).map(s => s.replaceAll('\\', '/'));
const names = ['brace-expansion', 'braces', 'http-cache-semantics', 'js-yaml', 'node-forge'];
const packages = names.map(name => ({ name,
  installed: Object.entries(evidenceAt(lock,'packages')).filter(([p]) => p.endsWith('node_modules/' + name))
    .map(([p, v]) => ({ path: p, version: evidenceRecord(v).version })),
  directParents: Object.entries(evidenceAt(lock,'packages')).map(([p,v])=>({path:p,value:evidenceRecord(v)})).filter(({value:v}) => v.dependencies!=null && evidenceRecord(v.dependencies)[name])
    .map(({path:p,value:v}) => ({ path: p, version: v.version, requested: evidenceAt(v,'dependencies')[name] })),
  runtimeSources: sources.filter(p => p.includes('/node_modules/' + name + '/')),
}));
for (const p of packages) assert.equal(p.runtimeSources.length, 0, p.name + ' bundled');
const ablySources = sources.filter(s => s.includes('/node_modules/ably/'));
assert(ablySources.some(s => s.endsWith('/build/ably-reactnative.js')));
assert(!ablySources.some(s => s.endsWith('/build/ably-node.js')));
const got:unknown = require(path.join(candidate, 'node_modules/got'));
assert.ok(got!==null&&(typeof got==='function'||typeof got==='object')&&'defaults' in got,'Candidate HTTP client defaults missing');
assert.equal(evidenceAt(got.defaults,'options').cache, undefined);
const result:Record<string,unknown> = { at: new Date().toISOString(),
  candidateFilesVerified: Object.keys(evidenceRecord(manifest.files)).length,
  lockSha256: sha(fs.readFileSync(path.join(candidate, 'package-lock.json'))),
  localIosSourceMapSha256: sha(mapBytes), sourceCount: sources.length,
  packages, ablySources, gotDefaultCacheEnabled: false,
  productionDevelopmentClient: false, configuredOtaUpdateUrl: false,
  configuredJsManifestSigning: false,
  limitation: 'Local exact-candidate export, not a byte-for-byte extraction of the signed IPA. Static reachability assessment, not a supply-chain attestation.' };

async function cloud() {
  const b = await createEasReadClient().buildAssessment('42873c98-ce5a-430e-b7f8-ea75033bb023');
  assert.equal(b.project.id, '064b68b6-f138-4962-8aeb-f00970ba39c8');
  assert.equal(b.appBuildVersion, '103'); assert.equal(b.appVersion, '1.0.8');
  assert.equal(b.platform, 'IOS'); assert.equal(b.status, 'FINISHED');
  assert.equal(b.buildProfile, 'production');
  assert(b.logFiles.length > 0 && b.logFiles.length <= 30);
  const phases = new Set<string>(); const logs = []; let total = 0;
  const flags = { npmCi: false, environmentGuard: false, hermes: false,
    fastlane: false, archiveSucceeded: false, codeSign: false };
  for (const url of b.logFiles) {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    assert(response.ok, 'Build log unavailable');
    assert.ok(response.body);const reader = response.body.getReader(); const chunks:Uint8Array[] = []; let size = 0; let truncated = false;
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      if (size + value.length > 4e6 || total + value.length > 12e6) {
        truncated = true; await reader.cancel(); break;
      }
      size += value.length; total += value.length;
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks); const text = bytes.toString('utf8');
    logs.push({ capturedBytes: size, capturedSha256: sha(bytes), truncated });
    for (const line of text.split('\n')) {
      let entry; try { entry = evidenceRecord(JSON.parse(line)); } catch { continue; }
      if (typeof entry.phase === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(entry.phase)) phases.add(entry.phase);
    }
    flags.npmCi ||= /npm ci/.test(text);
    flags.environmentGuard ||= /Production build environment verified/.test(text);
    flags.hermes ||= /hermes/i.test(text);
    flags.fastlane ||= /fastlane|gym/.test(text);
    flags.archiveSucceeded ||= /ARCHIVE SUCCEEDED|Successfully exported and compressed dSYM/.test(text);
    flags.codeSign ||= /CodeSign|codesign/.test(text);
  }
  result.cloud = { id: b.id, status: b.status, buildProfile: b.buildProfile,
    distribution: b.distribution, completedAt: b.completedAt, phases: [...phases], flags, logs };
}
(async () => {
  if (process.argv.includes('--cloud')) await cloud();
  fs.writeFileSync(path.join(root, 'advisory-assessment-evidence.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
})().catch(e => { console.error(e.message); process.exitCode = 1; });
