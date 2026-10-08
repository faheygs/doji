import { expect, test } from '../../coverage-fixture.mts';
import { installMockBackend, seedAdminSession } from './fixtures.mts';

test('audit loading is centered with the shared spinner and clears after completion', async ({page},info) => {
  await seedAdminSession(page);
  await installMockBackend(page);
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/portal/admin/audit?**',async route=>{await gate;await route.fulfill({json:{items:[],next_cursor:null}});});
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  await page.locator('.portalNav [data-view="audit"]').click();
  const state=page.locator('#auditList .queueState');
  await expect(state).toContainText('Loading audit activity');
  await expect(page.locator('#auditList')).toHaveAttribute('aria-busy','true');
  await expect(page.locator('[data-portal-view="audit"] .workspacePager')).toContainText('Loading');
  expect(await state.evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('adminQueueSpin');
  expect(await state.evaluate(el=>Math.abs(el.getBoundingClientRect().height-el.parentElement!.getBoundingClientRect().height))).toBeLessThan(2);
  await page.screenshot({path:info.outputPath('audit-loading.png')});
  release();
  await expect(page.locator('#auditList')).toHaveAttribute('aria-busy','false');
});

test('overview loads bounded health history but not hidden archives, audit or access', async ({
  page,
}) => {
  await seedAdminSession(page);
  const requests = await installMockBackend(page);
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  await expect(page.locator('#inboxNavCount')).toHaveText('…');
  await expect.poll(() => requests.some((r) => r.path.endsWith('/platform-health'))).toBe(true);
  for (const path of [
    '/resolved-reports',
    '/audit',
    '/operators',
    '/work-queue',
  ]) {
    expect(
      requests.some((r) => new URL(r.path, 'https://fixture.invalid').pathname.endsWith(path)),
      path,
    ).toBe(false);
  }
  await expect.poll(() => requests.some(r => r.path.includes('/platform-health-history'))).toBe(true);
  await page.locator('[data-view="audit"]').click();
  await expect(page.locator('#auditList .auditRow').first()).toBeVisible();
  expect(
    requests.some((r) => new URL(r.path, 'https://fixture.invalid').pathname.endsWith('/audit')),
  ).toBe(true);
  expect(requests.some((r) => r.path.endsWith('/operators'))).toBe(false);
  await page.locator('[data-view="access"]').click();
  await expect.poll(() => requests.some((r) => r.path.endsWith('/operators'))).toBe(true);
  await expect(page.locator('#operatorList')).not.toContainText('Loading operator access');
  await page.locator('[data-view="operations"]').click();
  await expect
    .poll(() =>
      requests.some((r) =>
        new URL(r.path, 'https://fixture.invalid').pathname.endsWith('/platform-health-history'),
      ),
    )
    .toBe(true);
});

test('slow secondary reads cannot hold sign-in; late replies cannot restore locked data', async ({
  page,
}) => {
  await seedAdminSession(page);
  await installMockBackend(page);
  let release: () => void = () => {
    throw Error('Gate not initialized');
  };
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/portal/admin/operators', async (route) => {
    await gate;
    await route.fulfill({
      json: { items: [{ display_name: 'Late protected operator', roles: [] }] },
    });
  });
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  await page.locator('[data-view="access"]').click();
  await expect(page.locator('#operatorList')).toContainText('Loading operator access');
  await page.getByRole('button', { name: 'Lock session' }).click();
  release();
  await expect(page.locator('#portalApp')).toBeHidden();
  await expect(page.locator('#operatorList')).not.toContainText('Late protected operator');
});
