import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installBusinessFixture, businessId } from './business-fixture';
import { announcementFixture } from '../announcement-fixture';
import type { BrowserRealtimeSdk } from '../../../website/ably-browser.d.mts';

const actor = '10000000-0000-4000-8000-000000000001';
type Call = { name: string; args: Record<string, unknown> };
async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
});

test('completed personal work reconciles identifier hints and removes data after access revocation', async ({
  page,
  request,
}) => {
  const base = await installBusinessFixture(
    page,
    request,
    'success',
    false,
    true,
    true,
    async (page) => {
      await page.addInitScript(() => {
        class MockRealtime {
          handlers: ((message: unknown) => void)[] = [];
          changed: ((change: { current: string }) => void) | undefined;
          channels = {
            get: () => ({
              subscribe: async (handler: (message: unknown) => void) => {
                this.handlers.push(handler);
              },
            }),
          };
          connection = {
            on: (handler: (change: { current: string }) => void) => {
              this.changed = handler;
            },
          };
          receive = (event: Event) =>
            this.handlers.forEach((handler) => handler((event as CustomEvent).detail));
          connected = () => this.changed?.({ current: 'connected' });
          constructor() {
            window.addEventListener('history-hint', this.receive);
            window.addEventListener('history-connect', this.connected);
          }
          connect() {}
          close() {
            window.removeEventListener('history-hint', this.receive);
            window.removeEventListener('history-connect', this.connected);
          }
        }
        window.Ably = { Realtime: MockRealtime } as unknown as BrowserRealtimeSdk;
      });
    },
  );
  let revoked = false,
    reads = 0,
    subject = 'Completed synthetic report';
  await page.route('**/api/session', (route) =>
    route.fulfill({
      json: {
        signedIn: true,
        assurance: 'aal2',
        csrf: 'c'.repeat(43),
        operator: { user_id: actor, capabilities: { moderation_read: !revoked } },
      },
    }),
  );
  await page.route('**/api/rpc', (route) => {
    const call = route.request().postDataJSON() as Call;
    if (call.name === 'get_admin_staff_event_channels_v1')
      return route.fulfill({ json: ['staff:workflow:moderation'] });
    if (call.name !== 'get_admin_personal_work_page_v1') return route.fallback();
    reads++;
    if (revoked) return route.fulfill({ status: 403, json: {} });
    return route.fulfill({
      json: {
        scope: 'personal_work_v1',
        filter: 'completed',
        order: 'oldest_first',
        authorized_queues: ['report'],
        next_cursor: null,
        items: [
          {
            kind: 'report',
            id: businessId,
            key: 'report:' + businessId,
            subject,
            at: '2026-10-08T12:00:00Z',
            assigned_to: actor,
            work_state: 'closed',
            due_at: null,
            ownership_model: 'existing_report',
          },
        ],
      },
    });
  });
  await page.goto('https://admin.dojipro.com/connected.html#/my-work?state=completed');
  await expect(page.getByText(subject, { exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('history-connect')));
  await expect(page.getByText('Queue updates: connected', { exact: true })).toBeVisible();
  await expect.poll(() => reads).toBeGreaterThan(1);
  const before = reads;
  subject = 'Updated authorized completed report';
  await page.evaluate((id) => {
    for (let i = 0; i < 10; i++)
      window.dispatchEvent(
        new CustomEvent('history-hint', {
          detail: {
            name: 'staff.case.changed',
            data: {
              kind: 'report',
              id,
              aggregateId: id,
              eventId: 'history-test-1',
              subject: 'Untrusted socket content',
            },
          },
        }),
      );
  }, businessId);
  await expect(page.getByText(subject, { exact: true })).toBeVisible();
  expect(reads).toBe(before + 1);
  await expect(page.getByText('Untrusted socket content')).toHaveCount(0);
  revoked = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText(subject, { exact: true })).toHaveCount(0);
  expect(base.commands).toEqual([]);
  expect(base.external).toEqual([]);
});

