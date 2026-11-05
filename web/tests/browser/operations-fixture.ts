import type { Page, APIRequestContext } from '@playwright/test';
import { installBusinessFixture } from './business-fixture';
import { healthFixture, historyFixture } from '../health-fixture';
import type { BrowserRealtimeSdk } from '../../../website/ably-browser.d.mts';

export async function installOperationsFixture(
  page: Page,
  request: APIRequestContext,
  enabled = true,
  realtime?: (page: Page) => Promise<void>,
  cachedHealth = false,
) {
  const base = await installBusinessFixture(
    page,
    request,
    'success',
    false,
    false,
    false,
    realtime,
    cachedHealth,
  );
  const reads: { name: string; args: Record<string, unknown> }[] = [];
  const summaryReads: string[] = [];
  let summary = {
    enabled: true,
    available: true,
    observed_at: new Date().toISOString(),
    stale: false,
    operational: { available: true, healthy: true },
    workflows: { available: true, enabled: true },
  };
  let allowed = enabled,
    failed = false,
    signedIn = true,
    missingHistory = false;
  let snapshot: Omit<ReturnType<typeof healthFixture>, 'sentry'> & {
    workflows?: unknown;
    monitor_history?: unknown;
    mobile_workflows?: unknown;
    sentry: unknown;
    health_events_enabled?: boolean;
  } = healthFixture();
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
    if (body.name === 'portal_platform_health_summary_v1') {
      summaryReads.push(body.name);
      return route.fulfill({ status: allowed && signedIn ? 200 : 403, json: summary });
    }
    if (body.name === 'portal_realtime_token_v1')
      return route.fulfill({
        json: {
          keyName: 'synthetic.key',
          nonce: 'synthetic',
          mac: 'synthetic',
          timestamp: Date.now(),
          capability: JSON.stringify(
            allowed && snapshot.health_events_enabled
              ? { 'staff:health:operations': ['subscribe'] }
              : {},
          ),
        },
      });
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
    summaryReads,
    changeSummary: (healthy: boolean, observed: string) => {
      summary = { ...summary, observed_at: observed, operational: { available: true, healthy } };
    },
    sentry: (value: unknown) => {
      snapshot.sentry = value;
    },
    healthEvents: (value: boolean) => {
      snapshot.health_events_enabled = value;
    },
    workflows: (value: unknown) => {
      snapshot.workflows = value;
    },
    monitorHistory: (value: unknown) => {
      snapshot.monitor_history = value;
    },
    mobileWorkflows: (value: unknown) => {
      snapshot.mobile_workflows = value;
    },
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
      snapshot.sentry = { ...healthFixture().sentry, issues: [] };
    },
  };
}

/** Exercises the real portal listener/auth transport without any provider traffic. */
export async function installHealthRealtime(page: Page) {
  await page.addInitScript(() => {
    type Changed = (change: { current: string }) => void;
    class HealthRealtime {
      changed?: Changed;
      channelChanged?: Changed;
      message?: (value: unknown) => void;
      closed = false;
      connection = {
        on: (handler: Changed) => {
          this.changed = handler;
        },
      };
      channels = {
        get: (name: string) => ({
          on: (handler: Changed) => {
            if (name === 'staff:health:operations') this.channelChanged = handler;
          },
          subscribe: async (handler: (value: unknown) => void) => {
            if (name !== 'staff:health:operations') return;
            this.message = handler;
            this.channelChanged?.({ current: 'attached' });
          },
        }),
      };
      receive = (event: Event) => this.message?.((event as CustomEvent).detail);
      connectionChange = (event: Event) =>
        this.changed?.({ current: (event as CustomEvent).detail });
      channelChange = (event: Event) =>
        this.channelChanged?.({ current: (event as CustomEvent).detail });
      constructor(
        private options: { authCallback: (params: object, done: (error: unknown) => void) => void },
      ) {
        window.addEventListener('test-health-message', this.receive);
        window.addEventListener('test-health-connection', this.connectionChange);
        window.addEventListener('test-health-channel', this.channelChange);
      }
      connect() {
        this.options.authCallback({}, (error) => {
          if (!error && !this.closed) this.changed?.({ current: 'connected' });
        });
      }
      close() {
        this.closed = true;
        window.removeEventListener('test-health-message', this.receive);
        window.removeEventListener('test-health-connection', this.connectionChange);
        window.removeEventListener('test-health-channel', this.channelChange);
      }
    }
    window.Ably = { Realtime: HealthRealtime } as unknown as BrowserRealtimeSdk;
  });
}
