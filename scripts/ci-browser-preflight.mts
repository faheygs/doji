// Local launch only. No navigation, credentials, OS installation or provider calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { BrowserType } from '@playwright/test';
import { validateBrowserCompatibility, validateBrowserImage } from './ci-browser-policy.mts';

const root = resolve(import.meta.dirname, '..');
const job = process.argv[2];
assert.ok(job === 'web-migration' || job === 'coverage', 'Expected browser CI job name');
const roots = job === 'coverage' ? [root, resolve(root, 'web')] : [resolve(root, 'web')];
const clients = roots.map((directory) => {
  const require = createRequire(resolve(directory, 'package.json'));
  const lock = JSON.parse(readFileSync(resolve(directory, 'package-lock.json'), 'utf8'));
  const version = lock.packages['node_modules/@playwright/test'].version as string;
  assert.equal(
    require('@playwright/test/package.json').version,
    version,
    'Run npm ci for this lock',
  );
  assert.equal(require('playwright-core/package.json').version, version);
  return {
    version,
    chromium: (require('@playwright/test') as { chromium: BrowserType }).chromium,
    manifest: JSON.parse(
      readFileSync(resolve(directory, 'node_modules/playwright-core/browsers.json'), 'utf8'),
    ),
  };
});
validateBrowserImage(
  readFileSync(resolve(root, '.github/workflows/quality.yml'), 'utf8'),
  job,
  clients[0]!.version,
);
if (clients[1]) validateBrowserCompatibility(clients[0]!.manifest, clients[1].manifest);
assert.equal(process.env.PLAYWRIGHT_BROWSERS_PATH, '/ms-playwright', 'Use the qualified CI image');
assert.equal(
  process.env.DOJI_TEST_BROWSER_CHANNEL,
  undefined,
  'Do not substitute a host browser in CI',
);
for (const client of clients) {
  const browser = await client.chromium.launch({
    headless: true,
    timeout: 20_000,
    args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'],
  });
  try {
    const page = await browser.newPage();
    assert.equal(await page.evaluate(() => 2 + 2), 4);
    console.log(`PASS: locked Playwright ${client.version}, bundled Chromium ${browser.version()}`);
  } finally {
    await browser.close();
  }
}
