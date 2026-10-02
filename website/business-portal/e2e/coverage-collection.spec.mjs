import {
  test,
  expect,
  captureBrowserCoverage,
  reloadWithCoverage,
} from '../../coverage-fixture.mjs';

test('coverage snapshots replace the same document and preserve both sides of a reload', async ({
  page,
  coverage,
}) => {
  test.skip(process.env.DOJI_BROWSER_COVERAGE !== '1', 'Coverage harness regression only.');
  await page.goto('/business-portal/');
  await captureBrowserCoverage(page);
  expect(coverage.size).toBe(1);
  const id = await page.evaluate(() => window.__dojiCoverageDocument);
  const source = Object.keys(coverage.get(id)).find((key) =>
    /[\\/]website[\\/]portal\.js$/.test(key),
  );
  expect(source).toBeTruthy();
  const sum = (data) => Object.values(data.s).reduce((total, value) => total + value, 0);
  const initial = sum(coverage.get(id)[source]);
  await page.getByRole('button', { name: 'Open example workspace', exact: true }).click();
  await expect(page.locator('#portalApp')).toBeVisible();
  await captureBrowserCoverage(page);
  expect(coverage.size).toBe(1);
  const afterClick = sum(coverage.get(id)[source]);
  expect(afterClick).toBeGreaterThan(initial);
  await captureBrowserCoverage(page);
  expect(sum(coverage.get(id)[source])).toBe(afterClick);
  await reloadWithCoverage(page);
  await expect(page.locator('#portalAuth')).toBeVisible();
  await captureBrowserCoverage(page);
  const nextId = await page.evaluate(() => window.__dojiCoverageDocument);
  expect(nextId).not.toBe(id);
  expect(coverage.size).toBe(2);
  expect(sum(coverage.get(id)[source])).toBe(afterClick);
  expect(sum(coverage.get(nextId)[source])).toBeGreaterThan(0);
  expect(sum(coverage.get(nextId)[source])).toBeLessThan(afterClick);
});
