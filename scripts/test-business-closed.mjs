// Local headless qualification of the exact closed artifact; no external requests.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { inventory } from './prepare-safety-launch.mjs';
const folder = process.argv[2];
assert.match(folder || '', /^test-results\/business-closed-[A-Za-z0-9]+$/);
const candidate = JSON.parse(await readFile(`${folder}/candidate.json`, 'utf8'));
assert.deepEqual(await inventory(`${folder}/public`), candidate.assets);
const server = spawn(process.execPath, ['website/test-admin-server.mjs'], {
  env: { ...process.env, DOJI_ADMIN_TEST_ROOT: resolve(folder, 'public'), DOJI_ADMIN_TEST_PORT: '4192' },
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
let browser;
const results = [];
try {
  await new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(Error('Local server did not start')), 10000);
    server.stdout.once('data', () => { clearTimeout(timer); ok(); });
    server.once('error', fail);
    server.once('exit', () => fail(Error('Local server exited')));
  });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const external = [], errors = [];
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin !== 'http://127.0.0.1:4192') {
        external.push(route.request().url()); return route.abort();
      }
      return route.continue();
    });
    page.on('pageerror', e => errors.push(e.message));
    const response = await page.goto('http://127.0.0.1:4192/');
    assert.equal(response.status(), 200);
    assert.match(response.headers()['content-security-policy'], /connect-src 'none'/);
    assert.match(response.headers()['content-security-policy'], /form-action 'none'/);
    assert.equal(await page.locator('form,input,iframe').count(), 0);
    assert.match(await page.locator('main').innerText(), /aren't open yet/);
    assert.equal(await page.getByRole('link', { name: 'Back to Doji', exact: true }).getAttribute('href'), 'https://dojipro.com/');
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const action = await page.locator('.applicationActions').evaluate(el => getComputedStyle(el).justifyContent);
      assert.equal(action, 'flex-end');
      await page.screenshot({ path: `${folder}/${width}-${theme}.png`, fullPage: true });
      results.push(`${width}px ${theme}: closed, no forms, right-aligned CTA, no overflow`);
    }
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    await page.close();
  }
  await writeFile(`${folder}/qualification.json`, JSON.stringify({ passed: true, assets: candidate.assets, results, noExternalRequests: true }, null, 2));
  console.log(JSON.stringify({ passed: true, results, noExternalRequests: true }));
} finally {
  await browser?.close();
  server.kill();
}
