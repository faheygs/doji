import {installInvalidationStub} from '../test-contracts.mts';
import type { Page } from "@playwright/test";
// Audit probes characterize defects, not acceptance tests. All writes are mocked.
import { test, expect } from '@playwright/test';
import { installMockBackend, seedAdminSession, reportId, reportCase, commandCenter } from '../admin-portal/e2e/fixtures.mjs';
async function open(page: Page, options = {}) {
  await seedAdminSession(page);
  const requests = await installMockBackend(page, options);
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  return requests;
}
async function report(page: Page) {
  await page.getByRole('button', { name: 'Trust & safety', exact: true }).click();
  await page.locator(`[data-queue-body="moderation"] [data-work-id="${reportId}"]`).click();
  await expect(page.locator('#drawerContent')).toContainText('Test Reporter');
}
test('failed enforcement leaves error outside modal and then removes feedback', async ({ page }) => {
  await open(page);
  await page.route('**/portal/admin/report-decision', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Audit simulated command failure' }) }));
  await report(page);
  await page.locator('#decisionReason').fill('Audit fixture: evidence does not establish a policy violation.');
  await page.getByRole('button', { name: 'No violation', exact: true }).click();
  await page.locator('#moderationConfirmSubmit').click();
  await expect(page.locator('#toast')).toContainText('Audit simulated command failure');
  expect(await page.locator('#moderationConfirmModal').evaluate(el => el.matches(':modal'))).toBe(true);
  await expect(page.locator('#moderationConfirmModal')).not.toContainText('Audit simulated command failure');
  await expect(page.locator('#toast')).not.toHaveClass(/show/, { timeout: 5000 });
  await expect(page.locator('#moderationConfirmModal')).toHaveAttribute('open', '');
});
test('even typed video evidence is rendered only as an image', async ({ page }) => {
  await open(page, { reportCase: { ...reportCase, evidence: { kind: 'post', exists: true, caption: 'Audit video', media_type: 'video', has_media: true, media_bucket: 'post-media', media_path: 'audit/video.mp4' } } });
  // Keep the mock image node from being removed by its network-error handler.
  // This is a renderer type-dispatch probe, not a real video playback test.
  await page.route('**/storage/v1/object/sign/post-media/test?token=fixture', route => route.fulfill({
    contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'),
  }));
  await report(page);
  await expect(page.locator('#drawerContent .moderationEvidenceImage')).toHaveCount(1);
  await expect(page.locator('#drawerContent video')).toHaveCount(0);
});
test('appeal action opens without fetching original case evidence', async ({ page }) => {
  const appealId = '88888888-8888-4888-8888-888888888888';
  const item = { ...commandCenter.work_items[1], id: appealId, status: 'appeal', label: 'Appeal', appeal: {
    id: appealId, report_id: reportId, decision_id: '99999999-9999-4999-8999-999999999999', status: 'pending', statement: 'Please review the original evidence.', submitted_at: new Date().toISOString(), policy_code: 'restricted_goods', severity: 'level_2', content_kind: 'post', original_decider_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', user: { display_name: 'Appealing member' },
  } };
  const requests = await open(page, { commandCenter: { ...commandCenter, work_items: [item] }, workQueue: () => ({ items: [item], next_cursor: null }) });
  await page.locator(`#priorityQueue [data-work-id="${appealId}"]`).click();
  await expect(page.locator('#drawerContent')).toContainText('Member appeal');
  await expect(page.getByRole('button', { name: /Uphold/ })).toBeVisible();
  expect(requests.filter(req => req.path.includes('/report-case'))).toHaveLength(0);
  await expect(page.locator('#drawerContent .moderationEvidence')).toHaveCount(0);
});

test('a revoked-access response during reconciliation retains the open case', async ({ page }) => {
  await seedAdminSession(page);
  await installMockBackend(page);
  await installInvalidationStub(page, 'auditInvalidate');
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  await report(page);
  await page.waitForFunction(() => typeof window.auditInvalidate === 'function');
  await page.route('**/portal/admin/**', route => route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Administrator access required"}' }));
  await page.evaluate(() => window.auditInvalidate({ name: 'employee.access_changed', data: {} }));
  await expect(page.locator('#operatorSession')).toContainText('reconnecting');
  await expect(page.locator('#portalApp')).toBeVisible();
  await expect(page.locator('#drawerContent')).toContainText('Test Reporter');
  await expect(page.locator('#caseDrawer')).toHaveAttribute('aria-hidden', 'false');
});