test('personal status and page size reset cursors; completed records return to the same filter', async ({
  page,
  request,
}, info) => {
  const base = await installBusinessFixture(page, request, 'success', false, true, true);
  const calls: Call[] = [];
  let fail = false;
  await page.route('**/api/rpc', (route) => {
    const call = route.request().postDataJSON() as Call;
    if (call.name !== 'get_admin_personal_work_page_v1') return route.fallback();
    calls.push(call);
    if (fail) return route.fulfill({ status: 403, json: {} });
    const offset = call.args.p_after_key ? 30 : 0;
    const size = Number(call.args.p_limit);
    const items = Array.from({ length: size }, (_, index) => {
      const id =
        offset === 0 && index === 0
          ? businessId
          : '20000000-0000-4000-8000-' + String(offset + index + 100).padStart(12, '0');
      return {
        id,
        key: 'business_application:' + id,
        kind: 'business_application',
        subject: 'Assigned business ' + (offset + index + 1),
        at: '2026-10-08T12:00:00Z',
        assigned_to: actor,
        work_state: call.args.p_state === 'completed' ? 'closed' : 'ready',
        due_at: null,
        ownership_model: 'staff_workflow',
      };
    });
    const tail = items.at(-1)!;
    return route.fulfill({
      json: {
        scope: 'personal_work_v1',
        filter: call.args.p_state,
        order: 'oldest_first',
        authorized_queues: ['business_application'],
        items,
        next_cursor: offset ? null : { at: tail.at, key: tail.key },
      },
    });
  });
  await page.goto('https://admin.dojipro.com/connected.html#/my-work');
  await expect(page.getByRole('combobox', { name: 'Work status' })).toHaveText('Open');
  await expect(page.getByRole('link', { name: 'Assigned business 1', exact: true })).toBeVisible();
  await choose(page, 'Rows per page:', '5');
  await expect.poll(() => calls.at(-1)?.args.p_limit).toBe(5);
  await page.getByRole('button', { name: 'Go to next page' }).click();
  await expect(page.getByRole('link', { name: 'Assigned business 31', exact: true })).toBeVisible();
  await choose(page, 'Work status', 'Completed');
  await expect(page.getByRole('link', { name: 'Assigned business 1', exact: true })).toBeVisible();
  expect(calls.at(-1)?.args.p_after_key).toBeNull();
  await choose(page, 'Work status', 'Open');
  await expect(page.getByRole('button', { name: 'Go to previous page' })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Assigned business 1', exact: true })).toBeVisible();
  await choose(page, 'Work status', 'Completed');
  await page.getByRole('link', { name: 'Assigned business 1', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Synthetic business', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to my work', exact: true }).click();
  await expect(page).toHaveURL(/#\/my-work\?state=completed$/);
  await expect(page.getByRole('combobox', { name: 'Work status' })).toHaveText('Completed');
  await expect(page.getByRole('link', { name: 'Assigned business 1', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('personal-completed.png'), fullPage: true });
  fail = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Retry queue read' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Assigned business 1', exact: true })).toHaveCount(0);
  expect(calls.every((call) => !('p_assignee' in call.args) && !('p_filter' in call.args))).toBe(
    true,
  );
  expect(base.commands).toEqual([]);
  expect(base.external).toEqual([]);
});

test('announcement lifecycle defaults active, filters history in place, resets paging and reconciles expiry', async ({
  page,
  request,
}, info) => {
  const base = await installBusinessFixture(page, request, 'success', false, true, true);
  await page.route('**/api/session', (route) =>
    route.fulfill({
      json: {
        signedIn: true,
        assurance: 'aal2',
        csrf: 'c'.repeat(43),
        operator: { user_id: actor, capabilities: { operations_read: true } },
      },
    }),
  );
  const calls: Call[] = [];
  let expired = false;
  await page.route('**/api/rpc', (route) => {
    const call = route.request().postDataJSON() as Call;
    if (call.name === 'get_admin_editorial_item_v1')
      return route.fulfill({
        json: { ...announcementFixture(), id: call.args.p_id, display_state: 'expired' },
      });
    if (call.name !== 'get_admin_announcement_lifecycle_page_v1') return route.fallback();
    calls.push(call);
    const offset = call.args.p_before_id ? 30 : 0;
    const size = Number(call.args.p_limit);
    const items =
      expired && call.args.p_filter === 'active'
        ? []
        : Array.from({ length: size }, (_, index) => ({
            ...announcementFixture(),
            id: '30000000-0000-4000-8000-' + String(1000 - offset - index).padStart(12, '0'),
            title: 'History message ' + (offset + index + 1),
            display_state: call.args.p_filter === 'expired' ? 'expired' : 'live',
          }));
    const tail = items.at(-1);
    return route.fulfill({
      json: {
        scope: 'announcement_lifecycle_v1',
        filter: call.args.p_filter,
        can_write: false,
        items,
        next_cursor: !offset && tail ? { at: tail.created_at, id: tail.id } : null,
      },
    });
  });
  await page.goto('https://admin.dojipro.com/connected.html#/announcements');
  await expect(page.getByRole('combobox', { name: 'Announcement status' })).toHaveText(
    'Active announcements',
  );
  await expect(page.getByRole('link', { name: 'History message 1', exact: true })).toBeVisible();
  await choose(page, 'Rows per page:', '5');
  await expect.poll(() => calls.at(-1)?.args.p_limit).toBe(5);
  await page.getByRole('button', { name: 'Go to next page' }).click();
  await expect(page.getByRole('link', { name: 'History message 31', exact: true })).toBeVisible();
  await choose(page, 'Announcement status', 'Expired');
  await expect(page.getByRole('link', { name: 'History message 1', exact: true })).toBeVisible();
  await choose(page, 'Announcement status', 'Active announcements');
  await expect(page.getByRole('button', { name: 'Go to previous page' })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'History message 1', exact: true })).toBeVisible();
  expired = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('No announcements match this status.')).toBeVisible();
  await choose(page, 'Announcement status', 'Expired');
  await page.getByRole('link', { name: 'History message 1', exact: true }).click();
  await expect(page.getByText('Synthetic announcement body.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to announcements', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Announcement status' })).toHaveText('Expired');
  await expect(page.getByRole('link', { name: 'History message 1', exact: true })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('announcements-expired.png'), fullPage: true });
  expect(calls.every((call) => Number(call.args.p_limit) <= 25)).toBe(true);
  expect(base.commands).toEqual([]);
  expect(base.external).toEqual([]);
});
