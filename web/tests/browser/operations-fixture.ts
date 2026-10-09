import type { Page, APIRequestContext } from '@playwright/test';
import { installBusinessFixture } from './business-fixture';
import { healthFixture, historyFixture } from '../health-fixture';

export async function installOperationsFixture(
  page: Page,
  request: APIRequestContext,
  enabled = true,
) {
  const base = await installBusinessFixture(page, request);
  const reads: { name: string; args: Record<string, unknown> }[] = [];
  let allowed = enabled,
    failed = false,
    signedIn = true,
    missingHistory = false;
  let snapshot = healthFixture();
  await page.route('https://admin.dojipro.com/api/session', (route) =>
    route.fulfill({
      status: signedIn ? 200 : 401,
      json: signedIn
        ? {
            signedIn: true,
            assurance: 'aal2',
            csrf: 'c'.repeat(43),
            operator: {
              user_id: '10000000-0000-4000-8000-000000000001',
              display_name: 'Synthetic operator',
              capabilities: { business_read: true, operations_read: allowed },
            },
          }
        : {},
    }),
  );
  await page.route('https://admin.dojipro.com/auth/logout', async (route) => {
    signedIn = false;
    await route.fallback();
  });
  await page.route('https://admin.dojipro.com/api/rpc', async (route) => {
    const body = route.request().postDataJSON() as { name: string; args: Record<string, unknown> };
    if (!['portal_platform_health_v1', 'get_admin_event_health_history_v1'].includes(body.name))
      return route.fallback();
    reads.push(body);
    if (!allowed || !signedIn) return route.fulfill({ status: 403, json: {} });
    if (failed) return route.fulfill({ status: 503, json: { message: 'Synthetic read failure' } });
    return route.fulfill({
      json:
        body.name === 'portal_platform_health_v1'
          ? snapshot
          : missingHistory
            ? { items: [] }
            : historyFixture(),
    });
  });
  return {
    ...base,
    healthReads: reads,
    revoke: () => {
      allowed = false;
    },
    fail: () => {
      failed = true;
    },
    change: (now = Date.now()) => {
      snapshot = healthFixture(now);
      snapshot.operational.outbox_overdue = 8;
    },
    missingHistory: () => {
      missingHistory = true;
      snapshot.sentry.issues = [];
    },
  };
}
