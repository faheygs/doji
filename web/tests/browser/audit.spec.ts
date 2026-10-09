import { expect, test } from '@playwright/test';
import { installIdeaFixture } from './idea-fixture';
import { auditFixture } from '../audit-fixture';
test('audit spinner, keyset paging, explicit search and error clearing', async ({
  page,
  request,
}) => {
  await installIdeaFixture(page, request);
  const reads: Record<string, unknown>[] = [];
  let release = () => {},
    failed = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/rpc', async (route) => {
    const call = route.request().postDataJSON() as { name: string; args: Record<string, unknown> };
    if (call.name === 'get_admin_staff_event_channels_v1') return route.fulfill({ json: [] });
    expect(call.name).toBe('get_admin_audit_page_v2');
    reads.push(call.args);
    if (reads.length === 1) await gate;
    if (failed) return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
    const offset = call.args.p_before_id ? 25 : 0;
    return route.fulfill({
      json: auditFixture(
        offset ? 1 : 25,
        String(call.args.p_category),
        call.args.p_search ? String(call.args.p_search).toLowerCase() : null,
        offset,
      ),
    });
  });
  await page.goto('https://admin.dojipro.com/connected.html#/audit');
  await expect(page.getByRole('progressbar', { name: 'Loading audit log' })).toBeVisible();
  release();
  await expect(page.getByRole('cell', { name: 'Synthetic review 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /next page/i }).click();
  await expect(page.getByRole('cell', { name: 'Synthetic review 26', exact: true })).toBeVisible();
  expect(reads.at(-1)?.p_before_id).toBe(auditFixture().next_cursor?.id);
  const beforeTyping = reads.length;
  await page.getByRole('textbox', { name: 'Search audit' }).fill('review');
  expect(reads).toHaveLength(beforeTyping);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Synthetic review 1', exact: true })).toBeVisible();
  expect(reads.at(-1)).toMatchObject({ p_before_id: null, p_limit: 25, p_search: 'review' });
  failed = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Retry audit read' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Synthetic review 1', exact: true })).toHaveCount(0);
});
test('employee without operations permission cannot dispatch audit reads', async ({
  page,
  request,
}) => {
  const { installBusinessFixture } = await import('./business-fixture');
  const f = await installBusinessFixture(page, request);
  await page.goto('https://admin.dojipro.com/connected.html#/audit');
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible();
  expect(f.reads).not.toContain('get_admin_audit_page_v2');
});
