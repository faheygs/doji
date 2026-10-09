import { expect, test } from '@playwright/test';
import { installIdeaFixture } from './idea-fixture';
import { auditFixture } from '../audit-fixture';
const url = 'https://admin.dojipro.com/connected.html#/audit';
test('audit full-page detail and filtered bounded CSV are safe and explicit', async ({
  page,
  request,
}) => {
  await installIdeaFixture(page, request);
  const exports: Record<string, unknown>[] = [];
  await page.route('**/api/rpc', (route) => {
    const call = route.request().postDataJSON() as { name: string; args: Record<string, unknown> };
    if (call.name === 'get_admin_staff_event_channels_v1') return route.fulfill({ json: [] });
    const data = auditFixture(
      1,
      String(call.args.p_category),
      call.args.p_search ? String(call.args.p_search).toLowerCase() : null,
    );
    Object.assign(data.items[0]!, {
      request_id: 'synthetic-request',
      metadata: { note: '<script>safe text</script>' },
    });
    if (call.name === 'get_admin_audit_export_v1') {
      exports.push(call.args);
      data.items[0]!.reason = '=SUM(1,2)';
      return route.fulfill({ json: { items: data.items, maximum: 5000, truncated: true } });
    }
    expect(call.name).toBe('get_admin_audit_page_v2');
    return route.fulfill({ json: data });
  });
  await page.goto(url);
  await page.getByRole('cell', { name: 'Synthetic review 1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Event details' })).toBeVisible();
  await expect(page.getByText('synthetic-request', { exact: true })).toBeVisible();
  await expect(page.getByText('<script>safe text</script>', { exact: false })).toBeVisible();
  expect(exports).toHaveLength(0);
  await page.getByRole('button', { name: 'Back to audit log' }).click();
  await page.getByRole('textbox', { name: 'Search audit' }).fill('review');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const file = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export matching CSV' }).click();
  const stream = await (await file).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain('"\'=SUM(1,2)"');
  expect(csv).not.toContain('<script>');
  expect(exports).toEqual([{ p_category: 'activity', p_search: 'review' }]);
  await expect(page.getByText('server limit reached', { exact: false })).toBeVisible();
});
test('late audit export after logout cannot download or retain audit details', async ({
  page,
  request,
}) => {
  await installIdeaFixture(page, request);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false,
    downloads = 0;
  page.on('download', () => downloads++);
  await page.route('**/api/rpc', async (route) => {
    const { name } = route.request().postDataJSON() as { name: string };
    if (name === 'get_admin_staff_event_channels_v1') return route.fulfill({ json: [] });
    if (name === 'get_admin_audit_export_v1') {
      started = true;
      await gate;
      return route.fulfill({
        json: { items: auditFixture(1).items, maximum: 5000, truncated: false },
      });
    }
    return route.fulfill({ json: auditFixture(1) });
  });
  await page.goto(url);
  await expect(page.getByRole('cell', { name: 'Synthetic review 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Export matching CSV' }).click();
  await expect.poll(() => started).toBe(true);
  try {
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Lock and sign out' }).click();
  } finally {
    release();
  }
  await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
  expect(downloads).toBe(0);
  await expect(page.getByText('Synthetic review 1', { exact: true })).toHaveCount(0);
});

test('export failure downloads nothing and denied reconciliation clears open audit details', async ({
  page,
  request,
}, info) => {
  await installIdeaFixture(page, request);
  let denied = false,
    downloads = 0;
  page.on('download', () => downloads++);
  await page.route('**/api/rpc', (route) => {
    const { name } = route.request().postDataJSON() as { name: string };
    if (name === 'get_admin_staff_event_channels_v1') return route.fulfill({ json: [] });
    if (name === 'get_admin_audit_export_v1') return route.fulfill({ status: 503, json: {} });
    if (denied) return route.fulfill({ status: 403, json: {} });
    return route.fulfill({ json: auditFixture(1) });
  });
  await page.goto(url);
  await page.getByRole('button', { name: 'Export matching CSV' }).click();
  await expect(page.getByText('Audit export unavailable. No file was downloaded.')).toBeVisible();
  expect(downloads).toBe(0);
  await page.getByRole('cell', { name: 'Synthetic review 1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Event details' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('audit-detail.png'), fullPage: true });
  denied = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('This event is no longer available', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Event details' })).toHaveCount(0);
  await expect(page.getByText('Synthetic review 1', { exact: true })).toHaveCount(0);
});
