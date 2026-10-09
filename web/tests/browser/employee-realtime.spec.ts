import { expect, test } from '@playwright/test';
import type { BrowserRealtimeSdk } from '../../../website/ably-browser.d.mts';

test('connected queues refresh from validated socket hints and stop on logout', async ({
  page,
  request,
}) => {
  const actor = '10000000-0000-4000-8000-000000000001';
  const id = '20000000-0000-4000-8000-000000000002';
  let signedIn = true;
  let subject = 'Initial synthetic report';
  let reads = 0;
  const external: string[] = [];
  await page.routeWebSocket('**/*', (socket) => socket.close());
  await page.addInitScript(() => {
    class MockRealtime {
      handler: ((message: unknown) => void) | undefined;
      changed: ((change: { current: string }) => void) | undefined;
      channels = {
        get: () => ({
          subscribe: async (handler: (message: unknown) => void) => {
            this.handler = handler;
          },
        }),
      };
      connection = {
        on: (handler: (change: { current: string }) => void) => {
          this.changed = handler;
        },
      };
      receive = (event: Event) => this.handler?.((event as CustomEvent).detail);
      connected = () => this.changed?.({ current: 'connected' });
      constructor() {
        window.addEventListener('test-staff-event', this.receive);
        window.addEventListener('test-staff-connect', this.connected);
      }
      connect() {
        // Test explicitly connects after lazy mounting and initial queue reads settle.
      }
      close() {
        window.removeEventListener('test-staff-event', this.receive);
        window.removeEventListener('test-staff-connect', this.connected);
      }
    }
    window.Ably = { Realtime: MockRealtime } as unknown as BrowserRealtimeSdk;
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://admin.dojipro.com') {
      external.push(url.origin);
      await route.abort();
      return;
    }
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (url.pathname === '/api/session') {
      await json(
        signedIn
          ? {
              signedIn: true,
              assurance: 'aal2',
              csrf: 'c'.repeat(43),
              operator: { user_id: actor, capabilities: { moderation_read: true } },
            }
          : {},
        signedIn ? 200 : 401,
      );
      return;
    }
    if (url.pathname === '/auth/logout') {
      signedIn = false;
      await json({ signedIn: false });
      return;
    }
    if (url.pathname === '/api/rpc') {
      const { name } = route.request().postDataJSON() as { name: string };
      if (!signedIn) {
        await json({}, 401);
        return;
      }
      if (name === 'get_admin_staff_event_channels_v1') {
        await json(['staff:workflow:moderation']);
        return;
      }
      if (name !== 'get_admin_staff_work_page_v1') {
        await json({}, 403);
        return;
      }
      reads++;
      await json({
        scope: 'staff_inbox_v1',
        order: 'oldest_first',
        authorized_queues: ['report'],
        next_cursor: null,
        items: [
          {
            kind: 'report',
            id,
            key: 'report:' + id,
            subject,
            at: '2026-10-08T12:00:00Z',
            assigned_to: actor,
            work_state: 'ready',
            due_at: null,
            ownership_model: 'existing_report',
          },
        ],
      });
      return;
    }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
      await json({}, 404);
      return;
    }
    const asset = await request.get('http://127.0.0.1:4310' + url.pathname + url.search);
    if (url.pathname === '/connected.html') {
      await route.fulfill({
        contentType: 'text/html',
        body: (await asset.text()).replace(
          '<head>',
          '<head><script>window.DOJI_REACT_ADMIN_CONFIG={independentEmployeeIdentity:true,staffWorkflowEnabled:true};</script>',
        ),
      });
    } else await route.fulfill({ response: asset });
  });
  await page.goto('https://admin.dojipro.com/connected.html#/my-work');
  await expect(page.getByText('Initial synthetic report')).toBeVisible();
  const initialReads = reads;
  await page.evaluate(() => window.dispatchEvent(new Event('test-staff-connect')));
  await expect(page.getByText('Queue updates: connected', { exact: true })).toBeVisible();
  await expect.poll(() => reads).toBe(initialReads + 1);
  const before = reads;
  subject = 'Updated through authorized read';
  await page.evaluate((id) => {
    for (let i = 0; i < 20; i++)
      window.dispatchEvent(
        new CustomEvent('test-staff-event', {
          detail: {
            name: 'staff.case.changed',
            data: {
              kind: 'report',
              id,
              aggregateId: id,
              eventId: 'synthetic-event',
              subject: 'Never trust this payload',
            },
          },
        }),
      );
  }, id);
  await expect(page.getByText(subject)).toBeVisible();
  expect(reads).toBe(before + 1);
  await expect(page.getByText('Never trust this payload')).toHaveCount(0);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Lock and sign out' }).click();
  await expect(page.getByLabel(/Work email/)).toBeVisible();
  await page.evaluate(
    (id) =>
      window.dispatchEvent(
        new CustomEvent('test-staff-event', {
          detail: {
            name: 'staff.case.changed',
            data: { kind: 'report', id, aggregateId: id, eventId: 'after-logout' },
          },
        }),
      ),
    id,
  );
  await expect(page.getByText(subject)).toHaveCount(0);
  expect(reads).toBe(before + 1);
  expect(external).toEqual([]);
});
