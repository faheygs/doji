import { test, expect } from '../../coverage-fixture.mts';
import { setup, origin } from './independent-fixture.mts';

for (const mode of ['signin', 'register']) {
  for (const outcome of ['signed-in', 'anonymous', 'unavailable']) {
    test(`${mode} keeps account controls hidden until session is ${outcome}`, async ({
      page,
    }, testInfo) => {
      const calls = await setup(page, {
        signedIn: outcome === 'signed-in',
        sessionError: outcome === 'unavailable',
        status: 'pending',
      });
      const documents: string[] = [];
      page.on('request', (request) => {
        if (request.isNavigationRequest() && request.resourceType() === 'document')
          documents.push(request.url());
      });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route(origin + '/api/session', async (route) => {
        await gate;
        await route.fallback();
      });
      const requested = page.waitForRequest(origin + '/api/session');
      await page.goto('/business-portal/access/?mode=' + mode);
      await requested;
      try {
        await expect(page.locator('#identityHeading')).toHaveText('Opening your business portal…');
        for (const id of [
          'identityForm',
          'identityProgress',
          'identitySigninPrompt',
          'identityRegisterPrompt',
        ])
          await expect(page.locator('#' + id)).toBeHidden();
        // Even a programmatic submit must not race an unresolved restore.
        await page.locator('#identityForm').dispatchEvent('submit');
        expect(calls.filter((call) => call.path === '/auth/start')).toHaveLength(0);
        await page.screenshot({ path: testInfo.outputPath('restoring.png'), fullPage: true });
      } finally {
        release();
      }
      if (outcome === 'signed-in') {
        await expect(page).toHaveURL(origin + '/business-portal/application/');
        await expect(page.locator('#applicationState')).toHaveText('Pending review');
        expect(documents).toHaveLength(1);
        expect(calls.filter((call) => call.path === '/api/session')).toHaveLength(1);
        expect(calls.filter((call) => call.path === '/api/application')).toHaveLength(1);
        await expect(page.locator('#identityVerification')).toBeEmpty();
        await page.locator('#businessSignout').click();
        await expect(page.locator('#applicationAccessActions')).toBeVisible();
        await expect(page.locator('#applicationReference')).toBeEmpty();
        await expect(page.locator('#applicationFields')).toBeEmpty();
        expect(documents).toHaveLength(1);
      } else {
        await expect(page.locator('#identityForm')).toBeVisible();
        await expect(page.locator('#identityHeading')).toHaveText(
          mode === 'signin' ? 'Welcome back.' : 'Create your business account.',
        );
        if (outcome === 'unavailable')
          await expect(page.locator('#identityMessage')).toContainText('could not be checked');
        else await expect(page.locator('#identityMessage')).toBeEmpty();
      }
    });
  }
}

test('static account page is neutral before its module loads', async ({ page }) => {
  await setup(page);
  await page.route('**/business-portal/access/access.js', (route) => route.abort());
  await page.goto('/business-portal/access/?mode=register');
  await expect(page.locator('#identityHeading')).toHaveText('Opening your business portal…');
  for (const id of [
    'identityForm',
    'identityProgress',
    'identitySigninPrompt',
    'identityRegisterPrompt',
  ])
    await expect(page.locator('#' + id)).toBeHidden();
});

for (const signedIn of [false, true])
  test(`direct application entry has no signed-out flash, signedIn=${signedIn}`, async ({
    page,
  }) => {
    const calls = await setup(page, { signedIn, status: 'pending' });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(origin + '/api/session', async (route) => {
      await gate;
      await route.fallback();
    });
    const requested = page.waitForRequest(origin + '/api/session');
    await page.goto('/business-portal/application/');
    await requested;
    try {
      await expect(page.locator('#businessAccessHeading')).toHaveText(
        'Opening your business portal…',
      );
      await expect(page.locator('#applicationAccessActions')).toBeHidden();
      await expect(page.locator('#applicationWorkspace')).toBeHidden();
    } finally {
      release();
    }
    if (signedIn) await expect(page.locator('#applicationState')).toHaveText('Pending review');
    else await expect(page.locator('#applicationAccessActions')).toBeVisible();
    expect(calls.filter((call) => call.path === '/api/session')).toHaveLength(1);
  });

test('handoff read failure stays in the business home without restarting sign-in', async ({
  page,
}) => {
  const calls = await setup(page, { signedIn: true, readError: true });
  await page.goto('/business-portal/access/?mode=signin');
  await expect(page.locator('#applicationReadStatus')).toContainText('Could not refresh');
  await expect(page.locator('#businessAccountAccess')).toBeHidden();
  await expect(page.locator('#applicationAccess')).toBeHidden();
  await expect(page.locator('#businessApplicationForm')).toBeHidden();
  expect(calls.filter((call) => call.path === '/api/session')).toHaveLength(1);
  expect(calls.filter((call) => call.path === '/auth/start')).toHaveLength(0);
});
