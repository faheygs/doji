import { expect, test } from '../../coverage-fixture.mjs';
import AxeBuilder from '@axe-core/playwright';
import { installMockBackend, seedAdminSession, reportId } from './fixtures.mjs';

for (const width of [1440, 390]) {
  test(`contextual guidance is aligned, keyboard accessible, and read-only at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await seedAdminSession(page);
    const requests = await installMockBackend(page);
    await page.goto('/');
    await expect(page.locator('#portalApp')).toBeVisible();
    if (width < 1080) await page.locator('#mobileMenu').click();
    await page.getByRole('button', { name: 'Trust & safety', exact: true }).click();
    await page.locator(`[data-queue-body="moderation"] [data-work-id="${reportId}"]`).click();
    const help = page.getByRole('button', { name: 'Help: Policy decision', exact: true });
    await expect(help).toBeVisible();
    await expect(page.locator('#moderationPolicyHint')).toBeHidden();
    await expect(page.locator('#drawerContent')).not.toContainText('Production boundary');
    await expect(page.locator('#drawerContent')).not.toContainText('Case summary');
    await expect(page.locator('#drawerContent')).toContainText('Drugs');
    await expect(page.locator('#moderationNoticeField')).toContainText('Do not expose reporter identity');
    if (width > 700) {
      const tops = await page.locator('#moderationClassification .portalSelectTrigger').evaluateAll((nodes) => nodes.slice(0, 2).map((n) => n.getBoundingClientRect().top));
      expect(Math.abs(tops[0] - tops[1])).toBeLessThan(1);
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
      await help.focus();
      await page.keyboard.press('Enter');
      await expect(help).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#moderationPolicyHint')).toBeVisible();
      await expect(page.locator('#moderationPolicyHint')).toContainText('Suggested from the member report');
      await help.evaluate(button => button.closest('.caseDrawer, [role="dialog"], #caseDrawer')?.dispatchEvent(new Event('scroll')));
      await expect(page.locator('#moderationPolicyHint')).toBeVisible();
      const bounds = await page.locator('.contextualHelp:popover-open').boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(1000);
      const accessibility = await new AxeBuilder({ page }).include('#decisionPanel').analyze();
      expect(accessibility.violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
      await page.screenshot({ path: `test-results/contextual-help-${width}-${theme}.png` });
      await page.keyboard.press('Escape');
      await expect(help).toHaveAttribute('aria-expanded', 'false');
      await expect(help).toBeFocused();
      await expect(page.locator('#caseDrawer')).toHaveAttribute('aria-hidden', 'false');
    }
    await help.click();
    await page.getByRole('button', { name: 'Close details', exact: true }).click();
    await expect(page.locator('.contextualHelp:popover-open')).toHaveCount(0);
    expect(requests.filter((r) => r.method === 'POST' && !r.path.endsWith('/realtime-token'))).toHaveLength(0);
  });
}

test('health definitions use the same help pattern without hiding coverage limitations', async ({ page }) => {
  await seedAdminSession(page);
  await installMockBackend(page);
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  await page.getByRole('button', { name: 'Platform operations', exact: true }).click();
  await expect(page.locator('.healthThresholds > p')).toBeVisible();
  await expect(page.locator('.healthThresholds > p')).toContainText('Not directly measured');
  await page.getByRole('button', { name: 'Help: Health coverage', exact: true }).click();
  await expect(page.locator('.contextualHelp:popover-open')).toContainText('Critical');
  await page.keyboard.press('Escape');
  await expect(page.locator('.contextualHelp:popover-open')).toHaveCount(0);
});
