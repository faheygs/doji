import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installOperationsFixture } from './operations-fixture';
import { installTeamFixture } from './team-fixture';

test('portal home has an authorized Doji snapshot, cards and no queue table', async ({
  page,
  request,
}, info) => {
  const fixture = await installOperationsFixture(page, request);
  const calls: { name: string; args: unknown }[] = [];
  let failed = false;
  await page.route('**/api/rpc', (route) => {
    const call = route.request().postDataJSON() as { name: string; args: unknown };
    if (call.name !== 'get_admin_command_center_snapshot_v2') return route.fallback();
    calls.push(call);
    return route.fulfill({
      status: failed ? 503 : 200,
      json: failed
        ? {}
        : {
            generated_at: '2026-10-09T12:00:00Z',
            next_event: {
              id: '10000000-0000-4000-8000-000000000001',
              title: 'A <b>small</b> moment of joy',
              fires_at: '2026-10-09T13:00:00Z',
              prelive_at: null,
              activated_at: null,
              closes_at: null,
            },
          },
    });
  });
  await page.goto('https://admin.dojipro.com/connected.html#/');
  await expect(
    page.getByRole('heading', { name: 'Welcome back, Synthetic operator.' }),
  ).toBeVisible();
  await expect(page.getByText('A <b>small</b> moment of joy', { exact: true })).toBeVisible();
  await expect(page.getByText('Upcoming', { exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.length).toBeLessThanOrEqual(2);
  expect(calls.every((call) => JSON.stringify(call.args) === '{"p_limit":1}')).toBe(true);
  expect(fixture.healthReads).toEqual([]);
  await page.screenshot({ path: info.outputPath('home-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('home-mobile.png'), fullPage: true });
  failed = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Retry Doji' })).toBeVisible();
  await expect(page.getByText('A <b>small</b> moment of joy', { exact: true })).toHaveCount(0);
  expect(fixture.commands).toEqual([]);
  expect(fixture.external).toEqual([]);
});

test('people search and account selection do not write permissions', async ({ page, request }) => {
  const fixture = await installTeamFixture(page, request);
  await page.goto('https://admin.dojipro.com/connected.html#/team');
  const person = page.getByRole('article', { name: 'Synthetic employee' });
  await expect(person).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search people' }).fill('no-match');
  await expect(person).toHaveCount(0);
  await expect(page.getByText('No people match these filters.')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search people' }).fill('employee@example.test');
  await expect(person).toBeVisible();
  await person.getByRole('button', { name: 'Manage access for Synthetic employee' }).click();
  await expect(page.getByRole('textbox', { name: 'Employee email' })).toHaveValue(
    'employee@example.test',
  );
  await page.getByRole('button', { name: 'Back to team', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Search people' })).toHaveValue(
    'employee@example.test',
  );
  await expect(
    person.getByRole('button', { name: 'Manage access for Synthetic employee' }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Grant access', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Employee email' })).toHaveValue('');
  expect(fixture.calls.filter((call) => call.name === 'admin_set_employee_role_v1')).toEqual([]);
});

test('people paging, long identities and empty filters stay within the directory', async ({
  page,
  request,
}, info) => {
  const fixture = await installTeamFixture(page, request);
  const original = fixture.directory.items[0]!;
  fixture.directory.items = Array.from({ length: 12 }, (_, index) => ({
    ...original,
    user_id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    username: `employee-${index}@example.test`,
    display_name: index
      ? `Employee ${index}`
      : 'Alexandria Montgomery-Wellington Long-Display-Name',
    roles: ['operations', 'moderator', 'business_reviewer'],
  }));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('https://admin.dojipro.com/connected.html#/team');
  await expect(page.getByRole('article')).toHaveCount(8);
  await expect(page.getByRole('textbox', { name: 'Employee email' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('people-many.png'), fullPage: true });
  await page.getByRole('button', { name: 'Go to next page' }).click();
  await expect(page.getByRole('article')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Go to next page' })).toBeDisabled();
  await page.getByRole('searchbox', { name: 'Search people' }).fill('unmatched');
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('article')).toHaveCount(8);
  await expect(page.getByRole('button', { name: 'Go to previous page' })).toBeDisabled();
  expect(fixture.calls.filter((call) => call.name === 'admin_set_employee_role_v1')).toEqual([]);
});

test('team loading is distinct from an empty directory and cannot open access management', async ({
  page,
  request,
}) => {
  await installTeamFixture(page, request);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/rpc', async (route) => {
    if (route.request().postDataJSON().name !== 'get_admin_employee_directory_v1')
      return route.fallback();
    await gate;
    return route.fulfill({ json: { items: [] } });
  });
  await page.goto('https://admin.dojipro.com/connected.html#/team');
  await expect(page.getByRole('progressbar', { name: 'Loading employees' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Grant access', exact: true })).toBeDisabled();
  release();
  await expect(page.getByText('No employee accounts returned.')).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
});
