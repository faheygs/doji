import { test, expect } from '../../coverage-fixture.mjs';

test.skip(!process.env.DOJI_SAFETY_PUBLIC_TEST, 'Requires the isolated public artifact.');
const endpoint = 'https://tvixsmqxotuvyjqzmjla.supabase.co/functions/v1/safety-removal';
const reference = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const receipt = (body, overrides = {}) => ({
  id: body.id,
  state: 'received',
  message: 'Saved for review',
  received_at: '2026-09-28T12:00:00Z',
  updated_at: '2026-09-28T12:00:00Z',
  ...overrides,
});

async function setup(
  page,
  { captcha = true, config = { enabled: true, endpoint, siteKey: 'synthetic' } } = {},
) {
  await page.route('**/safety-removal/config.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.DOJI_SAFETY_CONFIG=${JSON.stringify(config)};`,
    }),
  );
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    captcha
      ? route.fulfill({
          contentType: 'application/javascript',
          body: `
    window.fixtureCaptcha = {};
    window.turnstile = {
      render: (selector, options) => { window.fixtureCaptcha[selector] = options; options.callback('synthetic'); return selector; },
      reset: selector => window.fixtureCaptcha[selector].callback('synthetic-refreshed')
    };`,
        })
      : route.abort(),
  );
  await page.goto('/safety-removal/');
}

async function fillRequest(page) {
  await expect(page.locator('#requestFields')).toBeEnabled();
  // The native select is the source of truth used by the shared combobox;
  // interaction/accessibility of the enhanced control has separate browser tests.
  await page.locator('#reason').selectOption('sexual_content', { force: true });
  await page.locator('#detail').selectOption('nonconsensual_intimate_images', { force: true });
  await page.getByLabel('Your name', { exact: true }).fill('Synthetic requester');
  await page.getByLabel('Safe contact information').fill('synthetic@example.test');
  await page.getByLabel('Where is the content on Doji?').fill('Synthetic profile reference only');
  await page.getByLabel('Good-faith statement').fill('Synthetic test; no real allegation');
  await page.getByLabel('Electronic signature', { exact: true }).fill('Synthetic requester');
  await page.getByRole('checkbox').check();
}

async function fillStatus(page) {
  await page.locator('#statusReference').fill(reference);
  await page.locator('#statusSecret').fill('a'.repeat(64));
}

test('shipped disabled config fails closed without loading CAPTCHA or sending any request', async ({
  page,
}) => {
  const outgoing = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:')) outgoing.push(request.url());
  });
  await page.goto('/safety-removal/');
  await expect(page.locator('#availability')).toContainText('Online intake is unavailable');
  await expect(page.locator('#requestFields')).toHaveJSProperty('disabled', true);
  await expect(page.locator('#requestName')).toBeDisabled();
  await page.locator('#removalForm').dispatchEvent('submit');
  await page.locator('#statusForm').dispatchEvent('submit');
  expect(outgoing).toEqual([]);
});

test('missing configuration remains closed', async ({ page }) => {
  await setup(page, { config: null });
  await expect(page.locator('#availability')).toContainText('Online intake is unavailable');
  await expect(page.locator('#requestFields')).toHaveJSProperty('disabled', true);
  await expect(page.locator('#requestName')).toBeDisabled();
});

test('CAPTCHA script load failure keeps both submit buttons disabled with support guidance', async ({
  page,
}) => {
  await setup(page, { captcha: false });
  await expect(page.locator('#availability')).toContainText('security check is unavailable');
  await expect(page.locator('#submitRequest')).toBeDisabled();
  await expect(page.locator('#checkStatus')).toBeDisabled();
});

