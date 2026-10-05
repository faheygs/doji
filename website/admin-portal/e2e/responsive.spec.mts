import { expect, test } from '../../coverage-fixture.mts';
import { installMockBackend, seedAdminSession } from './fixtures.mts';

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 900, height: 1100 },
  { name: 'mobile', width: 390, height: 844 },
];

for (const viewport of viewports) {
  test(`${viewport.name} layout has no page-level gaps or horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await seedAdminSession(page);
    await installMockBackend(page);
    await page.goto('/');
    await expect(page.locator('#portalApp')).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      bodyLeft: document.body.getBoundingClientRect().left,
      bodyRight: document.body.getBoundingClientRect().right,
    }));
    expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
    expect(dimensions.bodyLeft).toBeGreaterThanOrEqual(-1);
    expect(dimensions.bodyRight).toBeLessThanOrEqual(dimensions.viewportWidth + 1);

    if (viewport.width <= 1080) {
      await expect(page.locator('#mobileMenu')).toBeVisible();
      await page.locator('#mobileMenu').click();
      await expect(page.locator('#portalSidebar')).toHaveClass(/open/);
      await expect(page.locator('#sidebarClose')).toBeVisible();
      const sidebarHeight = await page
        .locator('#portalSidebar')
        .evaluate((element) => element.getBoundingClientRect().height);
      expect(sidebarHeight).toBeGreaterThanOrEqual(viewport.height - 40);
      await page.locator('#sidebarClose').click();
      await expect(page.locator('#portalSidebar')).not.toHaveClass(/open/);
    } else {
      await expect(page.locator('#mobileMenu')).toBeHidden();
      await expect(page.locator('#portalSidebar')).toBeVisible();
    }
  });
}
