import type {MockOptions} from './fixtures.mts';
import type { Page } from "@playwright/test";
import AxeBuilder from '@axe-core/playwright';
import { expect, test, reloadWithCoverage } from '../../coverage-fixture.mts';
import {
  commandCenter,
  installMockBackend,
  operatorSession,
  reportId,
  seedAdminSession,
} from './fixtures.mts';

async function openPortal(page: Page, options:MockOptions = {}) {
  await seedAdminSession(page);
  const requests = await installMockBackend(page, options);
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  await expect(page.locator('#platformStatusMetric')).toHaveText(/Healthy|Limited visibility|Watch|Degraded|Critical/);
  return requests;
}

test('renders authoritative queue data and supports keyboard case inspection', async ({ page }) => {
  await openPortal(page);
  await page.getByRole('button', { name: 'Trust & safety', exact: true }).click();
  await expect(page.locator('[data-queue-body="moderation"]')).toContainText(
    'Selling or promoting restricted items',
  );
  await expect(page.locator('[data-queue-body="moderation"]')).toContainText('normal');

  const row = page.locator(`[data-queue-body="moderation"] [data-work-id="${reportId}"]`);
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#caseDrawer')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#drawerContent')).toContainText('Drugs');
  await expect(page.locator('#drawerContent')).toContainText('Test Reporter');

  await page.keyboard.press('Escape');
  await expect(page.locator('#caseDrawer')).toHaveAttribute('aria-hidden', 'true');
});

test('records a proportionate moderation decision through the confirmation boundary', async ({
  page,
}) => {
  const requests = await openPortal(page);
  await page.getByRole('button', { name: 'Trust & safety', exact: true }).click();
  await page.locator(`[data-queue-body="moderation"] [data-work-id="${reportId}"]`).click();
  await expect(page.getByRole('button', { name: 'Remove content & warn' })).toBeVisible();

  await page.locator('#moderationPolicy').selectOption('restricted_goods');
  await page.locator('#moderationSeverity').selectOption('level_2');
  await page
    .locator('#decisionReason')
    .fill('The evidence directly promotes a restricted drug sale and the action is proportionate.');
  await page
    .locator('#moderationUserNotice')
    .fill(
      'We removed this post because it promoted restricted goods. You may appeal in Account Status.',
    );
  await page.getByRole('button', { name: 'Remove content & warn' }).click();

  await expect(page.locator('#moderationConfirmModal')).toHaveAttribute('open', '');
  await page.locator('#moderationConfirmSubmit').click();
  await expect
    .poll(
      () =>
        requests.filter((request) => request.path.endsWith('/portal/admin/report-decision')).length,
    )
    .toBe(1);
  const decision = JSON.parse(
    requests.find((request) => request.path.endsWith('/portal/admin/report-decision'))!.body!,
  );
  expect(decision).toMatchObject({
    reportId,
    action: 'remove_content',
    policyCode: 'restricted_goods',
    severity: 'level_2',
  });
});

test('keeps failed optional health reads visibly stale instead of showing false zeroes', async ({
  page,
}) => {
  await openPortal(page, { failPlatform: true, failAudit: true });
  await expect(page.locator('#portalDataBanner')).toBeVisible();
  await expect(page.locator('#portalDataBanner')).toContainText(
    'Some production data could not be refreshed',
  );
  await page.locator('.portalNav [data-view="audit"]').click();
  await expect(page.locator('#portalDataBanner')).toContainText('audit activity');
  await expect(page.locator('#portalDataBanner')).toContainText('platform health');
});

test('enforces role-scoped actions for read-only operators', async ({ page }) => {
  await openPortal(page, {
    session: {
      ...operatorSession,
      roles: ['operations'],
      capabilities: {
        moderation_read: true,
        moderation_write: false,
        restricted_review: false,
        operations_read: true,
        operator_manage: false,
      },
    },
  });
  await page.getByRole('button', { name: 'Trust & safety', exact: true }).click();
  await page.locator(`[data-queue-body="moderation"] [data-work-id="${reportId}"]`).click();
  await expect(page.getByRole('button', { name: 'Remove content & warn' })).toHaveCount(0);
  await expect(page.locator('#operatorAccessNav')).toBeHidden();
});

