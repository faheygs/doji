import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { businessId } from './business-fixture';
import { installOwnershipFixture, reviewerA, reviewerB } from './business-ownership-fixture';

const url = 'https://admin.dojipro.com/connected.html#/businesses/' + businessId;
test('reviewer can release their own assignment without filling decision fields', async ({
  page,
  request,
}) => {
  const f = await installOwnershipFixture(page, request, 'success', false);
  await page.goto(url);
  await page.getByRole('button', { name: 'Assignment', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Change assignee' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Release assignment' }).click();
  expect(f.commands).toEqual([]);
  await expect(page.getByRole('dialog').getByRole('textbox')).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Release assignment' }).click();
  await expect(page.getByRole('button', { name: 'Assign to me', exact: true })).toBeVisible();
  expect(f.commands).toHaveLength(1);
  expect(f.commands[0]).toMatchObject({
    p_action: 'release',
    p_target: null,
    p_revision: 1,
    p_source_version: '3',
  });
  expect(f.directory).toEqual([]);
});
test('manager changes assignee through bounded reviewer pages and explicit confirmation', async ({
  page,
  request,
}, info) => {
  const f = await installOwnershipFixture(page, request);
  await page.goto(url);
  expect(f.directory).toEqual([]);
  await page.getByRole('button', { name: 'Assignment', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Change assignee' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox', { name: 'New assignee' })).toBeEnabled();
  expect(f.commands).toEqual([]);
  await dialog.getByRole('combobox', { name: 'New assignee' }).click();
  await page.getByRole('option', { name: 'Reviewer A' }).click();
  await expect(dialog.getByRole('button', { name: 'Assign reviewer' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Next reviewers' }).click();
  await expect(dialog.getByRole('button', { name: 'Assign reviewer' })).toBeDisabled();
  await dialog.getByRole('combobox', { name: 'New assignee' }).click();
  await page.getByRole('option', { name: 'Reviewer B' }).click();
  // StrictMode can abort and remount the first read; every request stays case-scoped.
  expect(f.directory.length).toBeLessThanOrEqual(4);
  expect([
    ...new Map(f.directory.map((payload) => [JSON.stringify(payload), payload])).values(),
  ]).toEqual([
    { p_kind: 'business_application', p_id: businessId, p_after_id: null, p_limit: 25 },
    { p_kind: 'business_application', p_id: businessId, p_after_id: reviewerA, p_limit: 25 },
  ]);
  await expect(dialog.getByRole('button', { name: 'Assign reviewer' })).toHaveCSS(
    'color',
    'rgb(255, 255, 255)',
  );
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('assignment-material-buttons.png') });
  await dialog
    .getByRole('button', { name: 'Assign reviewer' })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(page.getByText('Reviewer B', { exact: true })).toBeVisible();
  expect(f.commands).toHaveLength(1);
  expect(f.commands[0]).toMatchObject({ p_action: 'assign', p_target: reviewerB });
  expect(f.external).toEqual([]);
});
test('uncertain reassignment retries the same target and request ID', async ({ page, request }) => {
  const f = await installOwnershipFixture(page, request, 'uncertain');
  await page.goto(url);
  await page.getByRole('button', { name: 'Assignment', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Change assignee' }).click();
  await page.getByRole('combobox', { name: 'New assignee' }).click();
  await page.getByRole('option', { name: 'Reviewer A' }).click();
  await page.getByRole('button', { name: 'Assign reviewer' }).click();
  await expect(page.getByRole('button', { name: 'Retry same assignment' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Retry same assignment' }).click();
  await expect(page.getByText('Reviewer A', { exact: true })).toBeVisible();
  expect(f.commands).toHaveLength(2);
  expect(f.commands[1]).toEqual(f.commands[0]);
});
test('changed ownership blocks a prepared release without sending a command', async ({
  page,
  request,
}) => {
  const f = await installOwnershipFixture(page, request);
  await page.goto(url);
  await page.getByRole('button', { name: 'Assignment', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Release assignment' }).click();
  f.change();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(
    page.getByRole('dialog').getByText(/Ownership or permissions changed/),
  ).toBeVisible();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Release assignment' }),
  ).toBeDisabled();
  expect(f.commands).toEqual([]);
});
test('ownership conflicts retain a usable refresh path', async ({ page, request }) => {
  const f = await installOwnershipFixture(page, request, 'conflict');
  await page.goto(url);
  await page.getByRole('button', { name: 'Assignment', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Release assignment' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Release assignment' }).click();
  await expect(page.getByRole('dialog').getByText(/Assignment was not accepted/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh record' })).toBeEnabled();
  await page.getByRole('button', { name: 'Refresh record' }).click();
  await expect(page.getByRole('button', { name: 'Assignment', exact: true })).toBeEnabled();
  expect(f.commands).toHaveLength(1);
});
