import { expect, test } from '../../coverage-fixture.mjs';
import { installMockBackend, seedAdminSession, operatorSession, reportId } from './fixtures.mjs';

async function openCase(page) {
  await seedAdminSession(page);
  const requests = await installMockBackend(page);
  await page.addInitScript(() => {
    window.Ably = { Realtime: class {
      constructor() { this.connection = { on() {} }; this.channels = { get: () => ({ subscribe(callback) { window.testInvalidate = callback; }, unsubscribe() {} }) }; }
      connect() {} close() {}
    } };
  });
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  await page.getByRole('button', { name: 'Trust & safety', exact: true }).click();
  await page.locator(`[data-queue-body="moderation"] [data-work-id="${reportId}"]`).click();
  await expect(page.locator('#drawerContent')).toContainText('Test Reporter');
  return requests;
}
async function confirmNoViolation(page) {
  await page.locator('#decisionReason').fill('The available evidence does not establish a policy violation.');
  await page.getByRole('button', { name: 'No violation', exact: true }).click();
  await expect(page.locator('#moderationConfirmModal')).toHaveAttribute('open', '');
}
async function invalidate(page) {
  await page.waitForFunction(() => typeof window.testInvalidate === 'function');
  await page.evaluate(() => window.testInvalidate({ name: 'employee.access_changed', data: {} }));
}

test('decision error persists in the modal and unchanged retry reuses the receipt key', async ({ page }) => {
  await openCase(page);
  const bodies = [];
  await page.route('**/portal/admin/report-decision', route => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Temporarily unavailable"}' });
  });
  await confirmNoViolation(page);
  await page.locator('#moderationConfirmSubmit').click();
  const error = page.locator('#moderationConfirmModal [role="alert"]');
  await expect(error).toHaveText('Temporarily unavailable');
  await page.waitForTimeout(3500);
  await expect(error).toBeVisible();
  await page.locator('#moderationConfirmSubmit').click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toEqual(bodies[0]);
  await expect(page.locator('#decisionReason')).toHaveValue(/available evidence/);
  await page.getByRole('button', { name: 'Cancel decision', exact: true }).click();
  await page.locator('#decisionReason').fill('Updated rationale after reviewing additional context.');
  await page.getByRole('button', { name: 'No violation', exact: true }).click();
  await page.locator('#moderationConfirmSubmit').click();
  await expect.poll(() => bodies.length).toBe(3);
  expect(bodies[2].idempotencyKey).not.toBe(bodies[0].idempotencyKey);
});

test('saved decision is not reported as failed when queue refresh fails', async ({ page }) => {
  await openCase(page);
  let writes = 0;
  await page.route('**/portal/admin/report-decision', route => {
    writes++;
    return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.route('**/portal/admin/command-center?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Refresh failed"}' }));
  await confirmNoViolation(page);
  await page.locator('#moderationConfirmSubmit').click();
  await expect(page.locator('#moderationConfirmModal')).not.toHaveAttribute('open', '');
  await expect(page.locator('#portalDataBanner')).toContainText('Decision saved');
  await expect(page.locator('#portalDataBanner')).toContainText('Do not submit it again');
  expect(writes).toBe(1);
});

test('in-flight decisions cannot be cancelled or submitted twice', async ({ page }) => {
  await openCase(page);
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let writes = 0;
  await page.route('**/portal/admin/report-decision', async route => {
    writes++;
    await pending;
    await route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
  });
  await confirmNoViolation(page);
  await page.locator('#moderationConfirmSubmit').click();
  await expect.poll(() => writes).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#moderationConfirmModal')).toHaveAttribute('open', '');
  await expect(page.getByRole('button', { name: 'Cancel decision', exact: true })).toBeDisabled();
  await page.locator('#moderationConfirmForm').evaluate(form => form.dispatchEvent(new Event('submit', { cancelable: true })));
  expect(writes).toBe(1);
  release();
  await expect(page.locator('#moderationConfirmModal')).not.toHaveAttribute('open', '');
});

