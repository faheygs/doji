import { test, expect } from '../../coverage-fixture.mts';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  browserSourcePath,
  compileBrowserSource,
  readBrowserSource,
} from '../../browser-source.mts';
import { instrument } from '../../../scripts/coverage-instrument.mts';

// DOM-unit boundaries only. No auth transport, accounts or provider calls.
const asset = 'admin-portal/auth-journey.js';
const path = browserSourcePath(asset);
const source =
  process.env.DOJI_BROWSER_COVERAGE === '1'
    ? compileBrowserSource(asset, instrument(readFileSync(path, 'utf8'), path).code)
    : readBrowserSource(asset);
const markup = `<section id="portalAuth"><h2 id="adminAuthTitle" tabindex="-1">Initial</h2>
  <p id="adminAuthDescription"></p><ol><li data-auth-step>Sign in</li><li data-auth-step>Verify</li><li data-auth-step>Workspace</li></ol>
  <form id="form"><input id="adminPassword" type="password"><button id="adminPasswordToggle" type="button">Show</button>
  <input id="code" autocomplete="one-time-code"><input id="disabled" disabled><button type="submit">Sign in</button></form>
  <img id="adminTotpQr" alt=""><code id="adminTotpSecret"></code></section>`;
async function mount(page: Page, html = markup, portal = 'admin') {
  // Navigate so the normal per-document coverage hook is installed as well.
  const url = 'http://127.0.0.1:4211/__auth-journey-unit';
  await page.route(url, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<body data-portal="${portal}">${html}</body>`,
    }),
  );
  await page.goto(url);
  await page.addScriptTag({ content: source });
}
for (const [name, html, portal] of [
  ['business page', markup, 'business'],
  ['missing auth section', '', 'admin'],
  [
    'missing heading',
    '<section id="portalAuth"><p id="adminAuthDescription"></p></section>',
    'admin',
  ],
  [
    'missing description',
    '<section id="portalAuth"><h2 id="adminAuthTitle"></h2></section>',
    'admin',
  ],
] as const) {
  test(`journey does not attach to ${name}`, async ({ page }) => {
    await mount(page, html, portal);
    expect(await page.evaluate(() => window.DojiAdminJourney)).toBeUndefined();
  });
}
test('unknown phases cannot alter the flow and busy restores original disabled controls', async ({
  page,
}) => {
  await mount(page);
  await page.evaluate(() => {
    window.DojiAdminJourney!.phase('toString');
    window.DojiAdminJourney!.phase('unknown');
  });
  await expect(page.locator('#adminAuthTitle')).toHaveText('Initial');
  await page.evaluate(() => {
    const form = document.querySelector<HTMLFormElement>('#form')!;
    const finish = window.DojiAdminJourney!.busy(form, 'Waiting');
    if (!form.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled)
      throw Error('Busy did not disable submission');
    finish();
    form.querySelector('[type="submit"]')!.remove();
    window.DojiAdminJourney!.busy(form, 'No submit')();
  });
  await expect(page.locator('#disabled')).toBeDisabled();
  await expect(page.locator('#adminPassword')).toBeEnabled();
  await expect(page.locator('#form')).not.toHaveAttribute('aria-busy');
});
test('visibility hides a revealed password and locking erases enrollment secrets', async ({
  page,
}) => {
  await mount(page);
  await page.locator('#adminPassword').fill('synthetic-only');
  await page.locator('#adminPasswordToggle').click();
  await expect(page.locator('#adminPassword')).toHaveAttribute('type', 'text');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#adminPassword')).toHaveAttribute('type', 'text');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    document.querySelector('#adminTotpSecret')!.textContent = 'synthetic-secret';
    window.DojiAdminJourney!.phase('locked', true);
  });
  await expect(page.locator('#adminPassword')).toHaveAttribute('type', 'password');
  await expect(page.locator('#adminPassword')).toHaveValue('');
  await expect(page.locator('#adminTotpSecret')).toBeEmpty();
  await expect(page.locator('#adminAuthTitle')).toBeFocused();
});
test('partial optional controls do not prevent safe phase transitions', async ({ page }) => {
  await mount(
    page,
    markup
      .replace('<input id="adminPassword" type="password">', '')
      .replace('<code id="adminTotpSecret"></code>', ''),
  );
  await page.locator('#adminPasswordToggle').click();
  await page.evaluate(() => window.DojiAdminJourney!.phase('credentials'));
  await expect(page.locator('#adminAuthTitle')).toHaveText('Admin sign in');
  await page.locator('#adminPasswordToggle').evaluate((node) => node.remove());
});
test('a view without a password toggle can still clear secrets', async ({ page }) => {
  await mount(
    page,
    markup.replace('<button id="adminPasswordToggle" type="button">Show</button>', ''),
  );
  await page.locator('#adminPassword').fill('synthetic-only');
  await page.evaluate(() => window.DojiAdminJourney!.clearSecrets());
  await expect(page.locator('#adminPassword')).toHaveValue('');
});
