// Isolated build-102 replacement: decoder dependency only, no Android overlays.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {evidenceRecord,evidenceAt,evidenceStrings} from './release-evidence.mts';
const require = createRequire(import.meta.url);
const root = resolve('test-results/ios-security-103');
const candidate = resolve(root, 'upload');
const baseline = resolve('test-results/mobile-release-20261002');
const json = (p:string) => evidenceRecord(JSON.parse(readFileSync(p, 'utf8')));
const hash = (p:string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const save = (name:string, value:unknown) => writeFileSync(resolve(root, name), JSON.stringify(value, null, 2), { flag: 'wx' });
const extras = ['vendor/decode-uri-component-compat/package.json', 'vendor/decode-uri-component-compat/index.cjs', 'vendor/decode-uri-component-compat/README.md'];
const walk = (path:string, prefix = ''):string[] => readdirSync(path, { withFileTypes: true }).flatMap(e => {
  if (!prefix && ['node_modules', '.expo'].includes(e.name)) return [];
  assert.ok(!e.isSymbolicLink());
  return e.isDirectory() ? walk(resolve(path, e.name), prefix + e.name + '/') : [prefix + e.name];
});
function verify() {
  const raw = json(resolve(root, 'manifest.json'));
  const manifest = {...raw,files:evidenceAt(raw,'files')};
  assert.deepEqual(walk(candidate).sort(), Object.keys(manifest.files).sort());
  for (const [file, digest] of Object.entries(manifest.files)) assert.equal(hash(resolve(candidate, file)), digest, file);
  const app = json(resolve(candidate, 'app.json'));
  const old = json(resolve(baseline, 'upload/app.json'));
  evidenceAt(old,'expo','ios').buildNumber = '103'; assert.deepEqual(app, old);
  assert.equal(evidenceAt(app,'expo').version, '1.0.8');
  assert.equal(evidenceAt(app,'expo','ios').bundleIdentifier, 'com.doit.challengeapp');
  assert.equal(evidenceAt(json(resolve(candidate, 'eas.json')),'build','production','ios').resourceClass, 'm-medium');
  return manifest;
}
mkdirSync(root, { recursive: true });
const mode = process.argv[2];
if (mode === 'prepare') {
  assert.ok(!existsSync(candidate), 'Preserve candidate');
  const old = {files:evidenceAt(json(resolve(baseline, 'manifest.json')),'files')};
  const currentPackage = json('package.json');
  const originalPackage = json(resolve(baseline, 'upload/package.json'));
  evidenceAt(originalPackage,'dependencies')['decode-uri-component'] = 'file:vendor/decode-uri-component-compat';
  evidenceAt(originalPackage,'overrides')['decode-uri-component'] = '$decode-uri-component';
  assert.deepEqual(currentPackage, originalPackage, 'Unexpected package changes');
  const oldLock = {packages:evidenceAt(json(resolve(baseline, 'upload/package-lock.json')),'packages')};
  const newLock = {packages:evidenceAt(json('package-lock.json'),'packages')};
  const delta = [...new Set([...Object.keys(oldLock.packages), ...Object.keys(newLock.packages)])].filter(k => JSON.stringify(oldLock.packages[k]) !== JSON.stringify(newLock.packages[k]));
  assert.deepEqual(delta.sort(), ['', 'node_modules/decode-uri-component', 'node_modules/decode-uri-component-upstream', 'vendor/decode-uri-component-compat'].sort());
  for (const [file, digest] of Object.entries(old.files)) {
    const source = resolve(baseline, 'upload', file);
    assert.equal(hash(source), digest, `Frozen 102 changed: ${file}`);
    mkdirSync(dirname(resolve(candidate, file)), { recursive: true }); copyFileSync(source, resolve(candidate, file));
  }
  for (const file of ['package.json', 'package-lock.json', ...extras]) {
    mkdirSync(dirname(resolve(candidate, file)), { recursive: true }); copyFileSync(file, resolve(candidate, file));
  }
  const app = json(resolve(candidate, 'app.json')); evidenceAt(app,'expo','ios').buildNumber = '103';
  writeFileSync(resolve(candidate, 'app.json'), JSON.stringify(app, null, 2) + '\n');
  const ignore = resolve(candidate, '.easignore');
  writeFileSync(ignore, readFileSync(ignore, 'utf8').replace('!/utils', '!/utils\n!/vendor\n/vendor/*\n!/vendor/decode-uri-component-compat'));
  const files = Object.fromEntries(walk(candidate).sort().map(f => [f, hash(resolve(candidate, f))]));
  const changed = Object.keys(files).filter(f => old.files[f] !== files[f]);
  assert.deepEqual(changed.sort(), ['app.json', 'package.json', 'package-lock.json', '.easignore', ...extras].sort());
  save('manifest.json', { at: new Date().toISOString(), baseline: 'iOS 102 / 8ea6d259-a652-4a20-9df0-6666a0921c5c', ios: 103, version: '1.0.8', files, changed, lockDelta: delta });
  verify(); console.log(JSON.stringify({ prepared: true, changed }));
} else if (mode === 'bundle') {
  verify(); require('@expo/env').load(resolve('.'), { silent: true });
  assert.ok(existsSync(resolve(candidate, 'node_modules/expo/bin/cli')), 'Install exact candidate dependencies first');
  const log = execFileSync(process.execPath, [resolve(candidate, 'node_modules/expo/bin/cli'), 'export', '--platform', 'ios', '--output-dir', resolve(root, 'bundle-ios'), '--no-bytecode', '--source-maps', '--max-workers', '2'], {
    cwd: candidate, env: { ...process.env, ...evidenceAt(json(resolve(candidate, 'eas.json')),'build','production','env'), CI: '1', SENTRY_DISABLE_AUTO_UPLOAD: 'true' }, encoding: 'utf8', timeout: 600000, maxBuffer: 8e6 });
  writeFileSync(resolve(root, 'bundle-ios.log'), log, { flag: 'wx' }); verify();
  const maps = walk(resolve(root, 'bundle-ios')).filter(p => p.endsWith('.map'));
  assert.ok(maps.length > 0);
  const sources = maps.flatMap(p => { const m = json(resolve(root, 'bundle-ios', p)); const names=evidenceStrings(m.sources),contents=evidenceStrings(m.sourcesContent); assert.equal(names.length,contents.length); return names.map((s, i) => ({ name: s, content: contents[i]! })); });
  const decoder = sources.filter(s => /decode-uri-component-upstream\/index.js$/.test(s.name));
  assert.equal(decoder.length, 1);
  assert.ok(decoder[0]!.content.includes('function utf8SequenceLength'));
  assert.ok(!sources.some(s => s.content?.includes('function decodeComponents(components, split)')));
  assert.ok(sources.some(s => /decode-uri-component-compat\/index.cjs$/.test(s.name)));
  save('bundle-proof.json', { at: new Date().toISOString(), platform: 'ios', patchedDecoderBundled: true, recursiveDecoderAbsent: true, upstreamSourceSha256: createHash('sha256').update(decoder[0]!.content).digest('hex') });
  console.log('Exact isolated iOS bundle contains upstream 0.5.0 and adapter, no old recursive decoder.');
} else if (mode === 'verify') { verify(); console.log('Frozen iOS 103 candidate verified.'); }
else throw new Error('Use prepare, bundle or verify');
