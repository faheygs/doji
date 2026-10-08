import { test, expect, captureBrowserCoverage } from '../../coverage-fixture.mts';
import { setup } from './independent-fixture.mts';

test('check answers is read-only; confirmed submission produces a persistent receipt', async ({
  page,
}) => {
  const calls = await setup(page, { signedIn: true });
  await page.goto('/business-portal/application/');
  await page.locator('[name=brand_name]').fill('My business');
  await expect(page.locator('#applicationSaveStatus')).toContainText('unsaved');
  await page.locator('#applicationReview').click();
  await expect(page.locator('#applicationReviewTitle')).toBeFocused();
  await expect(page.locator('#applicationReviewSummary')).toContainText('My business');
  expect(calls.filter((c) => c.body.p_action)).toHaveLength(0);
  await page.locator('#applicationEdit').click();
  await expect(page.locator('[name=brand_name]')).toHaveValue('My business');
  await page.locator('#applicationReview').click();
  await page.locator('#businessTerms').check();
  await page.locator('#applicationSubmit').click();
  await expect(page.locator('#applicationStatusTitle')).toHaveText('Application received');
  await expect(page.locator('#applicationStatusTitle')).toBeFocused();
  await expect(page.locator('#applicationReference')).toHaveText(
    '12345678-1234-4234-8234-123456789012',
  );
  await expect(page.locator('#applicationSubmitted')).not.toBeEmpty();
  await expect(page.locator('#businessNextText')).toContainText('No action is needed');
  await expect(page.locator('#applicationEditor')).toBeHidden();
  await expect(page.locator('#applicationHistoryList')).toContainText('Application submitted');
  expect(calls.filter((c) => c.body.p_action === 'submit')).toHaveLength(1);
  await captureBrowserCoverage(page);
  await page.reload();
  await expect(page.locator('#applicationStatusTitle')).toHaveText('Application received');
  await page.locator('#applicationDetails > summary').click();
  await expect(page.locator('#applicationDetailsSummary')).toContainText('My business');
  await page.locator('#applicationRefresh').click();
  expect(calls.filter((c) => c.body.p_action === 'submit')).toHaveLength(1);
  // Printing is a local browser action, not email delivery or another submission.
  await page.evaluate(() => {
    window.print = () => {
      document.title = 'Receipt print requested';
    };
  });
  await page.locator('#applicationPrint').click();
  await expect(page).toHaveTitle('Receipt print requested');
  await page.locator('#businessSignout').click();
  for (const id of ['applicationReference', 'applicationHistoryList', 'applicationDetailsSummary'])
    await expect(page.locator('#' + id)).toBeEmpty();
});

test('requested corrections use the existing draft and one resubmission without duplicating accounts', async ({
  page,
}) => {
  const calls = await setup(page, {
    signedIn: true,
    status: 'changes_requested',
    response: '<img src=x onerror=alert(1)> Clarify your details.',
  });
  await page.goto('/business-portal/application/');
  await expect(page.locator('#applicationResponsePanel')).toContainText('<img src=x');
  await expect(page.locator('#applicationResponsePanel img')).toHaveCount(0);
  await expect(page.locator('#progressDetails')).toHaveAttribute('aria-current', 'step');
  await page.locator('[name=purpose]').fill('Clarified purpose');
  await page.locator('#applicationReview').click();
  await page.locator('#businessTerms').check();
  await page.locator('#applicationSubmit').click();
  await expect(page.locator('#applicationState')).toHaveText('Pending review');
  expect(calls.filter((c) => c.body.p_action === 'submit')).toHaveLength(1);
  expect(calls.filter((c) => c.path === '/auth/start')).toHaveLength(0);
});

for (const width of [390, 1440])
  test('pending business home is usable in light and dark at ' + width, async ({ page }, info) => {
    const calls = await setup(page, { signedIn: true, status: 'pending' });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/business-portal/application/');
    await expect(page.locator('#applicationStatusTitle')).toHaveText('Application received');
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.locator('[data-action=toggle-theme]').click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: info.outputPath(`journey-${width}-${theme}.png`),
        fullPage: true,
      });
    }
    await expect(page.locator('#applicationEditor')).toBeHidden();
    await expect(page.locator('#applicationWorkspace')).not.toContainText('email sent');
    expect(calls.filter((c) => c.body.p_action)).toHaveLength(0);
  });

test('unknown state does not invent approval, a form, or a workspace', async ({ page }) => {
  await setup(page, { signedIn: true, status: 'unexpected' });
  await page.goto('/business-portal/application/');
  await expect(page.locator('#applicationReadStatus')).toContainText('Could not refresh');
  await expect(page.locator('#businessStatusCard')).toBeHidden();
  await expect(page.locator('#applicationEditor')).toBeHidden();
  await expect(page.locator('#businessWorkspaceActions')).toBeHidden();
});
