import { test, expect } from '@playwright/test';
import { installBusinessFixture } from './business-fixture';

test.skip(!process.env.DOJI_REACT_ROOT_RELEASE, 'Only the exact root promotion package');
test('root package restores authorized workspace and preserves hash navigation', async ({
  page,
  request,
}) => {
  const fixture = await installBusinessFixture(page, request);
  await page.goto('https://admin.dojipro.com/');
  await expect(
    page.getByRole('heading', { name: /Welcome back, Synthetic reviewer/ }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Business applications', exact: true }).click();
  await expect(page).toHaveURL('https://admin.dojipro.com/#/businesses');
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Business applications', exact: true }),
  ).toBeVisible();
  expect(fixture.commands).toEqual([]);
  expect(fixture.external).toEqual([]);
});
test('root package leaves anonymous visitors at employee sign-in without protected reads', async ({
  page,
  request,
}) => {
  const fixture = await installBusinessFixture(page, request);
  await page.route('**/api/session', (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto('https://admin.dojipro.com/');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: false })).toBeVisible();
  expect(fixture.reads).toEqual([]);
  expect(fixture.commands).toEqual([]);
  expect(fixture.external).toEqual([]);
});