for (const kind of ['request', 'status']) {
  for (const callback of ['expired-callback', 'error-callback']) {
    test(`${kind} CAPTCHA ${callback} blocks transport until reverified`, async ({ page }) => {
      const sent = [];
      await page.route(endpoint, (route) => {
        sent.push(route.request().postDataJSON());
        return route.fulfill({ json: receipt(sent.at(-1)) });
      });
      await setup(page);
      if (kind === 'request') await fillRequest(page);
      else await fillStatus(page);
      await page.evaluate(
        ({ kind, callback }) => window.fixtureCaptcha[`#${kind}Verification`][callback](),
        { kind, callback },
      );
      if (callback === 'error-callback')
        await expect(page.locator(`#${kind}Feedback`)).toContainText(
          'security check could not load',
        );
      await page.locator(kind === 'request' ? '#submitRequest' : '#checkStatus').click();
      await expect(page.locator(`#${kind}Feedback`)).toHaveText(
        'Complete the security check first.',
      );
      expect(sent).toEqual([]);
      await page.evaluate(
        (kind) => window.fixtureCaptcha[`#${kind}Verification`].callback('fresh-proof'),
        kind,
      );
      await page.locator(kind === 'request' ? '#submitRequest' : '#checkStatus').click();
      if (kind === 'request') await expect(page.locator('#receiptSection')).toBeVisible();
      else await expect(page.locator('#statusResult')).toBeVisible();
      expect(sent).toHaveLength(1);
      expect(sent[0].verification).toBe('fresh-proof');
    });
  }
}

for (const [label, overrides] of [
  ['mismatched reference', { id: 'other-reference' }],
  ['unknown state', { state: 'unrecognized' }],
  ['invalid receipt time', { received_at: 'not-a-date' }],
]) {
  test(`${label} cannot appear as a confirmed submission`, async ({ page }) => {
    await setup(page);
    await fillRequest(page);
    await page.route(endpoint, (route) =>
      route.fulfill({ json: receipt(route.request().postDataJSON(), overrides) }),
    );
    await page.locator('#submitRequest').click();
    await expect(page.locator('#requestFeedback')).toContainText('Receipt could not be verified');
    await expect(page.locator('#receiptSection')).toBeHidden();
    await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Synthetic requester');
  });
}

test('HTTP failure without a safe message uses fallback and a changed request gets a new receipt identity', async ({
  page,
}) => {
  const bodies = [];
  await setup(page);
  await fillRequest(page);
  await page.route(endpoint, (route) => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { message: { unsafe: 'not text' } } });
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.locator('#submitRequest').click();
    await expect(page.locator('#requestFeedback')).toContainText(
      'Receipt could not be confirmed. Retry unchanged.',
    );
    if (attempt === 0)
      await page.getByLabel('Good-faith statement').fill('Changed synthetic statement');
  }
  expect(bodies).toHaveLength(2);
  expect(bodies[0].id).not.toBe(bodies[1].id);
  expect(bodies[0].secret).not.toBe(bodies[1].secret);
});

for (const errorName of ['TimeoutError', 'AbortError', 'TypeError']) {
  test(`${errorName} during status hides old success and preserves lookup credentials`, async ({
    page,
  }) => {
    await setup(page);
    await fillStatus(page);
    await page.route(endpoint, (route) =>
      route.fulfill({ json: receipt(route.request().postDataJSON()) }),
    );
    await page.locator('#checkStatus').click();
    await expect(page.locator('#statusResult')).toBeVisible();
    await page.evaluate((name) => {
      window.fetch = () => Promise.reject(Object.assign(new Error('synthetic failure'), { name }));
    }, errorName);
    await page.locator('#checkStatus').click();
    await expect(page.locator('#statusFeedback')).toContainText('response could not be confirmed');
    await expect(page.locator('#statusResult')).toBeHidden();
    await expect(page.locator('#statusReference')).toHaveValue(reference);
    await expect(page.locator('#statusSecret')).toHaveValue('a'.repeat(64));
    await expect(page.locator('#checkStatus')).toBeEnabled();
  });
}

