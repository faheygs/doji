import { test, expect } from '../../coverage-fixture.mjs';
import {
  seedAdminSession,
  installMockBackend,
  commandCenter,
  operatorSession,
  auditPage,
} from './fixtures.mjs';

async function open(
  page,
  { employeeMode = true, session = operatorSession, directory = { items: [] }, fail = false } = {},
) {
  await seedAdminSession(page, employeeMode);
  const requests = await installMockBackend(page, { employeeMode, session });
  await page.route('**/portal/admin/operators', (route) => {
    requests.push({
      method: route.request().method(),
      path: new URL(route.request().url()).pathname,
    });
    return route.fulfill({
      status: fail ? 503 : 200,
      json: fail ? { error: 'Synthetic directory unavailable' } : directory,
    });
  });
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  return requests;
}

for (const [employeeMode, status, expected] of [
  [true, 'pending', 'Pending approval'],
  [true, 'disabled', 'Disabled'],
  [true, 'active', 'Active'],
  [false, 'banned', 'Banned'],
  [false, 'active', 'Active'],
]) {
  test(`operator directory ${employeeMode ? 'employee' : 'legacy'} ${status} renders explicit status and escaped roles`, async ({
    page,
  }) => {
    await open(page, {
      employeeMode,
      directory: {
        items: [
          {
            display_name: '<b>Synthetic Operator</b>',
            username: 'synthetic',
            status,
            is_banned: status === 'banned',
            is_founder_admin: true,
            roles: ['super_admin', '<script>role</script>'],
            last_changed_at: new Date().toISOString(),
          },
          { username: 'fallback', roles: null },
          {},
        ],
      },
    });
    await page.locator('#operatorAccessNav').click();
    const rows = page.locator('#operatorList .operatorRow');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText(expected);
    await expect(rows.first()).toContainText('Founder super admin');
    await expect(rows.first()).toContainText('<b>Synthetic Operator</b>');
    await expect(rows.first().locator('script, b')).toHaveCount(0);
    await expect(rows.nth(1)).toContainText('fallback');
    await expect(rows.nth(2)).toContainText('Doji member');
    await expect(rows.nth(2)).toContainText('unknown');
  });
}

for (const directory of [{}, { items: {} }, { items: [] }]) {
  test(`operator directory ${JSON.stringify(directory)} does not invent delegated accounts`, async ({
    page,
  }) => {
    await open(page, { directory });
    await page.locator('#operatorAccessNav').click();
    await expect(page.locator('#operatorList')).toContainText('No delegated operators');
    await expect(page.locator('#operatorList .operatorRow')).toHaveCount(0);
  });
}

test('failed operator directory is unavailable, not an empty staff list', async ({ page }) => {
  await open(page, { fail: true });
  await page.locator('#operatorAccessNav').click();
  await expect(page.locator('#operatorList')).toContainText('Operator access could not be loaded');
  await expect(page.locator('#operatorList')).not.toContainText('No delegated operators');
});

test('operator directory capability denial hides navigation and issues no directory read', async ({
  page,
}) => {
  const requests = await open(page, {
    session: {
      ...operatorSession,
      capabilities: { ...operatorSession.capabilities, operator_manage: false },
    },
  });
  await expect(page.locator('#operatorAccessNav')).toBeHidden();
  // A stale navigation event must not reveal the role form.
  await page.locator('#operatorAccessNav').evaluate((button) => button.click());
  await expect(page.locator('[data-portal-view="access"]')).toBeHidden();
  expect(requests.filter((r) => r.path.endsWith('/operators'))).toEqual([]);
});

for (const action of ['grant', 'revoke']) {
  test(`operator ${action} confirms one exact audited command and resets the form`, async ({
    page,
  }) => {
    const requests = await open(page);
    await page.locator('#operatorAccessNav').click();
    await page.locator('#operatorUsername').fill('synthetic@example.test');
    await page.locator('#operatorRoleAction').selectOption(action);
    await page.locator('#operatorRoleSelect').selectOption('operations');
    await page.locator('#operatorRoleReason').fill('Synthetic approved coverage only.');
    await page.locator('#operatorRoleForm button[type="submit"]').click();
    await expect(page.locator('#operatorRoleStatus')).toHaveText(
      `${action === 'grant' ? 'Granted' : 'Revoked'} Operations for synthetic@example.test.`,
    );
    await expect(page.locator('#operatorRoleReason')).toHaveValue('');
    await expect(page.locator('#operatorUsername')).toBeEnabled();
    const commands = requests.filter((r) => r.path.endsWith('/operator-role'));
    expect(commands).toHaveLength(1);
    expect(JSON.parse(commands[0].body)).toMatchObject({
      username: 'synthetic@example.test',
      role: 'operations',
      active: action === 'grant',
      reason: 'Synthetic approved coverage only.',
    });
  });
}

test('audit search and category reach bounded export, with CSV formula escaping and truncation notice', async ({
  page,
}) => {
  await open(page);
  const exportUrls = [];
  const reads = [];
  await page.route('**/portal/admin/audit?*', (route) => {
    reads.push(new URL(route.request().url()));
    return route.fulfill({ json: { items: [], next_cursor: null } });
  });
  await page.route('**/portal/admin/audit-export?*', (route) => {
    exportUrls.push(new URL(route.request().url()));
    return route.fulfill({
      json: {
        items: ['=SUM(1,2)', '+formula', '-formula', '@formula', 'quoted "reason"'].map(
          (reason, i) => ({ ...auditPage.items[0], id: `synthetic-${i}`, reason }),
        ),
        truncated: true,
      },
    });
  });
  await page.locator('.portalNav [data-view="audit"]').click();
  await page.locator('[data-audit-filter="access"]').click();
  await page.locator('#auditSearch').fill('Synthetic term');
  await expect.poll(() => reads.at(-1)?.searchParams.get('search')).toBe('Synthetic term');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-action="export-audit"]').click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain('"\'=SUM(1,2)"');
  for (const prefix of ['+', '-', '@']) expect(csv).toContain(`"'${prefix}formula"`);
  expect(csv).toContain('"quoted ""reason"""');
  expect(exportUrls[0].searchParams.get('category')).toBe('access');
  expect(exportUrls[0].searchParams.get('search')).toBe('Synthetic term');
  await expect(page.locator('#auditExportFeedback')).toHaveText(
    'Exported 5 matching audit events (server limit reached).',
  );
});

test('claim-next with no available report makes no moderation command', async ({ page }) => {
  await seedAdminSession(page, true);
  const requests = await installMockBackend(page, {
    employeeMode: true,
    commandCenter: { ...commandCenter, work_items: [] },
  });
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  await page.locator('.portalNav [data-view="inbox"]').click();
  await page.locator('[data-action="claim-next"]').click();
  await expect(page.locator('#toast')).toContainText(
    'There are no unassigned reports in this page',
  );
  expect(requests.filter((r) => r.path.endsWith('/report-triage'))).toEqual([]);
});
