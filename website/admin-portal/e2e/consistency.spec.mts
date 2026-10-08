import { must } from "../../test-contracts.mts";
import { test, expect } from '../../coverage-fixture.mts';
import AxeBuilder from '@axe-core/playwright';
import type { NodeResult } from 'axe-core';
import { present } from '../../test-values.mts';
import { installMockBackend, seedAdminSession, reportId } from './fixtures.mts';

// Synthetic network boundary only: no live decisions or member requests.
for (const width of [390, 900, 1440])
  for (const theme of ['light', 'dark']) {
    test(`portal consistency ${theme} ${width}`, async ({ page }, info) => {
      test.setTimeout(120000);
      await page.setViewportSize({ width, height: 900 });
      await page.route('**/*', (route) =>
        new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
      );
      await seedAdminSession(page, true);
      const requests = await installMockBackend(page, { employeeMode: true });
      await page.goto('/');
      await expect(page.locator('#operatorName')).toHaveText('Gavin Fahey');
      await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
      const findings: { surface: string; id: string; nodes: Pick<NodeResult, 'target'>[] }[] = [];
      async function inspect(name: string, selector: string) {
        await expect(page.locator(selector)).toBeVisible();
        const results = await new AxeBuilder({ page })
          .include(selector)
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        findings.push(
          ...results.violations.map((v) => ({
            surface: name,
            id: v.id,
            nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
          })),
        );
        const layout = await page.evaluate(() => ({
          width: document.body.scrollWidth,
          overflowing: [...document.querySelectorAll('body *')]
            .map((node) => {
              const rect = node.getBoundingClientRect();
              return {
                tag: node.tagName,
                id: node.id,
                className: String(node.className),
                left: rect.left,
                right: rect.right,
              };
            })
            .filter((rect) => rect.right > innerWidth + 1 && rect.right > rect.left)
            .slice(0, 30),
        }));
        if (layout.width > width + 1)
          await info.attach(`${name}-overflow`, {
            body: JSON.stringify(layout, null, 2),
            contentType: 'application/json',
          });
        expect(layout.width, `${name}: ${JSON.stringify(layout.overflowing)}`).toBeLessThanOrEqual(
          width + 1,
        );
        await page.screenshot({ path: info.outputPath(`${name}.png`), animations: 'disabled' });
      }
      async function nav(view: string) {
        if (width <= 1080) await page.locator('#mobileMenu').click();
        await page.locator(`.portalNav [data-view="${view}"]`).click();
        await expect(page.locator(`[data-portal-view="${view}"]`)).toBeVisible();
      }
      for (const view of [
        'overview',
        'inbox',
        'moderation',
        'safety',
        'operations',
        'audit',
        'access',
      ]) {
        await nav(view);
        await inspect(view, '#portalApp');
      }
      await nav('moderation');
      await page.locator(`[data-queue-body="moderation"] [data-work-id="${reportId}"]`).click();
      await expect(page.locator('#decisionReason')).toBeVisible();
      await inspect('report', '#caseDrawer');
      const tabs = page.getByRole('tablist', { name: 'Case sections' });
      await tabs.getByRole('tab', { name: 'Details', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(tabs.getByRole('tab', { name: 'History', exact: true })).toBeFocused();
      await expect(tabs.getByRole('tab', { name: 'History', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await inspect('report-history', '#caseDrawer');
      // Empty history is a full-width message, not a timeline's 20px marker column.
      await expect(page.locator('#caseDrawer .drawerTimeline > .emptyState').first()).toHaveCSS(
        'display',
        'block',
      );
      await page.keyboard.press('End');
      await expect(tabs.getByRole('tab', { name: 'Related', exact: true })).toBeFocused();
      await inspect('report-related', '#caseDrawer');
      await page.keyboard.press('ArrowRight');
      await expect(tabs.getByRole('tab', { name: 'Details', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('#drawerContent')).toBeFocused();
      await page.keyboard.press('Escape');
      await nav('audit');
      await page.locator('#auditList button').first().click();
      await inspect('audit-detail', '#auditDetailModal');
      const auditBounds = present(must(await page.locator('#auditDetailModal').boundingBox()));
      const mainBounds = present(must(await page.locator('.portalMain').boundingBox()));
      const margin = width <= 700 ? 12 : 24;
      // Record pages fill the workspace inside its responsive margins, not a
      // viewport-edge modal drawer. Preserve the geometry/accessibility checks.
      await expect(page.locator('#auditDetailModal')).toHaveClass(/adminRecordPage/);
      expect(auditBounds.x).toBeCloseTo(mainBounds.x + margin, 0);
      expect(auditBounds.width).toBeCloseTo(mainBounds.width - 2 * margin, 0);
      expect(auditBounds.height).toBe(900 - (width <= 700 ? 104 : 128));
      expect(auditBounds.y).toBeGreaterThan(0);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Control+k');
      await inspect('search', '#globalSearchModal');
      expect(
        requests.filter(
          (r) =>
            /report-decision|editorial-command|operator-role/.test(r.path) && r.method === 'POST',
        ),
      ).toHaveLength(0);
      await info.attach('findings', {
        body: JSON.stringify(findings, null, 2),
        contentType: 'application/json',
      });
      expect(findings).toEqual([]);
    });
  }

test('audit export failure stays contextual, retries successfully and clears on lock', async ({
  page,
}) => {
  await seedAdminSession(page, true);
  await installMockBackend(page, { employeeMode: true });
  await page.goto('/');
  await expect(page.locator('#operatorName')).toHaveText('Gavin Fahey');
  await page.locator('[data-view="audit"]').click();
  let count = 0;
  await page.route('**/portal/admin/audit-export?*', (route) => {
    count++;
    return count === 1
      ? route.fulfill({ status: 503, json: { error: 'Export temporarily unavailable' } })
      : route.fulfill({ json: { items: [], truncated: false } });
  });
  await page.locator('[data-action="export-audit"]').click();
  await expect(page.locator('#auditExportFeedback')).toContainText(
    'No file was downloaded. Use Export to retry.',
  );
  await page.waitForTimeout(5500);
  await expect(page.locator('#auditExportFeedback')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.locator('[data-action="export-audit"]').click();
  await download;
  await expect(page.locator('#auditExportFeedback')).toHaveText(
    'Exported 0 matching audit events.',
  );
  await page.getByRole('button', { name: 'Lock session', exact: true }).click();
  await expect(page.locator('#auditExportFeedback')).toBeEmpty();
  await expect(page.locator('#auditExportFeedback')).toBeHidden();
});
