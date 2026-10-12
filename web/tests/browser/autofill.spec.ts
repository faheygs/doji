import { expect, test } from '@playwright/test';
import { installBusinessFixture } from './business-fixture';

test('employee autofill uses the neutral surface without changing input behavior', async ({
  page,
  request,
}, testInfo) => {
  const fixture = await installBusinessFixture(page, request);
  await page.route('**/api/session', (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto('https://admin.dojipro.com/connected.html');
  const email = page.getByLabel('Work email', { exact: false });
  const password = page.getByLabel('Password', { exact: false });
  await expect(email).toBeVisible();
  await expect(email).toHaveAttribute('autocomplete', 'username');
  await expect(password).toHaveAttribute('autocomplete', 'current-password');
  await expect(password).toHaveAttribute('type', 'password');
  await email.fill('synthetic@example.test');
  await password.fill('synthetic-password');

  // Force the browser's CSS state on synthetic fields; no saved credentials or live auth.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  for (const selector of ['input[autocomplete="username"]', 'input[type="password"]']) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['autofill'] });
    const input = page.locator(selector);
    await expect(input).toHaveCSS('box-shadow', 'rgb(26, 27, 32) 0px 0px 0px 100px inset');
    await expect(input).toHaveCSS('-webkit-text-fill-color', 'rgb(247, 245, 242)');
    await input.focus();
    await expect(input).toBeFocused();
    await expect(input).toHaveCSS('box-shadow', 'rgb(26, 27, 32) 0px 0px 0px 100px inset');
  }
  await page.screenshot({ path: testInfo.outputPath('neutral-autofill.png') });
  await cdp.detach();
  await password.fill('edited-synthetic-password');
  await expect(password).toHaveValue('edited-synthetic-password');
  expect(fixture.commands).toEqual([]);
  expect(fixture.external).toEqual([]);
});
