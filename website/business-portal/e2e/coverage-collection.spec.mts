import {
  test,
  expect,
  captureBrowserCoverage,
  reloadWithCoverage,
} from '../../coverage-fixture.mts';
import { present } from '../../test-values.mts';
import type { FileCoverageData } from 'istanbul-lib-coverage';
import { coverageData } from '../../../scripts/coverage-contracts.mts';

test('coverage snapshots replace the same document and preserve both sides of a reload', async ({
  page,
  coverage,
}) => {
  test.skip(process.env.DOJI_BROWSER_COVERAGE !== '1', 'Coverage harness regression only.');
  const snapshots = present(coverage);
  await page.goto('/business-portal/');
  await captureBrowserCoverage(page);
  expect(snapshots.size).toBe(1);
  const id = present(await page.evaluate(() => window.__dojiCoverageDocument));
  const source = present(
    Object.keys(coverageData(snapshots.get(id))).find((key) =>
      /[\\/]website[\\/]portal\.mts$/.test(key),
    ),
  );
  expect(
    source,
    `Expected portal coverage among ${JSON.stringify(Object.keys(coverageData(snapshots.get(id))))}`,
  ).toBeTruthy();
  const sum = (data: FileCoverageData) =>
    Object.values(data.s).reduce((total, value) => total + value, 0);
  const counts = (key: string) => sum(present(coverageData(snapshots.get(key))[source]));
  const initial = counts(id);
  await page.getByRole('button', { name: 'Open example workspace', exact: true }).click();
  await expect(page.locator('#portalApp')).toBeVisible();
  await captureBrowserCoverage(page);
  expect(snapshots.size).toBe(1);
  const afterClick = counts(id);
  expect(afterClick).toBeGreaterThan(initial);
  await captureBrowserCoverage(page);
  expect(counts(id)).toBe(afterClick);
  await reloadWithCoverage(page);
  await expect(page.locator('#portalAuth')).toBeVisible();
  await captureBrowserCoverage(page);
  const nextId = present(await page.evaluate(() => window.__dojiCoverageDocument));
  expect(nextId).not.toBe(id);
  expect(snapshots.size).toBe(2);
  expect(counts(id)).toBe(afterClick);
  expect(counts(nextId)).toBeGreaterThan(0);
  expect(counts(nextId)).toBeLessThan(afterClick);
});
