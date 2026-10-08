import { test, expect, captureBrowserCoverage } from '../../coverage-fixture.mts';
import { setup, details, origin } from './independent-fixture.mts';
for (const width of [390, 1440])
  test(
    'public business home stays public and offers direct account routes ' + width,
    async ({ page }, testInfo) => {
      const calls = await setup(page, { signedIn: true });
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Be part of the moment.' })).toBeVisible();
      await expect(
        page
          .getByRole('navigation', { name: 'Primary navigation' })
          .getByRole('link', { name: 'Sign in', exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByRole('navigation', { name: 'Primary navigation' })
          .getByRole('link', { name: 'Register', exact: true }),
      ).toBeVisible();
      expect(calls).toHaveLength(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: testInfo.outputPath(`business-home-${width}.png`),
        fullPage: true,
      });
      await expect(page.locator('main')).toContainText(
        'Campaign publishing and billing remain closed',
      );
    },
  );

test('landing sign-in and registration links select distinct forms without a dropdown', async ({
  page,
}) => {
  await setup(page);
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Sign in', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await expect(page.locator('#identityAgreements')).toBeHidden();
  await expect(page.locator('#identityContinue')).toHaveText('Sign in');
  await page.getByRole('link', { name: 'Register', exact: true }).click();
  await expect(page.locator('#identityAgreements')).toBeVisible();
  await expect(page.locator('#identityContinue')).toHaveText('Continue');
  await expect(page.getByRole('textbox', { name: 'Email address' })).toBeVisible();
  await expect(page.locator('#identityRegisterPrompt')).toBeHidden();
  await expect(page.locator('select')).toHaveCount(0);
});

test('register uses shared controls, consent and security before hosted password setup', async ({
  page,
}) => {
  const calls = await setup(page);
  await page.goto('/business-portal/access/');
  await expect(page.locator('#identityForm')).toBeVisible();
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Email address' })).toBeVisible();
  await page.locator('#identityContinue').click();
  expect(calls.filter((x) => x.path === '/auth/start')).toHaveLength(0);
  await page.locator('#identityTerms').check();
  await page.locator('#identityPrivacy').check();
  await page.locator('#identityEmail').fill('not-an-email');
  await page.locator('#identityContinue').click();
  expect(calls.filter((x) => x.path === '/auth/start')).toHaveLength(0);
  await page.locator('#identityEmail').fill('owner+signup@example.test');
  await page.locator('#identityContinue').click();
  await expect.poll(() => calls.filter((x) => x.path === 'hosted-navigation').length).toBe(1);
  expect(calls.find((x) => x.path === '/auth/start')?.body).toMatchObject({
    signup: true,
    country: 'US',
    termsAccepted: true,
    privacyAcknowledged: true,
    proof: 'synthetic-proof',
  });
  const hosted = new URL(String(calls.find((x) => x.path === 'hosted-navigation')?.body.url));
  expect(hosted.searchParams.get('login_hint')).toBe('owner+signup@example.test');
  expect(hosted.searchParams.get('screen_hint')).toBe('sign-up');
  expect(hosted.searchParams.get('state')).toBe('synthetic-state');
  expect(hosted.searchParams.get('code_challenge')).toBe('synthetic-pkce');
  expect(hosted.searchParams.get('redirect_uri')).toBe(origin + '/auth/callback');
  expect(JSON.stringify(calls.filter((x) => x.path !== 'hosted-navigation'))).not.toContain(
    'owner+signup',
  );
  expect(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).not.toContain(
    'owner+signup',
  );
});
test('signin/reset requires no new legal acceptance and uses the same hosted route', async ({
  page,
}) => {
  const calls = await setup(page);
  await page.goto('/business-portal/access/?signin=failed');
  await expect(page.locator('#identityMessage')).toContainText('Sign-in was not completed');
  await expect(page.locator('#identityAgreements')).toBeHidden();
  await expect(page.locator('#identityExplanation')).toContainText('Forgot password');
  await page.locator('#identityEmail').fill('owner@example.test');
  await page.locator('#identityContinue').click();
  await expect.poll(() => calls.filter((x) => x.path === 'hosted-navigation').length).toBe(1);
  expect(calls.find((x) => x.path === '/auth/start')?.body).toEqual({
    signup: false,
    proof: 'synthetic-proof',
  });
  const hosted = new URL(String(calls.find((x) => x.path === 'hosted-navigation')?.body.url));
  expect(hosted.searchParams.get('login_hint')).toBe('owner@example.test');
  expect(hosted.searchParams.get('screen_hint')).toBe('sign-in');
});
test('security failure cannot send an auth request, and unavailable session does not invent access', async ({
  page,
}) => {
  const calls = await setup(page, { security: false, sessionError: true });
  await page.goto('/business-portal/access/');
  await expect(page.locator('#identityMessage')).toContainText('could not be checked');
  await page.locator('#identityEmail').fill('owner@example.test');
  await page.locator('#identityTerms').check();
  await page.locator('#identityPrivacy').check();
  await page.locator('#identityContinue').click();
  await expect(page.locator('#identityMessage')).toContainText('Complete the security check');
  expect(calls.filter((x) => x.path === '/auth/start')).toHaveLength(0);
});
test('disabled configuration cannot render signup', async ({ page }) => {
  await setup(page, { config: 'window.DOJI_BUSINESS_IDENTITY_CONFIG = { enabled: false };' });
  await page.goto('/business-portal/access/');
  await expect(page.locator('#identityMessage')).toContainText('not available yet');
  await expect(page.locator('#identityForm')).toBeHidden();
});
test('existing cookie session restores application, saves draft and submits once', async ({
  page,
}) => {
  const calls = await setup(page, { signedIn: true });
  await page.goto('/business-portal/access/');
  await expect(page.locator('#applicationFields input[name=legal_name]')).toHaveValue(
    'Example LLC',
  );
  await page.locator('#applicationFields input[name=legal_name]').fill('Updated Example LLC');
  await page.locator('#applicationSave').click();
  await expect(page.locator('#applicationSave')).toBeEnabled();
  await page.locator('#applicationReview').click();
  await page.locator('#applicationSubmit').click();
  await expect(page.locator('#businessApplicationMessage')).toContainText('Accept the terms');
  await page.locator('#businessTerms').check();
  await page.locator('#applicationSubmit').click();
  await expect(page.locator('#applicationActions')).toBeHidden();
  expect(calls.filter((x) => x.body.p_action === 'submit')).toHaveLength(1);
  expect(calls.find((x) => x.body.p_action === 'save')?.body.p_details).toMatchObject({
    legal_name: 'Updated Example LLC',
  });
  await page.locator('#businessSignout').click();
  await expect(page.locator('#applicationAccess')).toBeVisible();
  await expect(page.locator('#applicationFields')).toBeEmpty();
});

test('first application submits its displayed country without requiring a country change', async ({
  page,
}) => {
  const calls = await setup(page, { signedIn: true, empty: true });
  await page.goto('/business-portal/application/');
  for (const [name, value] of Object.entries(details)) {
    if (['country', 'business_address', 'category'].includes(name)) continue;
    await page.locator(`#applicationFields [name=${name}]`).fill(value);
  }
  await page
    .locator('#applicationFields select[name=category]')
    .selectOption('Technology', { force: true });
  await expect(page.locator('#applicationFields select[name=country]')).toHaveValue('US');
  await page.locator('#applicationReview').click();
  await page.locator('#businessTerms').check();
  await page.locator('#applicationSubmit').click();
  await expect(page.locator('#applicationState')).toHaveText('Pending review');
  const submitted = calls.filter((call) => call.body.p_action === 'submit');
  expect(submitted).toHaveLength(1);
  expect(submitted[0]?.body.p_details).toMatchObject({ country: 'US' });
});

test('new draft captures browser-autofilled fields and the displayed country', async ({ page }) => {
  const calls = await setup(page, { signedIn: true, empty: true });
  await page.goto('/business-portal/application/');
  await expect(page.locator('#applicationSave')).toBeEnabled();
  // Simulate a browser/password-manager fill that does not emit input/change.
  await page.locator('#applicationFields input[name=legal_name]').evaluate((input) => {
    (input as HTMLInputElement).value = 'Autofilled business';
  });
  await page.locator('#applicationSave').click();
  await expect(page.locator('#applicationState')).toHaveText('Draft');
  const saved = calls.filter((call) => call.body.p_action === 'save');
  expect(saved).toHaveLength(1);
  expect(saved[0]?.body.p_details).toMatchObject({
    legal_name: 'Autofilled business',
    country: 'US',
  });
});

test('application validation rejection keeps entries and does not suggest signing out', async ({
  page,
}) => {
  const calls = await setup(page, { signedIn: true, applicationInvalid: true });
  await page.goto('/business-portal/application/');
  await page.locator('#applicationFields input[name=brand_name]').fill('Preserved business');
  await page.locator('#applicationReview').click();
  await page.locator('#businessTerms').check();
  await page.locator('#applicationSubmit').click();
  await expect(page.locator('#businessApplicationMessage')).toContainText(
    'Some application details were not accepted',
  );
  await expect(page.locator('#businessApplicationMessage')).not.toContainText('sign in');
  await expect(page.locator('#applicationFields input[name=brand_name]')).toHaveValue(
    'Preserved business',
  );
  await expect(page.locator('#applicationSubmit')).toBeEnabled();
  expect(calls.filter((call) => call.body.p_action === 'submit')).toHaveLength(1);
});
test('stale save preserves draft, requires deliberate reload and never retries writes', async ({
  page,
}) => {
  const calls = await setup(page, { signedIn: true, conflict: true });
  await page.goto('/business-portal/application/');
  const field = page.locator('#applicationFields input[name=legal_name]');
  await field.fill('Unsaved draft');
  await page.locator('#applicationSave').click();
  await expect(page.locator('#applicationStale')).toBeVisible();
  await expect(field).toHaveValue('Unsaved draft');
  await expect(page.locator('#applicationSave')).toBeDisabled();
  expect(calls.filter((x) => x.body.p_action === 'save')).toHaveLength(1);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#applicationReload').click();
  await expect(field).toHaveValue('Example LLC');
});
for (const state of ['changes_requested', 'approved', 'declined'])
  test('renders authorized application state ' + state, async ({ page }) => {
    await setup(page, { signedIn: true, status: state });
    await page.goto('/business-portal/application/');
    await expect(page.locator('#applicationWorkspace')).toBeVisible();
    if (state === 'approved') await expect(page.locator('#businessWorkspaceActions')).toBeVisible();
    else await expect(page.locator('#businessWorkspaceActions')).toBeHidden();
    if (state === 'changes_requested')
      await expect(page.locator('#applicationResponse')).toContainText('clarify');
    else await expect(page.locator('#applicationActions')).toBeHidden();
    if (state === 'approved')
      await expect(page.locator('#applicationReadStatus')).toContainText('billing remain disabled');
  });

for (const enrollMfa of [false, true])
  test(
    'approved independent workspace requires verified MFA, enrollment=' + enrollMfa,
    async ({ page }) => {
      const calls = await setup(page, { signedIn: true, status: 'approved', enrollMfa });
      await page.goto('/business-portal/application/');
      await page.locator('#businessOpenWorkspace').click();
      await expect(page.locator('#businessVerifiedWorkspace')).toBeHidden();
      if (enrollMfa) await expect(page.locator('[data-mfa-secret]')).toHaveText('ABCDEFGHIJKLMNOP');
      await page.locator('#businessMfaCode').fill('123456');
      await page.getByRole('button', { name: 'Verify authenticator' }).click();
      await expect(page.locator('#businessVerifiedWorkspace')).toBeVisible();
      await expect(page.locator('#businessWorkspaceSummary')).toHaveText('Example · owner');
      await expect(page.locator('[data-mfa-secret]')).toBeEmpty();
      expect(calls.filter((c) => c.path === '/api/workspace')).toHaveLength(1);
      await page.locator('#businessSignout').click();
      await expect(page.locator('#businessVerifiedWorkspace')).toBeHidden();
      await expect(page.locator('#businessWorkspaceSummary')).toBeEmpty();
    },
  );

test('failed independent MFA never opens a workspace', async ({ page }) => {
  const options = { signedIn: true, status: 'approved', invalidMfa: true };
  const calls = await setup(page, options);
  await page.goto('/business-portal/application/');
  await page.locator('#businessOpenWorkspace').click();
  await page.locator('#businessMfaCode').fill('123456');
  await page.getByRole('button', { name: 'Verify authenticator' }).click();
  await expect(page.locator('#applicationAccess')).toBeHidden();
  await expect(page.locator('#businessWorkspaceMfa')).toBeHidden();
  await expect(page.locator('#businessApplicationMessage')).toContainText('Wait 30 seconds');
  expect(calls.filter((c) => c.path === '/api/workspace')).toHaveLength(0);
  options.invalidMfa = false;
  await page.locator('#businessOpenWorkspace').click();
  await page.locator('#businessMfaCode').fill('654321');
  await page.getByRole('button', { name: 'Verify authenticator' }).click();
  await expect(page.locator('#businessVerifiedWorkspace')).toBeVisible();
  expect(calls.filter((c) => c.path === '/auth/mfa/prepare')).toHaveLength(2);
  expect(calls.filter((c) => c.path === '/auth/mfa/complete')).toHaveLength(2);
});
test('read failure and uncertain logout keep private form data inaccessible', async ({ page }) => {
  await setup(page, { signedIn: true, readError: true, logoutError: true });
  await page.goto('/business-portal/application/');
  await expect(page.locator('#applicationReadStatus')).toContainText('Could not refresh');
  await expect(page.locator('#businessApplicationForm')).toBeHidden();
  await page.locator('#applicationRefresh').click();
  await page.locator('#businessSignout').click();
  await expect(page.locator('#applicationAccess')).toBeVisible();
  await expect(page.locator('#businessApplicationMessage')).toContainText(
    'Remote sign-out could not be confirmed',
  );
});
test('anonymous and failed session restoration do not expose application data', async ({
  page,
}) => {
  const options = { sessionError: false };
  await setup(page, options);
  await page.goto('/business-portal/application/');
  await expect(page.locator('#applicationAccess')).toBeVisible();
  await expect(page.locator('#applicationWorkspace')).toBeHidden();
  options.sessionError = true;
  await captureBrowserCoverage(page);
  await page.reload();
  await expect(page.locator('#businessApplicationMessage')).toContainText('could not be restored');
});
test('new application, foreground refresh and all field kinds preserve unsaved edits', async ({
  page,
}) => {
  const calls = await setup(page, { signedIn: true, empty: true });
  await page.goto('/business-portal/application/');
  await expect(page.locator('#applicationSave')).toBeEnabled();
  await page.locator('#applicationFields input[name=legal_name]').fill('A new business');
  await page.locator('#applicationFields textarea').first().fill('A detailed business purpose');
  await page
    .locator('#applicationFields select[name=category]')
    .selectOption('Technology', { force: true });
  await page.locator('#applicationFields').dispatchEvent('input');
  const reads = calls.filter((x) => x.path === '/api/application').length;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect
    .poll(() => calls.filter((x) => x.path === '/api/application').length)
    .toBeGreaterThan(reads);
  await expect(page.locator('#applicationFields input[name=legal_name]')).toHaveValue(
    'A new business',
  );
  await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    if (!event.defaultPrevented) throw Error('Unsaved draft was not protected');
  });
  await page.locator('#businessSignout').click();
  const after = calls.length;
  await page.evaluate(() => {
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
  });
  expect(calls.length).toBe(after);
});
test('missing form controls fail closed instead of sending incomplete application writes', async ({
  page,
}) => {
  const calls = await setup(page, { signedIn: true, missingControl: true });
  await page.goto('/business-portal/application/');
  await expect(page.locator('#businessApplicationMessage')).toContainText(
    'Missing business control',
  );
  expect(calls).toHaveLength(0);
});
test('hosted signin failure is actionable and controls unlock for an explicit retry', async ({
  page,
}) => {
  const calls = await setup(page, { authError: true });
  await page.goto('/business-portal/access/');
  await page.locator('#identityEmail').fill('owner@example.test');
  await page.locator('#identityTerms').check();
  await page.locator('#identityPrivacy').check();
  await page.locator('#identityContinue').click();
  await expect(page.locator('#identityMessage')).toContainText('could not be completed');
  await expect(page.locator('#identityContinue')).toBeEnabled();
  await expect(page.locator('#identityEmail')).toHaveValue('owner@example.test');
  expect(calls.filter((x) => x.path === '/auth/start')).toHaveLength(1);
});
for (const width of [390, 1440])
  test('shared business account UI fits viewport ' + width, async ({ page }, testInfo) => {
    await setup(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/business-portal/access/');
    await expect(page.locator('#identityForm')).toBeVisible();
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.locator('[data-action=toggle-theme]').click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: testInfo.outputPath(`business-account-${width}-${theme}.png`),
        fullPage: true,
      });
    }
  });
