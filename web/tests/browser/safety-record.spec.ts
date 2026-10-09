import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installSafetyFixture, safetyId, safetyActor } from './safety-fixture';
const url = 'https://admin.dojipro.com/connected.html#/trust-safety/external/' + safetyId;
for (const legal of [false, true])
  test(`overview external request preserves restricted permission ${legal}`, async ({
    page,
    request,
  }) => {
    const f = await installSafetyFixture(page, request, 'success', true, legal);
    f.item.queue = 'restricted_safety';
    await page.goto(url.replace('trust-safety', 'overview'));
    if (legal) {
      await expect(page.getByText('Synthetic request statement')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Back to overview' })).toHaveAttribute(
        'href',
        '#/',
      );
    } else {
      await expect(page.getByRole('button', { name: 'Retry record read' })).toBeVisible();
      await expect(page.getByText('Synthetic request statement')).toHaveCount(0);
    }
    expect(f.commands).toEqual([]);
    await page.unrouteAll({ behavior: 'wait' });
  });
test('unified row opens full-page external request and assigns once without fields', async ({
  page,
  request,
}, info) => {
  const f = await installSafetyFixture(page, request);
  await page.goto('https://admin.dojipro.com/connected.html#/trust-safety');
  await page.getByRole('row').filter({ hasText: 'Synthetic removal request' }).click();
  await expect(page).toHaveURL(url);
  await expect(page.getByText('Synthetic request statement')).toBeVisible();
  expect(f.commands).toEqual([]);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Assign to me', exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(page.getByText('Safety reviewer (you)')).toBeVisible();
  expect(f.commands).toHaveLength(1);
  expect(f.commands[0]?.p_input).toEqual({ action: 'claim', note: 'Self-assigned for review.' });
  expect(f.external).toEqual([]);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath('external-record-mobile.png'), fullPage: true });
});
test('closure needs valid fields and explicit confirmation; reopening uses the existing command', async ({
  page,
  request,
}) => {
  const f = await installSafetyFixture(page, request);
  f.item.assigned_to = safetyActor;
  await page.goto(url);
  await page.getByRole('combobox', { name: 'Action' }).click();
  await page.getByRole('option', { name: 'Close request', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Close request', exact: true })).toBeDisabled();
  await page
    .getByRole('textbox', { name: 'Internal review note' })
    .fill('Reviewed the exact reported reference.');
  await page
    .getByRole('textbox', { name: 'Response for the requester' })
    .fill('This request is closed after our review.');
  await page.getByRole('button', { name: 'Close request', exact: true }).click();
  expect(f.commands).toEqual([]);
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Saved. The current case is shown above.')).toBeVisible();
  expect(f.commands[0]?.p_input.action).toBe('not_actionable');
  await page.getByRole('combobox', { name: 'Action' }).click();
  await expect(page.getByRole('option', { name: 'Reopen request' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Close request' })).toHaveCount(0);
  await page.getByRole('option', { name: 'Reopen request' }).click();
  await page
    .getByRole('textbox', { name: 'Internal review note' })
    .fill('New evidence requires another review.');
  await page
    .getByRole('textbox', { name: 'Response for the requester' })
    .fill('Your request has been reopened for review.');
  await page.getByRole('button', { name: 'Reopen request', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Saved. The current case is shown above.')).toBeVisible();
  expect(f.commands).toHaveLength(2);
  expect(f.commands[1]?.p_input.action).toBe('reopen');
  expect(f.commands[1]?.p_revision).toBe(f.commands[0]!.p_revision + 1);
  expect(f.commands[1]?.p_command_id).not.toBe(f.commands[0]?.p_command_id);
});
test('uncertain assignment survives failed reads and retries the identical intent', async ({
  page,
  request,
}) => {
  const f = await installSafetyFixture(page, request, 'uncertain');
  await page.goto(url);
  await page.getByRole('button', { name: 'Assign to me', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry same action' })).toBeEnabled();
  await page.getByRole('button', { name: 'Refresh case' }).click();
  await expect(page.getByRole('button', { name: 'Retry same action' })).toBeEnabled();
  f.failRead(true);
  await page.getByRole('button', { name: 'Refresh case' }).click();
  await expect(page.getByText('Synthetic request statement')).toHaveCount(0);
  f.failRead(false);
  await page.getByRole('button', { name: 'Retry record read' }).click();
  await page.getByRole('button', { name: 'Retry same action' }).click();
  await expect(page.getByText('Safety reviewer (you)')).toBeVisible();
  expect(f.commands).toHaveLength(2);
  expect(f.commands[1]).toEqual(f.commands[0]);
});
test('new revision blocks a prepared outcome; a denied read removes private content', async ({
  page,
  request,
}) => {
  const f = await installSafetyFixture(page, request);
  f.item.assigned_to = safetyActor;
  await page.goto(url);
  await page.getByRole('combobox', { name: 'Action' }).click();
  await page.getByRole('option', { name: 'Start review' }).click();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start review', exact: true }).click();
  f.item.revision++;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }),
  ).toBeDisabled();
  expect(f.commands).toEqual([]);
  f.deny();
  await page.getByRole('dialog').getByRole('button', { name: 'Refresh case' }).click();
  await expect(page.getByText('Synthetic request statement')).toHaveCount(0);
});
test('restricted route requires legal permission before reading and ordinary route rejects restricted payload', async ({
  page,
  request,
}) => {
  const f = await installSafetyFixture(page, request, 'success', true, false);
  await page.goto(url.replace('trust-safety', 'restricted-safety'));
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible();
  expect(f.reads).toEqual([]);
  f.item.queue = 'restricted_safety';
  await page.goto(url);
  await expect(page.getByRole('button', { name: 'Retry record read' })).toBeVisible();
  await expect(page.getByText('Synthetic request statement')).toHaveCount(0);
});
test('read-only case has no outcome or assignment controls', async ({ page, request }) => {
  const f = await installSafetyFixture(page, request, 'success', false);
  await page.goto(url);
  await expect(page.getByText('You have read-only access to this case.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Assign to me' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Action' })).toHaveCount(0);
  expect(f.commands).toEqual([]);
});
