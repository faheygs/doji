import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext, Script } from 'node:vm';
import {
  browserSourcePath,
  browserAssetPath,
  compileBrowserSource,
  readBrowserSource,
  isTypedBrowserAsset,
} from './browser-source.mts';
import * as health from './admin-portal/health-model.mts';
import { applicationForm } from './business-portal/application-form.mts';
import { instrument } from '../scripts/coverage-instrument.mts';

const asset = 'admin-portal/health-model.js';

test('business prototype uses the shared typed theme source without inline JavaScript', () => {
  const html = readFileSync(new URL('./business-portal/index.html', import.meta.url), 'utf8');
  assert.match(html, /<script src="\/theme-init\.js"><\/script>/);
  assert.doesNotMatch(html, /<script>\s*\S/);
  assert.match(browserSourcePath('theme-init.js'), /theme-init\.mts$/);
  const runtime = readBrowserSource('theme-init.js');
  for (const stored of ['dark', 'light', null]) {
    const document = { documentElement: { dataset: { theme: '' } } };
    runInNewContext(runtime, { document, localStorage: { getItem: () => stored } });
    assert.equal(document.documentElement.dataset.theme, stored || 'light');
  }
  const document = { documentElement: { dataset: { theme: '' } } };
  runInNewContext(runtime, {
    document,
    localStorage: { getItem: () => { throw Error('Synthetic storage denial'); } },
  });
  assert.equal(document.documentElement.dataset.theme, 'light');
});

test('type-only browser contracts need no public asset and are erased from runtime', () => {
  const code = compileBrowserSource(
    'admin-portal/safety-removal.js',
    "import type {SafetyCase} from './safety-contracts.d.mts'; const item: Pick<SafetyCase,'id'> = {id:'synthetic'}; window.name=item.id;",
  );
  assert.doesNotMatch(code, /safety-contracts|SafetyCase|\bimport\b/);
  const window = { name: '' };
  runInNewContext(code, { window });
  assert.equal(window.name, 'synthetic');
});
test('safety source compilation preserves disabled configuration, taxonomy and alias gate', () => {
  const sandbox: { window: Record<string, unknown> } = { window: {} };
  runInNewContext(readBrowserSource('safety-removal/config.js'), sandbox);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.window.DOJI_SAFETY_CONFIG)), {
    enabled: false,
    endpoint: '',
    siteKey: '',
  });
  assert.ok(Object.isFrozen(sandbox.window.DOJI_SAFETY_CONFIG));
  runInNewContext(readBrowserSource('safety-removal/taxonomy.js'), sandbox);
  const catalog = sandbox.window.DojiReportTaxonomy;
  assert.ok(Array.isArray(catalog));
  assert.equal(catalog.length, 10);
  for (const hostname of [
    'www.dojipro.com',
    'doji-site.pages.dev',
    'preview.doji-site.pages.dev',
  ]) {
    let destination: string | undefined;
    runInNewContext(readBrowserSource('safety-removal/form.js'), {
      window: { DOJI_SAFETY_CONFIG: { enabled: true } },
      location: {
        hostname,
        replace(value: string) {
          destination = value;
        },
      },
    });
    assert.equal(destination, 'https://dojipro.com/safety-removal/');
  }
});
test('typed sources retain public URLs including the shared portal controller', () => {
  assert.equal(browserAssetPath('admin-portal/health-model.mts'), asset);
  assert.match(browserSourcePath(asset), /health-model\.mts$/);
  assert.equal(browserAssetPath('portal.js'), 'portal.js');
  assert.equal(browserAssetPath('portal.mts'), 'portal.js');
  assert.equal(isTypedBrowserAsset('portal.js'), true);
  assert.match(browserSourcePath('portal.js'), /portal\.mts$/);
  const runtime = readBrowserSource('portal.js');
  assert.match(runtime, /dataset\.portal/);
  assert.doesNotMatch(runtime, /import type/);
  new Script(runtime);
});
test('reject traversal, absolute paths and unregistered TypeScript assets', () => {
  for (const path of [
    '../private.js',
    '/absolute.js',
    'C:/private.js',
    'a//b.js',
    './a.js',
    'a/../b.js',
    'a\\..\\b.js',
    'unknown.mts',
  ]) {
    assert.throws(() => browserSourcePath(path), /Invalid browser asset/);
    assert.throws(() => browserAssetPath(path), /Invalid browser asset/);
  }
});
test('compiled classic script exposes frozen API with native TypeScript parity', () => {
  const window: Record<string, unknown> = {};
  const code = readBrowserSource(asset);
  assert.doesNotMatch(code, /^export\s/m);
  runInNewContext(code, { window });
  const api = window.DojiPortalHealth;
  assert.ok(api && typeof api === 'object');
  assert.ok(Object.isFrozen(api));
  assert.ok('evaluate' in api && typeof api.evaluate === 'function');
  // JSON normalization removes VM realm prototypes, not observable values.
  const normalize = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
  for (const input of [{}, { now: 0, operational: { available: false } }]) {
    assert.deepEqual(
      normalize(Reflect.apply(api.evaluate, api, [input])),
      normalize(health.evaluate(input)),
    );
  }
  assert.ok('reviewQueue' in api && typeof api.reviewQueue === 'function');
  assert.deepEqual(
    normalize(Reflect.apply(api.reviewQueue, api, [[], 0, 0])),
    normalize(health.reviewQueue([], 0, 0)),
  );
});
test('browser instrumentation measures maintained TS, not generated JS', () => {
  const source = browserSourcePath(asset);
  const instrumented = instrument(readFileSync(source, 'utf8'), source);
  const sandbox: Record<string, unknown> = { window: {} };
  runInNewContext(compileBrowserSource(asset, instrumented.code), sandbox);
  const coverage = sandbox.__coverage__;
  assert.ok(coverage && typeof coverage === 'object');
  assert.deepEqual(Object.keys(coverage), [source]);
});