test('revoked access clears case, search, confirmation and local session', async ({ page }) => {
  await openCase(page);
  await confirmNoViolation(page);
  await page.route('**/portal/admin/**', route => route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Administrator access required"}' }));
  await invalidate(page);
  await expect(page.locator('#portalApp')).toBeHidden();
  await expect(page.locator('#drawerContent')).toBeEmpty();
  await expect(page.locator('#moderationConfirmModal')).not.toHaveAttribute('open', '');
  expect(await page.evaluate(() => sessionStorage.getItem('doji-admin-session-v1'))).toBeNull();
  await page.keyboard.press('Control+k');
  await expect(page.locator('#globalSearchResults')).toBeEmpty();
});

test('role downgrade clears previously authorized data before narrower views can load', async ({ page }) => {
  await openCase(page);
  await page.route('**/portal/admin/session', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...operatorSession, roles: ['business_reviewer'], capabilities: { business_read: true } }) }));
  await invalidate(page);
  await expect(page.locator('#portalApp')).toBeHidden();
  await expect(page.locator('#drawerContent')).toBeEmpty();
  await expect(page.locator('#adminSigninStatus')).toContainText('permissions changed');
});

test('item-level denial keeps an independently verified employee session and shows inline error', async ({ page }) => {
  await openCase(page);
  await page.route('**/portal/admin/report-decision', route => route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Another reviewer owns this case"}' }));
  await confirmNoViolation(page);
  await page.locator('#moderationConfirmSubmit').click();
  await expect(page.locator('#moderationConfirmError')).toHaveText('Another reviewer owns this case');
  await expect(page.locator('#portalApp')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('doji-admin-session-v1'))).not.toBeNull();
});

test('validation is contextual and unsupported idea history filters are hidden', async ({ page }) => {
  await openCase(page);
  await page.getByRole('button', { name: 'No violation', exact: true }).click();
  await expect(page.locator('#decisionError')).toHaveText(/at least 10 characters/);
  await expect(page.locator('#moderationConfirmModal')).not.toHaveAttribute('open', '');
  await expect(page.locator('[data-queue-filters="suggestions"] [data-queue-filter="approved"]')).toBeHidden();
  await expect(page.locator('[data-queue-filters="suggestions"] [data-queue-filter="resolved"]')).toBeHidden();
});

test('late successful command cannot repopulate a revoked workspace', async ({ page }) => {
  await openCase(page);
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  let started = false;
  await page.route('**/portal/admin/report-decision', async route => {
    started = true;
    await gate;
    await route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
  });
  await confirmNoViolation(page);
  await page.locator('#moderationConfirmSubmit').click();
  await expect.poll(() => started).toBe(true);
  await page.route('**/portal/admin/session', route => route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Access revoked"}' }));
  await invalidate(page);
  await expect(page.locator('#portalApp')).toBeHidden();
  finish();
  await page.waitForTimeout(200);
  await expect(page.locator('#drawerContent')).toBeEmpty();
  await expect(page.locator('#moderationConfirmSummary')).toBeEmpty();
  await expect(page.locator('#portalApp')).toBeHidden();
  expect(await page.evaluate(() => sessionStorage.getItem('doji-admin-session-v1'))).toBeNull();
});

test('triage failures stay in the case and retry uses the same receipt', async ({ page }) => {
  await openCase(page);
  const bodies = [];
  await page.route('**/portal/admin/report-triage', route => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Assignment unavailable"}' });
  });
  await page.getByRole('button', { name: 'Claim case', exact: true }).click();
  await expect(page.locator('#decisionError')).toHaveText('Assignment unavailable');
  await page.getByRole('button', { name: 'Claim case', exact: true }).click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toEqual(bodies[0]);
});

test('ambiguous transport failure explains safe retry and retains the command key', async ({ page }) => {
  await openCase(page);
  const bodies = [];
  await page.route('**/portal/admin/report-decision', route => {
    bodies.push(route.request().postDataJSON());
    return route.abort('failed');
  });
  await confirmNoViolation(page);
  await page.locator('#moderationConfirmSubmit').click();
  await expect(page.locator('#moderationConfirmError')).toContainText('could not confirm whether this action was saved');
  await page.locator('#moderationConfirmSubmit').click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toEqual(bodies[0]);
});