test('audit entries are inspectable and export the server-filtered view', async ({ page }) => {
  await openPortal(page);
  await page.getByRole('button', { name: /Audit log/ }).click();
  await expect(page.locator('#auditList')).toContainText('Report received');
  await page.locator('#auditList button').first().click();
  await expect(page.locator('#auditDetailModal')).toHaveAttribute('open', '');
  await expect(page.locator('#auditDetailModal')).toContainText('req-test-1');
  await page.locator('#auditDetailModal').getByRole('button', { name: 'Back to queue' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/doji-audit.*\.csv/);
});

test('has no serious or critical accessibility violations in the protected workspace', async ({
  page,
}) => {
  await openPortal(page);
  const results = await new AxeBuilder({ page })
    .include('#portalApp')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = results.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact || ""),
  );
  expect(serious).toEqual([]);
});

test('locking the session immediately removes protected data and browser session state', async ({
  page,
}) => {
  await openPortal(page);
  await page.getByRole('button', { name: /Lock session/ }).click();
  await expect(page.locator('#portalAuth')).toBeVisible();
  await expect(page.locator('#portalApp')).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('doji-admin-session-v1')))
    .toBeNull();
});

test('idle expiry erases an open evidence drawer and prevents keyboard search reopening', async ({ page }) => {
  await page.clock.install();
  await openPortal(page);
  await page.getByRole('button', { name: 'Trust & safety', exact: true }).click();
  await page.locator(`[data-queue-body="moderation"] [data-work-id="${reportId}"]`).click();
  await expect(page.locator('#drawerContent')).toContainText('Test Reporter');
  await page.clock.fastForward(31 * 60_000);
  await expect(page.locator('#portalAuth')).toBeVisible();
  await expect(page.locator('#caseDrawer')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#drawerContent')).toBeEmpty();
  await page.keyboard.press('Control+k');
  await expect(page.locator('#globalSearchModal')).not.toHaveAttribute('open', '');
  await expect(page.locator('#globalSearchResults')).toBeEmpty();
});

for (const role of ['moderator', 'legal_reviewer', 'business_reviewer']) {
  test(`${role} signs in without operations permission or operations requests`, async ({ page }) => {
    await seedAdminSession(page);
    const requests = await installMockBackend(page, { session: { ...operatorSession, roles: [role], capabilities: {
      moderation_read: role === 'moderator', moderation_write: role === 'moderator',
      operations_read: false, restricted_review: false, operator_manage: false,
      legal_read: role === 'legal_reviewer', business_read: role === 'business_reviewer',
    } } });
    await page.goto('/');
    await expect(page.locator('#portalApp')).toBeVisible();
    await expect(page.locator('[data-portal-view="inbox"]')).toBeVisible();
    expect(requests.some((request) => /command-center|platform-health|\/audit|\/operators/.test(request.path))).toBe(false);
    await expect(page.locator('.portalNav [data-view="operations"]')).toBeHidden();
    if (role === 'moderator') await expect(page.locator('[data-queue-body="inbox"]')).toContainText('Drugs');
    else await expect(page.locator('[data-queue-body="inbox"]')).toContainText('does not grant moderation');
  });
}

test('active work pages append once and searches reach records outside the first page', async ({ page }) => {
  const laterId = '99999999-9999-4999-8999-999999999999';
  const cursor = { at: '2026-09-24T00:00:00Z', id: `report:${reportId}` };
  const later = { ...commandCenter.work_items[0], id: laterId, secondary: 'Older searchable item' };
  await openPortal(page, { workQueue: (url) => url.searchParams.has('afterAt') || url.searchParams.has('search')
    ? { items: [later], next_cursor: null }
    : { items: [commandCenter.work_items[0]], next_cursor: cursor } });
  await page.getByRole('button', { name: 'Trust & safety', exact: true }).click();
  await page.locator('[data-active-paging="moderation"] [data-page="next"]').click();
  await expect(page.locator('[data-queue-body="moderation"] [data-work-id]')).toHaveCount(1);
  await page.locator('[data-queue-search="moderation"]').fill('Older searchable');
  await expect(page.locator('[data-queue-body="moderation"] [data-work-id]')).toHaveCount(1);
  await expect(page.locator('[data-queue-body="moderation"]')).toContainText(laterId.slice(0, 8).toUpperCase());
});

test('critical restricted work owns the legal indicator; ordinary work does not', async ({
  page,
}) => {
  await openPortal(page);
  await expect(page.locator('#legalUrgentAlert')).toBeVisible();

  await page.unroute('**/portal/admin/**');
  await installMockBackend(page, {
    commandCenter: {
      ...commandCenter,
      metrics: { ...commandCenter.metrics, restricted_safety_open: 0 },
      work_items: commandCenter.work_items.filter((item) => item.queue !== 'safety'),
    },
  });
  await reloadWithCoverage(page);
  await expect(page.locator('#legalUrgentAlert')).toBeHidden();
});
