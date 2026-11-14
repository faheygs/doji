import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadBrowserClient } from './ci-browser-preflight.mts';
import {
  browserJob,
  validateBrowserCompatibility,
  validateBrowserImage,
} from './ci-browser-policy.mts';

const workflow = readFileSync(new URL('../.github/workflows/quality.yml', import.meta.url), 'utf8');
const lockedVersion = (path: string): string =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')).packages[
    'node_modules/@playwright/test'
  ].version;

test('preflight loads both real locked clients without registering competing test runners', () => {
  const root = loadBrowserClient(fileURLToPath(new URL('../', import.meta.url)));
  const web = loadBrowserClient(fileURLToPath(new URL('../web/', import.meta.url)));
  assert.equal(root.version, lockedVersion('../package-lock.json'));
  assert.equal(web.version, lockedVersion('../web/package-lock.json'));
  assert.equal(root.chromium.name(), 'chromium');
  assert.equal(web.chromium.name(), 'chromium');
  validateBrowserCompatibility(root.manifest, web.manifest);
});

test('both browser images match their separate locked clients and immutable digests', () => {
  validateBrowserImage(workflow, 'web-migration', lockedVersion('../web/package-lock.json'));
  validateBrowserImage(workflow, 'coverage', lockedVersion('../package-lock.json'));
});

test('missing, mutable, mismatched and download-dependent images fail closed', () => {
  const version = lockedVersion('../web/package-lock.json');
  assert.throws(() => validateBrowserImage('', 'web-migration', version));
  assert.throws(() =>
    validateBrowserImage(workflow.replace(/@sha256:[a-f0-9]+/g, ''), 'web-migration', version),
  );
  assert.throws(() => validateBrowserImage(workflow, 'web-migration', '0.0.0'));
  for (const replacement of [
    'npx playwright install --with-deps chromium',
    'apt-get update',
    'continue-on-error: true',
  ]) {
    assert.throws(() =>
      validateBrowserImage(
        workflow.replace('npm run check', replacement),
        'web-migration',
        version,
      ),
    );
  }
});

test('coverage rejects incompatible or missing secondary browser revisions', () => {
  const manifest = {
    browsers: ['chromium', 'chromium-headless-shell', 'ffmpeg'].map((name) => ({
      name,
      revision: '1',
    })),
  };
  validateBrowserCompatibility(manifest, structuredClone(manifest));
  assert.throws(() => validateBrowserCompatibility(manifest, { browsers: [] }));
  const changed = structuredClone(manifest);
  changed.browsers[0]!.revision = '2';
  assert.throws(() => validateBrowserCompatibility(manifest, changed));
});

test('required suites, coverage gate and diagnostic upload remain mandatory', () => {
  const web = browserJob(workflow, 'web-migration');
  for (const command of [
    'npm run check',
    'npm run build:connected',
    'npm run test:connected-artifacts',
    'npm run test:browser -- --global-timeout=600000',
    'npm run test:admin-staging:browser -- --global-timeout=180000',
    'npm run test:admin-staging --prefix ..',
    'scripts/test-admin-release-ci.mts',
    'npm audit --audit-level=high',
  ]) {
    assert.ok(web.includes(command), `Missing mandatory ${command}`);
  }
  assert.match(web, /if: always\(\)/);
  assert.match(web, /web\/test-results\//);
  assert.match(browserJob(workflow, 'coverage'), /run: npm run test:coverage/);
  assert.match(workflow, /node --test scripts\/test-ci-browser-policy\.mts/);
  assert.match(workflow, /  application:/);
  assert.match(workflow, /  database:/);
});
