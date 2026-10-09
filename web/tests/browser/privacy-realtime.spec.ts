import { expect, test } from '@playwright/test';
import type { BrowserRealtimeSdk } from '../../../website/ably-browser.d.mts';
import { installPrivacyFixture, privacyUrl } from './privacy-fixture';
import { privacyId } from '../privacy-fixture';
test('privacy hints and reconnect reauthorize bounded reads; payloads never become records', async ({
  page,
  request,
}) => {
  const f = await installPrivacyFixture(page, request);
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
        window.addEventListener('test-privacy-event', this.receive);
        window.addEventListener('test-privacy-connect', this.connected);
      }
      connect() {}
      close() {
        window.removeEventListener('test-privacy-event', this.receive);
        window.removeEventListener('test-privacy-connect', this.connected);
      }
    }
    window.Ably = { Realtime: MockRealtime } as unknown as BrowserRealtimeSdk;
  });
  await page.route('**/api/rpc', (route) => {
    if (route.request().postDataJSON().name === 'get_admin_staff_event_channels_v1')
      return route.fulfill({ json: ['staff:workflow:privacy'] });
    return route.fallback();
  });
  await page.goto(privacyUrl + '/' + privacyId);
  await expect(page.getByText('verified-support-001', { exact: true })).toBeVisible();
  await expect(page.getByText('Queue updates: connecting', { exact: true })).toBeVisible();
  const reads = () =>
    f.calls.filter((call) => call.name === 'get_admin_business_privacy_case_v1').length;
  const initial = reads();
  f.data.verification_reference = 'from-authorized-reconnect';
  await page.evaluate(() => window.dispatchEvent(new Event('test-privacy-connect')));
  await expect(page.getByText('from-authorized-reconnect', { exact: true })).toBeVisible();
  expect(reads()).toBe(initial + 1);
  const before = reads();
  f.data.verification_reference = 'from-authorized-hint';
  await page.evaluate((id) => {
    for (let i = 0; i < 10; i++)
      window.dispatchEvent(
        new CustomEvent('test-privacy-event', {
          detail: {
            name: 'staff.case.changed',
            data: {
              kind: 'business_privacy',
              id,
              aggregateId: id,
              eventId: 'synthetic-privacy-event',
              verification_reference: 'never-trust-event-data',
            },
          },
        }),
      );
  }, privacyId);
  await expect(page.getByText('from-authorized-hint', { exact: true })).toBeVisible();
  expect(reads()).toBe(before + 1);
  await expect(page.getByText('never-trust-event-data')).toHaveCount(0);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Lock and sign out' }).click();
  await expect(page.getByLabel(/Work email/)).toBeVisible();
  await expect(page.getByText('from-authorized-hint', { exact: true })).toHaveCount(0);
  expect(f.external).toEqual([]);
});
