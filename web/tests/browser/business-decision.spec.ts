import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { businessId } from './business-fixture';
import { installDecisionFixture } from './business-decision-fixture';

const url = 'https://admin.dojipro.com/connected.html#/businesses/' + businessId;
async function prepare(page: Page, label = 'Approve application') {
  await page.getByRole('combobox', { name: 'Decision' }).click();
  await page.getByRole('option', { name: label, exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Response to applicant', exact: true })
    .fill('Thank you for your application. Here is our response.');
  await page
    .getByRole('textbox', { name: 'Internal review note', exact: true })
    .fill('Reviewed the submitted application and supporting information.');
  await page.getByRole('button', { name: 'Review decision', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
test('review requires valid fields and confirmation; double confirmation dispatches one command', async ({
  page,
  request,
}, info) => {
  const f = await installDecisionFixture(page, request);
  await page.goto(url);
  await expect(page.getByRole('button', { name: 'Review decision', exact: true })).toBeDisabled();
  await prepare(page);
  expect(f.decisions).toEqual([]);
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(f.decisions).toEqual([]);
  await page.getByRole('button', { name: 'Review decision', exact: true }).click();
  // Audit the settled dialog, not a partially transparent MUI entrance frame.
  await expect(page.locator('.MuiDialog-container')).toHaveCSS('opacity', '1');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('business-confirm-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('business-confirm-mobile.png') });
  await page
    .getByRole('button', { name: 'Confirm decision', exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(page.getByText('approved', { exact: true })).toBeVisible();
  expect(f.decisions).toHaveLength(1);
  expect(f.decisions[0]).toMatchObject({ p_id: businessId, p_revision: 3, p_action: 'approve' });
  expect(Object.keys(f.decisions[0]!).sort()).toEqual([
    'p_action',
    'p_id',
    'p_internal_note',
    'p_request_id',
    'p_response',
    'p_revision',
  ]);
  expect(f.external).toEqual([]);
});
for (const [label, initial, action, state] of [
  ['Request changes', 'pending', 'request_changes', 'changes requested'],
  ['Decline application', 'pending', 'decline', 'declined'],
  ['Reopen application', 'approved', 'reopen', 'changes requested'],
])
  test(`${label} uses the existing atomic decision`, async ({ page, request }) => {
    const f = await installDecisionFixture(page, request, 'success', initial);
    await page.goto(url);
    await prepare(page, label);
    if (action === 'reopen')
      await expect(
        page.getByRole('dialog').getByText(/suspends any approved business workspace access/),
      ).toBeVisible();
    await page.getByRole('button', { name: 'Confirm decision', exact: true }).click();
    await expect(page.getByText(state!, { exact: true })).toBeVisible();
    expect(f.decisions).toHaveLength(1);
    expect(f.decisions[0]?.p_action).toBe(action);
  });
test('unknown outcome freezes edits and retries only the original decision', async ({
  page,
  request,
}) => {
  const f = await installDecisionFixture(page, request, 'uncertain');
  await page.goto(url);
  await prepare(page);
  await page.getByRole('button', { name: 'Confirm decision', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry same decision' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(f.decisions).toHaveLength(1);
  await page.getByRole('button', { name: 'Retry same decision' }).click();
  await expect(page.getByText('approved', { exact: true })).toBeVisible();
  expect(f.decisions).toHaveLength(2);
  expect(f.decisions[1]).toEqual(f.decisions[0]);
});
test('a newer application blocks a prepared decision until explicit refresh', async ({
  page,
  request,
}) => {
  const f = await installDecisionFixture(page, request);
  await page.goto(url);
  await prepare(page);
  f.change();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('dialog').getByText(/record or its ownership changed/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm decision' })).toBeDisabled();
  expect(f.decisions).toEqual([]);
  await page.getByRole('button', { name: 'Refresh application' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('textbox', { name: 'Response to applicant', exact: true }),
  ).toHaveValue('');
});

test('refreshing an unchanged record cannot discard an uncertain decision', async ({
  page,
  request,
}) => {
  const f = await installDecisionFixture(page, request, 'unconfirmed');
  await page.goto(url);
  await prepare(page);
  await page.getByRole('button', { name: 'Confirm decision', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh application' }).click();
  await expect(
    page.getByRole('dialog').getByText(/earlier outcome is still unconfirmed/),
  ).toBeVisible();
  expect(f.decisions).toHaveLength(1);
  await page.getByRole('button', { name: 'Retry same decision' }).click();
  await expect(page.getByText('approved', { exact: true })).toBeVisible();
  expect(f.decisions).toHaveLength(2);
  expect(f.decisions[1]).toEqual(f.decisions[0]);
});
test('read-only reviewers cannot open a decision form', async ({ page, request }) => {
  const f = await installDecisionFixture(page, request, 'success', 'pending', false);
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Submitted application' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Decision' })).toHaveCount(0);
  expect(f.decisions).toEqual([]);
});
test('server conflict permits refresh but not another decision attempt', async ({
  page,
  request,
}) => {
  const f = await installDecisionFixture(page, request, 'conflict');
  await page.goto(url);
  await prepare(page);
  await page.getByRole('button', { name: 'Confirm decision' }).click();
  await expect(page.getByRole('dialog').getByText(/Decision was not accepted/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm decision' })).toBeDisabled();
  expect(f.decisions).toHaveLength(1);
});