test('pending submit rejects duplicates, protects unload and never sends cookies or referrer', async ({
  page,
}) => {
  let finish;
  const gate = new Promise((resolve) => {
    finish = resolve;
  });
  const sent = [];
  await setup(page);
  await fillRequest(page);
  await page.context().addCookies([
    {
      name: 'synthetic-member-session',
      value: 'must-not-send',
      url: 'https://tvixsmqxotuvyjqzmjla.supabase.co',
    },
  ]);
  await page.route(endpoint, async (route) => {
    expect(route.request().headers().cookie).toBeUndefined();
    expect(route.request().headers().referer).toBeUndefined();
    sent.push(route.request().postDataJSON());
    await gate;
    return route.fulfill({ json: receipt(sent[0]) });
  });
  await page.locator('#submitRequest').click();
  await expect.poll(() => sent.length).toBe(1);
  await page.locator('#removalForm').dispatchEvent('submit');
  expect(
    await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(true);
  expect(sent).toHaveLength(1);
  finish();
  await expect(page.locator('#receiptSection')).toBeVisible();
  expect(
    await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(false);
  expect(
    await page.evaluate(() => [Object.keys(localStorage), Object.keys(sessionStorage)]),
  ).toEqual([[], []]);
});

test('pending status ignores duplicates and re-enables fields after a server denial', async ({
  page,
}) => {
  let finish;
  const gate = new Promise((resolve) => {
    finish = resolve;
  });
  const sent = [];
  await setup(page);
  await fillStatus(page);
  await page.route(endpoint, async (route) => {
    sent.push(route.request().postDataJSON());
    await gate;
    return route.fulfill({ status: 404, json: { message: 'Receipt not found.' } });
  });
  await page.locator('#checkStatus').click();
  await expect.poll(() => sent.length).toBe(1);
  await page.locator('#statusForm').dispatchEvent('submit');
  expect(sent).toHaveLength(1);
  finish();
  await expect(page.locator('#statusFeedback')).toHaveText('Receipt not found.');
  await expect(page.locator('#statusSecret')).toBeEnabled();
  await expect(page.locator('#statusResult')).toBeHidden();
});

test('saved receipt is a private text download, then its object URL is revoked', async ({
  page,
}) => {
  await setup(page);
  await fillRequest(page);
  await page.clock.install();
  await page.evaluate(() => {
    window.fixtureReceiptBlobs = [];
    window.fixtureRevoked = [];
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      window.fixtureReceiptBlobs.push(blob);
      return create(blob);
    };
    URL.revokeObjectURL = (url) => {
      window.fixtureRevoked.push(url);
      revoke(url);
    };
  });
  await page.locator('#saveReceipt').dispatchEvent('click');
  expect(await page.evaluate(() => window.fixtureReceiptBlobs.length)).toBe(0);
  await page.route(endpoint, (route) =>
    route.fulfill({ json: receipt(route.request().postDataJSON()) }),
  );
  await page.locator('#submitRequest').click();
  await expect(page.locator('#receiptSection')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#saveReceipt').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('doji-removal-receipt.txt');
  const privateCode = await page.locator('#receiptSecret').textContent();
  const downloaded = await page.evaluate(() => window.fixtureReceiptBlobs[0].text());
  expect(downloaded).toContain(`Private code: ${privateCode}`);
  expect(downloaded).toContain('Keep this code private');
  await page.clock.fastForward(1001);
  expect(await page.evaluate(() => window.fixtureRevoked.length)).toBe(1);
});

test('required dependent selects show contextual errors and non-select invalid fields do not replace them', async ({
  page,
}) => {
  await setup(page);
  await page.locator('#reason').dispatchEvent('invalid');
  await expect(page.locator('#requestFeedback')).toHaveText('Choose a category.');
  await page.locator('#detail').dispatchEvent('invalid');
  await expect(page.locator('#requestFeedback')).toHaveText('Choose a reason.');
  await page.locator('#requestName').dispatchEvent('invalid');
  await expect(page.locator('#requestFeedback')).toHaveText('Choose a reason.');
});
