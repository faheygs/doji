// Local release preparation from the CI-qualified snapshot. No cloud mutations.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {evidenceAt,evidenceRecord} from './release-evidence.mts';

const root = resolve('test-results/mobile-release-20261002');
const source = 'C:/Users/gfahe/.codex/worktrees/quality-gates/DoIt';
const candidate = resolve(root, 'upload');
const commit = '316037270239e37961a5948e853197aea3f4d6dd';
const require = createRequire(import.meta.url);
const json = (p:string) => evidenceRecord(JSON.parse(readFileSync(p, 'utf8')));
const hash = (p:string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const save = (name:string, data:unknown) => writeFileSync(resolve(root, name), JSON.stringify(data, null, 2), { flag: 'wx' });
const allowed = ['app', 'assets', 'components', 'constants', 'contexts', 'contracts', 'hooks', 'lib', 'stores', 'types', 'utils', 'scripts/verify-build-env.mjs', 'app.json', 'babel.config.cts', 'eas.json', 'google-services.json', 'index.ts', 'package.json', 'package-lock.json', 'tsconfig.json', '.easignore'];
const git = (args:string[]) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
const mode = process.argv[2];
const walk = (dir:string, prefix = ''):string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  assert.ok(!e.isSymbolicLink());
  if (!prefix && e.name === '.expo') return [];
  return e.isDirectory() ? walk(resolve(dir, e.name), prefix + e.name + '/') : [prefix + e.name];
});
function verify() {
  const raw = json(resolve(root, 'manifest.json'));
  const manifest = {...raw,files:evidenceAt(raw,'files')};
  assert.deepEqual(walk(candidate).sort(), Object.keys(manifest.files).sort());
  for (const [file, digest] of Object.entries(manifest.files)) assert.equal(hash(resolve(candidate, file)), digest, file);
  const app = evidenceAt(json(resolve(candidate, 'app.json')),'expo');
  const eas = json(resolve(candidate, 'eas.json'));
  assert.equal(app.version, '1.0.8'); assert.equal(evidenceAt(app,'ios').buildNumber, '102'); assert.equal(evidenceAt(app,'android').versionCode, 24);
  assert.equal(evidenceAt(app,'ios').bundleIdentifier, 'com.doit.challengeapp'); assert.equal(evidenceAt(app,'android').package, 'com.doit.challengeapp');
  assert.equal(evidenceAt(app,'extra','eas').projectId, '064b68b6-f138-4962-8aeb-f00970ba39c8');
  assert.equal(evidenceAt(eas,'build','production').autoIncrement, false);
  assert.equal(evidenceAt(eas,'build','production','ios').resourceClass, 'm-medium'); assert.equal(evidenceAt(eas,'build','production','android').resourceClass, 'medium');
  return manifest;
}
mkdirSync(root, { recursive: true });
if (mode === 'prepare') {
  assert.ok(!existsSync(candidate), 'Preserve existing candidate');
  assert.equal(git(['status', '--porcelain']), '', 'Qualified checkout must remain clean');
  assert.equal(git(['diff', '--name-only', commit, 'HEAD', '--', ...allowed]), '', 'Source differs from qualified mobile snapshot');
  const files = git(['ls-files', '--', ...allowed]).split('\n');
  for (const file of files) {
    assert.ok(!/(^|\/)\.env|\.(?:pem|key|p8|p12|jks|mobileprovision)$/.test(file), file);
    mkdirSync(dirname(resolve(candidate, file)), { recursive: true });
    copyFileSync(resolve(source, file), resolve(candidate, file));
  }
  const hashes = Object.fromEntries(files.map(f => [f, hash(resolve(candidate, f))]));
  save('qualified-source.json', { at: new Date().toISOString(), commit, files: hashes });
  const old = evidenceAt(json('test-results/android-recovery-23/manifest.json'),'files');
  const changed = files.filter(f => old[f] !== hashes[f]);
  save('changes-from-android-23.json', { changed, removed: Object.keys(old).filter(f => !hashes[f]) });
  console.log(JSON.stringify({ candidate, fileCount: files.length, changed }));
} else if (mode === 'finalize') {
  const original = evidenceAt(json(resolve(root, 'qualified-source.json')),'files');
  assert.deepEqual(walk(candidate).sort(), Object.keys(original).sort());
  for (const [file, digest] of Object.entries(original)) if (!['app.json', 'eas.json'].includes(file)) assert.equal(hash(resolve(candidate, file)), digest, file);
  copyFileSync('.easignore', resolve(candidate, '.easignore'));
  const files = Object.fromEntries(walk(candidate).sort().map(f => [f, hash(resolve(candidate, f))]));
  save('manifest.json', { at: new Date().toISOString(), commit, version: '1.0.8', ios: 102, android: 24, files });
  verify(); console.log('Final candidate frozen.');
} else if (mode === 'bundle') {
  verify();
  const platform = process.argv[3];
  assert.ok(platform && ['ios', 'android'].includes(platform));
  // Use the installed, lockfile-identical qualified dependencies; no environment files enter upload.
  assert.equal(hash(resolve(source, 'package-lock.json')), hash(resolve(candidate, 'package-lock.json')));
  assert.equal(hash('package-lock.json'), hash(resolve(candidate, 'package-lock.json')));
  require('@expo/env').load(resolve('.'), { silent: true });
  const env = { ...process.env, ...evidenceAt(json(resolve(candidate, 'eas.json')),'build','production','env'), CI: '1', SENTRY_DISABLE_AUTO_UPLOAD: 'true' };
  const log = execFileSync(process.execPath, [resolve('node_modules/expo/bin/cli'), 'export', '--platform', platform, '--output-dir', resolve(root, `final-bundle-${platform}`), '--no-bytecode', '--source-maps', '--max-workers', '2'], { cwd: candidate, env, encoding: 'utf8', timeout: 600000, maxBuffer: 8e6 });
  writeFileSync(resolve(root, `final-bundle-${platform}.log`), log, { flag: 'wx' });
  verify();
  console.log(`${platform} candidate production bundle passed.`);
} else if (mode === 'verify') { verify(); console.log('Verified.'); }
else throw new Error('Use prepare, finalize, verify or bundle ios|android');
