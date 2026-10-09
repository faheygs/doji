import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installIdeaFixture, ideaUrl } from './idea-fixture';
import { ideaOwner } from '../idea-fixture';
import type { Page } from '@playwright/test';
async function decision(page: Page) {
  await page.getByRole('combobox', { name: 'Outcome' }).click();
  await page.getByRole('option', { name: 'Accept into pool' }).click();
  await page
    .getByRole('textbox', { name: 'Response to member' })
    .fill('This is suitable for the challenge pool.');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}
test('field-free assignment, visible owner and confirmed existing review command', async ({
  page,
  request,
}) => {
  const f = await installIdeaFixture(page, request);
  await page.goto(ideaUrl);
  await expect(page.getByText('Assignee: Unassigned')).toBeVisible();
  expect(f.writes).toEqual([]);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start review' }).click();
  await expect(page.getByText('Assignee: Synthetic reviewer (you)')).toBeVisible();
  await decision(page);
  expect(f.writes).toHaveLength(1);
  await page.getByRole('button', { name: 'Confirm decision' }).dblclick();
  await expect(page.getByText('approved', { exact: true })).toBeVisible();
  expect(f.writes).toHaveLength(2);
  expect(f.writes[1]?.args).toMatchObject({
    p_kind: 'suggestions',
    p_action: 'approved',
    p_input: {},
  });
  expect(f.external).toEqual([]);
});
test('unknown result preserves identical action across reconciliation', async ({
  page,
  request,
}) => {
  const f = await installIdeaFixture(page, request);
  Object.assign(f.owner, ideaOwner(true));
  f.failOnce();
  await page.goto(ideaUrl);
  await decision(page);
  await page.getByRole('button', { name: 'Confirm decision' }).click();
  await expect(page.getByText(/outcome is unconfirmed/)).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('approved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry identical action' }).click();
  await expect(page.getByText(/Action recorded/)).toBeVisible();
  expect(f.writes).toHaveLength(2);
  expect(f.writes[1]).toEqual(f.writes[0]);
});
test('stale confirmation cannot decide a changed submission', async ({ page, request }) => {
  const f = await installIdeaFixture(page, request);
  Object.assign(f.owner, ideaOwner(true));
  await page.goto(ideaUrl);
  await decision(page);
  f.item.version = 'c'.repeat(32);
  f.owner.source_version = f.item.version;
  await page.getByRole('button', { name: 'Confirm decision' }).click();
  await expect(page.getByText(/The record changed/)).toBeVisible();
  expect(f.writes).toEqual([]);
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Reload review form' }).click();
  await expect(page.getByRole('textbox', { name: 'Response to member' })).toHaveValue('');
});
test('read-only employee sees details but cannot decide; standard MUI mobile accessibility', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const f = await installIdeaFixture(page, request, false);
  Object.assign(f.owner, ideaOwner(true));
  await page.goto(ideaUrl);
  await expect(page.getByRole('heading', { name: 'Community idea', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Outcome' })).toHaveCount(0);
  expect(f.writes).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