test('browser modules retain native exports and safe renderer parity after compilation', async () => {
  const code = readBrowserSource('business-portal/application-form.js');
  assert.match(code, /export\s*\{/);
  const module: unknown = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  );
  assert.ok(module && typeof module === 'object' && 'applicationForm' in module);
  assert.equal(typeof module.applicationForm, 'function');
  assert.ok(typeof module.applicationForm === 'function');
  const details = { legal_name: '<script>alert(1)</script>', category: 'Technology' };
  assert.equal(
    Reflect.apply(module.applicationForm, undefined, [details]),
    applicationForm(details),
  );
  for (const asset of ['business-mfa', 'business-verification', 'business-realtime']) {
    assert.match(readBrowserSource(`business-portal/${asset}.js`), /export\s*\{/);
  }
});

test('module imports keep public JavaScript URLs without changing ordinary text', () => {
  const asset = 'business-portal/access/access.js';
  const output = compileBrowserSource(
    asset,
    `
    import { createBusinessApplicationClient } from '../application-client.mts';
    export { applicationForm } from '../application-form.mts';
    export const text = '../application-form.mts';
    export const client = createBusinessApplicationClient;
  `,
  );
  assert.match(output, /from "\.\.\/application-client\.js"/);
  assert.match(output, /from "\.\.\/application-form\.js"/);
  assert.match(output, /text = "\.\.\/application-form\.mts"/);
  assert.throws(
    () => compileBrowserSource(asset, `import '../unknown.mts';`),
    /Unregistered browser module/,
  );
  assert.throws(
    () => compileBrowserSource(asset, `export * from '../../../private.mts';`),
    /Unregistered browser module/,
  );
  for (const name of ['access/access', 'application/application']) {
    const code = readBrowserSource(`business-portal/${name}.js`);
    assert.doesNotMatch(code, /from ["'][^"']+\.mts["']/);
    assert.match(code, /application-client\.js/);
  }
});
