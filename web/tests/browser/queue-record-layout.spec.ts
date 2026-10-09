import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installBusinessFixture, businessId } from './business-fixture';
import { installSafetyFixture, safetyId } from './safety-fixture';

for (const width of [1366, 1920, 2560]) {
  test('queue and record desktop layout at ' + width, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1080 });
    await page.goto('http://127.0.0.1:4310/trust-safety');
    const frame = page.getByRole('region', { name: 'Trust & safety', exact: true });
    const table = page.getByRole('table');
    await expect(table.getByRole('columnheader')).toHaveText([
      'Case',
      'Source',
      'Received',
      'Assignee',
      'Review target',
      'Status',
    ]);
    const footer = page.getByRole('button', { name: 'Go to next page' });
    const bottom = (await footer.boundingBox())!.y;
    await footer.click();
    expect((await footer.boundingBox())!.y).toBe(bottom);
    await page.getByRole('textbox', { name: 'Search records' }).fill('no match');
    await expect(page.getByText('No sample records match this view.')).toBeVisible();
    expect((await footer.boundingBox())!.y).toBe(bottom);
    await page.getByRole('textbox', { name: 'Search records' }).fill('');
    await expect(frame.getByRole('table')).toBeVisible();
    await page.screenshot({ path: info.outputPath('queue-' + width + '.png'), fullPage: true });
    await page.getByRole('row', { name: 'Open Sample review record 1', exact: true }).focus();
    await page.keyboard.press('Enter');
    const summary = page.getByRole('complementary', { name: 'Record summary' });
    const details = page.getByRole('heading', { name: 'Record details', exact: true });
    await expect(details).toBeVisible();
    const summaryBox = (await summary.boundingBox())!;
    expect(summaryBox.width).toBe(340);
    expect(summaryBox.y).toBeLessThan(400);
    expect(summaryBox.x).toBeGreaterThan((await details.boundingBox())!.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({ path: info.outputPath('record-' + width + '.png'), fullPage: true });
  });
}

test('connected business summary stays alongside application, row opens by keyboard without writes', async ({
  page,
  request,
}, info) => {
  const f = await installBusinessFixture(page, request);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('https://admin.dojipro.com/connected.html#/businesses');
  const row = page.getByRole('row', { name: 'Open Synthetic business', exact: true });
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp('/businesses/' + businessId + '$'));
  const summary = page.getByRole('complementary', { name: 'Record summary' });
  await expect(summary.getByText('Unassigned', { exact: true })).toBeVisible();
  expect((await summary.boundingBox())!.width).toBe(340);
  expect((await summary.boundingBox())!.y).toBeLessThan(400);
  await expect(page.getByRole('heading', { name: 'Submitted application' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Review history' })).toBeVisible();
  expect(f.commands).toEqual([]);
  expect(f.external).toEqual([]);
  await page.screenshot({ path: info.outputPath('business-detail-1920.png'), fullPage: true });
});

test('connected safety keeps evidence and ownership visible without fetching protected media', async ({
  page,
  request,
}, info) => {
  const f = await installSafetyFixture(page, request);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('https://admin.dojipro.com/connected.html#/trust-safety/external/' + safetyId);
  const summary = page.getByRole('complementary', { name: 'Record summary' });
  await expect(summary.getByText('Unassigned', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic request statement')).toBeVisible();
  expect((await summary.boundingBox())!.width).toBe(340);
  expect(f.commands).toEqual([]);
  expect(f.external).toEqual([]);
  await page.screenshot({ path: info.outputPath('safety-detail-1920.png'), fullPage: true });
});
