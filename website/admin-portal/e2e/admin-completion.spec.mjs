import { expect, test } from '../../coverage-fixture.mjs';
import { installMockBackend, seedAdminSession, reportId, reportCase, auditPage, commandCenter } from './fixtures.mjs';

async function start(page, options = {}) {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await seedAdminSession(page, true);
  await installMockBackend(page, { employeeMode: true, ...options });
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
}
async function roleForm(page) {
  await page.getByRole('button', { name: 'Access & roles', exact: true }).click();
  await page.locator('#operatorUsername').fill('staff@example.invalid');
  await page.locator('#operatorRoleReason').fill('Approved internal moderation coverage.');
}
const submitRole = page => page.getByRole('button', { name: 'Record access change', exact: true }).click();

test('staff access manual retry retains receipt and changed rationale creates a new intent', async ({ page }) => {
  await start(page); await roleForm(page);
  const bodies = [];
  await page.route('**/portal/admin/operator-role', route => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { error: 'Access service unavailable' } });
  });
  await submitRole(page);
  await expect(page.locator('#operatorRoleStatus')).toHaveText('Access service unavailable');
  await submitRole(page);
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[0]).toEqual(bodies[1]);
  await expect(page.locator('#operatorRoleReason')).toBeEnabled();
  await page.locator('#operatorRoleReason').fill('Changed coverage plan after review.');
  await submitRole(page);
  await expect.poll(() => bodies.length).toBe(3);
  expect(bodies[2].idempotencyKey).not.toBe(bodies[0].idempotencyKey);
});

test('staff access success remains saved when directory refresh fails', async ({ page }) => {
  await start(page); await roleForm(page);
  await page.route('**/portal/admin/operators', route => route.fulfill({ status: 503, json: { error: 'Directory unavailable' } }));
  await submitRole(page);
  await expect(page.locator('#operatorRoleStatus')).toContainText('Access change saved');
  await expect(page.locator('#operatorRoleStatus')).toContainText('Do not submit it again');
});

test('pending staff access is single-flight and cannot repaint after lock', async ({ page }) => {
  await start(page); await roleForm(page);
  let finish, writes = 0;
  const pending = new Promise(resolve => { finish = resolve; });
  await page.route('**/portal/admin/operator-role', async route => {
    writes++; await pending; await route.fulfill({ json: { ok: true } });
  });
  await submitRole(page);
  await expect.poll(() => writes).toBe(1);
  await expect(page.locator('#operatorUsername')).toBeDisabled();
  await page.locator('#operatorRoleForm').evaluate(form => form.dispatchEvent(new Event('submit', { cancelable: true })));
  expect(writes).toBe(1);
  await page.getByRole('button', { name: 'Lock session', exact: true }).click();
  finish();
  await expect(page.locator('#portalApp')).toBeHidden();
  await expect(page.locator('#operatorRoleStatus')).toBeEmpty();
  await expect(page.locator('#operatorList')).toBeEmpty();
});

test('claim next reads authoritative case before sending a command and retains inline failure', async ({ page }) => {
  await start(page);
  let reads = 0, writes = 0;
  await page.route('**/portal/admin/report-case-v3?*', route => { reads++; return route.fulfill({ json: reportCase }); });
  await page.route('**/portal/admin/report-triage', route => {
    writes++; expect(reads).toBeGreaterThan(0);
    return route.fulfill({ status: 503, json: { error: 'Claim unavailable' } });
  });
  await page.locator('[data-view="inbox"]').click();
  await page.locator('[data-action="claim-next"]').click();
  await expect(page.locator('#decisionError')).toHaveText('Claim unavailable');
  expect(writes).toBe(1);
});

test('claim next does not claim a case assigned since the queue snapshot', async ({ page }) => {
  await start(page, { reportCase: { ...reportCase, assigned_to: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', owner: { display_name: 'Other reviewer' } } });
  let writes = 0;
  await page.route('**/portal/admin/report-triage', route => { writes++; return route.fulfill({ json: { ok: true } }); });
  await page.locator('[data-view="inbox"]').click();
  await page.locator('[data-action="claim-next"]').click();
  await expect(page.locator('#decisionError')).toContainText('no longer unassigned');
  expect(writes).toBe(0);
});

test('late audit export cannot download protected data after lock', async ({ page }) => {
  await start(page);
  let finish, started = false, downloads = 0;
  const pending = new Promise(resolve => { finish = resolve; });
  page.on('download', () => { downloads++; });
  await page.route('**/portal/admin/audit-export?*', async route => {
    started = true; await pending; await route.fulfill({ json: auditPage });
  });
  await page.getByRole('button', { name: 'Audit log', exact: true }).click();
  await page.locator('[data-action="export-audit"]').click();
  await expect.poll(() => started).toBe(true);
  await page.getByRole('button', { name: 'Lock session', exact: true }).click();
  finish(); await page.waitForTimeout(300);
  expect(downloads).toBe(0);
});

test('archived audit link errors stay in the dialog and closed dialogs reject late responses', async ({ page }) => {
  await start(page, { commandCenter: { ...commandCenter, work_items: [] } });
  await page.getByRole('button', { name: 'Audit log', exact: true }).click();
  await page.locator('[data-audit-id]').first().click();
  await page.route('**/portal/admin/report-case-v3?*', route => route.fulfill({ status: 503, json: { error: 'Case temporarily unavailable' } }));
  await page.getByRole('button', { name: 'Open related case', exact: true }).click();
  await expect(page.locator('#auditRelatedError')).toHaveText('Case temporarily unavailable');
  let finish, started = false;
  const pending = new Promise(resolve => { finish = resolve; });
  await page.route('**/portal/admin/report-case-v3?*', async route => {
    started = true; await pending; await route.fulfill({ json: reportCase });
  });
  await page.getByRole('button', { name: 'Open related case', exact: true }).click();
  await expect.poll(() => started).toBe(true);
  await page.keyboard.press('Escape');
  finish(); await page.waitForTimeout(300);
  await expect(page.locator('#caseDrawer')).toHaveAttribute('aria-hidden', 'true');
});
