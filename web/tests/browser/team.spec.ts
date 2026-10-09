import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installTeamFixture } from './team-fixture';
const url = 'https://admin.dojipro.com/connected.html#/team';
async function prepare(page: import('@playwright/test').Page) {
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /^(Team & access|Manage employee access|Grant employee access)$/,
    }),
  ).toBeVisible();
  if (await page.getByRole('button', { name: 'Grant access', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Grant access', exact: true }).click();
  const email = page.getByRole('textbox', { name: 'Employee email' });
  if (await email.isEnabled()) await email.fill('employee@example.test');
  else await expect(email).toHaveValue('employee@example.test');
  await page
    .getByRole('textbox', { name: 'Access change reason' })
    .fill('Approved synthetic coverage.');
  await page.getByRole('button', { name: 'Review access change' }).click();
}
test('employee directory and explicit access confirmation preserve MUI keyboard and mobile behavior', async ({
  page,
  request,
}, info) => {
  const f = await installTeamFixture(page, request);
  await page.goto(url);
  await expect(page.getByRole('article', { name: 'Synthetic employee' })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.getByRole('button', { name: 'Manage access for Synthetic employee' }).click();
  await expect(page.getByRole('textbox', { name: 'Employee email' })).toHaveValue(
    'employee@example.test',
  );
  await expect(page.getByRole('heading', { name: 'Manage employee access' })).toBeFocused();
  await expect(page.getByRole('searchbox', { name: 'Search people' })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('team-desktop.png'), fullPage: true });
  await prepare(page);
  expect(f.calls.filter((call) => call.name === 'admin_set_employee_role_v1')).toHaveLength(0);
  await page.getByRole('button', { name: 'Confirm access change' }).click();
  await expect(page.getByText('Access change recorded.', { exact: false })).toBeVisible();
  const writes = f.calls.filter((call) => call.name === 'admin_set_employee_role_v1');
  expect(writes).toHaveLength(1);
  expect(writes[0]?.args).toMatchObject({
    p_username: 'employee@example.test',
    p_role: 'operations',
    p_active: true,
  });
  await expect(page.getByRole('textbox', { name: 'Employee email' })).toHaveValue(
    'employee@example.test',
  );
  await expect(page.getByRole('textbox', { name: 'Employee email' })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('team-mobile.png'), fullPage: true });
});
test('unconfirmed access change freezes inputs and reuses the exact command after refresh', async ({
  page,
  request,
}) => {
  const f = await installTeamFixture(page, request);
  f.uncertain();
  await page.goto(url);
  await prepare(page);
  await page.getByRole('button', { name: 'Confirm access change' }).click();
  await expect(page.getByRole('button', { name: 'Retry identical access change' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('textbox', { name: 'Employee email' })).toBeDisabled();
  await page.getByRole('button', { name: 'Back to team', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Employee email' })).toHaveValue(
    'employee@example.test',
  );
  await expect(
    page.getByText('Finish or reconcile the current access change before leaving this editor.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retry identical access change' }).click();
  await expect(page.getByText('Access change recorded.', { exact: false })).toBeVisible();
  const writes = f.calls.filter((call) => call.name === 'admin_set_employee_role_v1');
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
});
test('self access loss reauthorizes and removes protected directory', async ({ page, request }) => {
  const f = await installTeamFixture(page, request);
  f.revokeSelf();
  await page.goto(url);
  await prepare(page);
  await page.getByRole('button', { name: 'Confirm access change' }).click();
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible();
  await expect(page.getByText('employee@example.test', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Team & access', exact: true })).toHaveCount(0);
});
test('failed directory clears staff data and server rejection cannot auto retry', async ({
  page,
  request,
}) => {
  const f = await installTeamFixture(page, request);
  f.reject();
  await page.goto(url);
  await prepare(page);
  await page.getByRole('button', { name: 'Confirm access change' }).click();
  await expect(page.getByText('Access change was not accepted.', { exact: false })).toBeVisible();
  expect(f.calls.filter((call) => call.name === 'admin_set_employee_role_v1')).toHaveLength(1);
  f.fail();
  await page.getByRole('button', { name: 'Refresh directory', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry directory', exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Synthetic employee' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Employee email' })).toBeDisabled();
});
test('non-manager cannot read employee directory or dispatch role commands', async ({
  page,
  request,
}) => {
  const f = await installTeamFixture(page, request, false);
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible();
  expect(f.calls.some((call) => /employee_directory|set_employee_role/.test(call.name))).toBe(
    false,
  );
});
