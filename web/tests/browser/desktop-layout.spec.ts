import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [1366, 1920, 2560]) {
  test(`reference-led home and people directory at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 1366 ? 768 : 1200 });
    await page.goto('http://127.0.0.1:4310/team');
    await expect(page.getByRole('heading', { name: 'Team & access', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Manage access', exact: true })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Employee email' })).toHaveCount(0);
    const card = (await page.getByRole('article', { name: 'Alex Morgan' }).boundingBox())!;
    expect(card.width).toBeGreaterThanOrEqual(320);
    expect(card.width).toBeLessThan(480);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`team-${width}.png`), fullPage: true });
    const manage = page.getByRole('button', { name: 'Manage access for Alex Morgan' });
    await manage.click();
    await expect(page.getByRole('heading', { name: 'Manage employee access' })).toBeFocused();
    await expect(page.getByRole('searchbox', { name: 'Search people' })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Employee email' })).toHaveValue(
      'alex@example.test',
    );
    await page.screenshot({ path: info.outputPath(`access-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Back to team' }).click();
    await expect(manage).toBeFocused();
    await page.getByRole('link', { name: 'Overview', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Needs attention', exact: true })).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    const doji = (await page
      .getByRole('region', { name: 'Daily Doji', exact: true })
      .boundingBox())!;
    const attention = (await page
      .getByRole('region', { name: 'Needs attention', exact: true })
      .boundingBox())!;
    expect(attention.x).toBeGreaterThan(doji.x + doji.width);
    expect(Math.abs(attention.y - doji.y)).toBeLessThan(2);
    expect(attention.y).toBeLessThan(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({ path: info.outputPath(`overview-${width}.png`), fullPage: true });
  });
}
