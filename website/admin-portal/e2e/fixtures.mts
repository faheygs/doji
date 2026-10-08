import type { Page, Route } from '@playwright/test';
// These fixtures deliberately exercise absent, legacy and malformed wire fields.
// Keep their nested payloads unknown instead of claiming they are valid server DTOs.
export interface ReportFixture extends Record<string,unknown> {
  id:string;
  target_kind:string;
  evidence:Record<string,unknown>;
  case_context:Record<string,unknown>;
  related_context:Record<string,unknown>;
  media_manifest:{[key:string]:unknown;items:Record<string,unknown>[]};
  reporter:Record<string,unknown>|null;
  reported_user:Record<string,unknown>|null;
  workflow_history?:Record<string,unknown>[];
  evidence_access_summary:Record<string,unknown>;
  triage_state:Record<string,unknown>|null;
}
export interface AppealFixture extends Record<string,unknown> {
  appeal:Record<string,unknown>;
  original_decision:Record<string,unknown>;
  original_evidence:Record<string,unknown>;
  report_case:ReportFixture;
  review_eligibility:Record<string,unknown>;
}
export function jwt(aal = 'aal2', role = 'authenticated') {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ aal, role, exp: Math.floor(Date.now() / 1000) + 3600 })}.signature`;
}

export const operatorSession = {
  user_id: '11111111-1111-4111-8111-111111111111',
  username: 'gfahey',
  display_name: 'Gavin Fahey',
  roles: ['super_admin'],
  capabilities: {
    moderation_read: true,
    moderation_write: true,
    restricted_review: true,
    operations_read: true,
    business_read: true,
    legal_read: true,
    operator_manage: true,
  },
};

const reportId = '22222222-2222-4222-8222-222222222222';
const restrictedReportId = '33333333-3333-4333-8333-333333333333';

export const commandCenter = {
  metrics: {
    urgent_deadlines: 1,
    restricted_safety_open: 1,
    unassigned_work: 1,
    open_reports: 2,
  },
  platform: {
    healthy: true,
    realtime_p95_ms_5m: 186,
    outbox_overdue: 0,
    push_stale_shards: 0,
  },
  work_items: [
    {
      id: reportId,
      queue: 'moderation',
      subject: 'Post report',
      secondary: 'Drugs',
      category: 'Selling or promoting restricted items',
      submitted_at: new Date(Date.now() - 20 * 60_000).toISOString(),
      deadline_at: new Date(Date.now() + 23 * 60 * 60_000).toISOString(),
      status: 'open',
      label: 'Pending',
      priority: 'normal',
      summary: 'Explicit in-app report awaiting review.',
      visibility: 'Authorized evidence available',
      owner: 'Unassigned',
      source: 'In-app report',
      next_step: 'Review evidence and record an audited policy decision.',
      history: [],
      assigned_to: null,
    },
    {
      id: restrictedReportId,
      queue: 'safety',
      subject: 'Post report',
      secondary: 'Credible threat',
      category: 'Violence, hate or exploitation',
      submitted_at: new Date(Date.now() - 8 * 60_000).toISOString(),
      deadline_at: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
      status: 'urgent',
      label: 'Restricted',
      priority: 'critical',
      summary: 'Critical report routed to restricted review.',
      visibility: 'Quarantined from members',
      owner: 'Gavin Fahey',
      source: 'In-app report',
      next_step: 'Complete restricted safety review.',
      history: [],
      assigned_to: operatorSession.user_id,
    },
  ],
  queue_health: [
    { label: 'Trust & safety', count: 1, note: 'Inside target' },
    { label: 'Restricted safety', count: 1, note: 'One critical review' },
  ],
  next_event: {
    title: 'Daily Doji',
    fires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    prelive_at: null,
    activated_at: null,
  },
  release_policies: [],
  announcements: [],
};

export const reportCase:ReportFixture = {
  case_contract_version: 3,
  media_manifest: {
    source: 'current_content',
    historical_snapshot: false,
    content_available: true,
    items: [],
  },
  id: reportId,
  target_kind: 'post',
  reason: 'restricted_goods',
  reason_detail: 'drugs',
  reason_label: 'Selling or promoting restricted items',
  reason_detail_label: 'Drugs',
  status: 'pending',
  priority: 'normal',
  assigned_to: null,
  owner: null,
  reporter: {
    id: '44444444-4444-4444-8444-444444444444',
    username: 'reporter',
    display_name: 'Test Reporter',
  },
  reported_user: {
    id: '55555555-5555-4555-8555-555555555555',
    username: 'testuser',
    display_name: 'Test User',
    is_banned: false,
  },
  evidence: {
    kind: 'post',
    content_id: '66666666-6666-4666-8666-666666666666',
    exists: true,
    text: 'Test post caption',
    moderation_status: 'visible',
  },
  case_context: {
    content_state: 'visible',
    original_audience: 'everyone',
    content_created_at: new Date(Date.now() - 30 * 60_000).toISOString(),
    daily_event_title: 'Today’s Doji',
  },
  related_context: { prior_reports: 0, open_reports: 0, prior_enforcements: 0 },
  workflow_history: [],
  evidence_access_summary: { count: 0, last_accessed_at: null, last_accessed_by: null },
  triage_state: { queue: 'moderation', report_status: 'pending' },
  suggested_policy_code: 'restricted_goods',
  policy_catalog: [
    { code: 'restricted_goods', label: 'Restricted goods' },
    { code: 'other', label: 'Other policy violation' },
  ],
};

export const auditPage = {
  items: [
    {
      id: '77777777-7777-4777-8777-777777777777',
      category: 'decision',
      actor: { id: operatorSession.user_id, username: 'gfahey', display_name: 'Gavin Fahey' },
      actor_role: 'super_admin',
      action: 'report.received',
      entity_type: 'report',
      entity_id: reportId,
      reason: 'New policy report received.',
      request_id: 'req-test-1',
      metadata: { queue: 'moderation', priority: 'normal' },
      occurred_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    },
  ],
  next_cursor: null,
};

export function storedAal2Session(employee = false) {
  const now = Date.now();
  return {
    access_token: jwt('aal2', employee ? 'doji_employee' : 'authenticated'),
    refresh_token: 'test-refresh-token',
    expires_at: Math.floor(now / 1000) + 3600,
    user: { id: operatorSession.user_id },
    started_at: now,
    last_activity_at: now,
  };
}

export async function seedAdminSession(page: Page, employee = false) {
  const session = storedAal2Session(employee);
  await page.addInitScript((value) => {
    sessionStorage.setItem('doji-admin-session-v1', JSON.stringify(value));
  }, session);
}

export async function installBrowserStubs(page: Page) {
  await page.addInitScript(() => {
    class FakeRealtime {
      onConnection?: (state: { current: string }) => void;
      connection;
      channels;
      constructor() {
        this.connection = {
          on: (callback: (state: { current: string }) => void) => {
            this.onConnection = callback;
          },
        };
        this.channels = { get: (name: string) => ({
          subscribe(callback: (message: {name: string; data?: unknown}) => void) {
            window.addEventListener('test-realtime-message', (event) => {
              const detail = (event as CustomEvent).detail;
              if (detail.channel === name) callback(detail.message);
            });
          }, unsubscribe() {},
        }) };
        window.addEventListener('test-realtime-connection', event => {
          this.onConnection?.({current: (event as CustomEvent).detail});
        });
      }
      close() {}
      connect() {
        this.onConnection?.({ current: 'connected' });
      }
    }
    Object.assign(window, { Ably: { Realtime: FakeRealtime } });
  });
}

function json(route: Route, value: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(value),
  });
}

export interface MockOptions {
  employeeMode?: boolean;
  editorialMode?: boolean;
  campaignMode?: boolean;
  safetyRemovalMode?: boolean;
  businessMode?: boolean;
  privacyMode?: boolean;
  authMode?: 'enrollment' | 'challenge';
  session?: Omit<typeof operatorSession,'capabilities'> & {capabilities:Partial<typeof operatorSession.capabilities>};
  commandCenter?: Record<string,unknown> & {work_items:Record<string,unknown>[]};
  workQueue?: (url: URL) => unknown;
  failAudit?: boolean;
  failPlatform?: boolean;
  healthHistory?: unknown;
  platformHealth?: unknown;
  reportCase?: unknown;
  appealCase?: unknown;
}
export async function installMockBackend(page: Page, options: MockOptions = {}) {
  const requests: { method: string; path: string; body: string | null }[] = [];
  // Existing fixtures cover legacy-mode regression/rollback. Employee-specific
  // suites override this route and use role-bearing synthetic sessions.
  await page.route('**/admin-app-*.js', async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    let body = options.employeeMode
      ? source
      : source.replace('"employeeAccountsEnabled": true', '"employeeAccountsEnabled": false');
    body = body.replace(
      /"editorialEnabled": (?:true|false)/,
      `"editorialEnabled": ${Boolean(options.editorialMode)}`,
    );
    body = body.replace(
      /"campaignsEnabled": (?:true|false)/,
      `"campaignsEnabled": ${Boolean(options.campaignMode)}`,
    );
    body = body.replace(
      /"safetyRemovalEnabled": (?:true|false)/,
      `"safetyRemovalEnabled": ${Boolean(options.safetyRemovalMode)}`,
    );
    body = body.replace(
      /"businessApplicationsEnabled": (?:true|false)/,
      `"businessApplicationsEnabled": ${Boolean(options.businessMode)}`,
    );
    body = body.replace(
      /"businessPrivacyEnabled": (?:true|false)/,
      `"businessPrivacyEnabled": ${Boolean(options.privacyMode)}`,
    );
    await route.fulfill({ response, body });
  });
  await installBrowserStubs(page);
  await page.route('**/auth/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push({
      method: request.method(),
      path: `${url.pathname}${url.search}`,
      body: request.postData(),
    });
    if (url.pathname.endsWith('/token') && url.searchParams.get('grant_type') === 'password') {
      if (options.authMode === 'enrollment') {
        return json(route, {
          access_token: jwt('aal1'),
          refresh_token: 'aal1-refresh',
          expires_in: 3600,
          user: { id: operatorSession.user_id, factors: [] },
        });
      }
      if (options.authMode === 'challenge') {
        return json(route, {
          access_token: jwt('aal1'),
          refresh_token: 'aal1-refresh',
          expires_in: 3600,
          user: {
            id: operatorSession.user_id,
            factors: [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }],
          },
        });
      }
      return json(route, {
        access_token: jwt('aal2'),
        refresh_token: 'aal2-refresh',
        expires_in: 3600,
        user: { id: operatorSession.user_id, factors: [] },
      });
    }
    if (url.pathname.endsWith('/token') && url.searchParams.get('grant_type') === 'refresh_token') {
      return json(route, {
        access_token: jwt('aal2'),
        refresh_token: 'rotated-refresh',
        expires_in: 3600,
        user: { id: operatorSession.user_id },
      });
    }
    if (url.pathname.endsWith('/factors') && request.method() === 'POST') {
      return json(route, {
        id: 'factor-new',
        type: 'totp',
        totp: {
          secret: 'DOJITESTSECRET',
          qr_code:
            '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="white"/><path d="M12 12h48v48H12zM100 12h48v48h-48zM12 100h48v48H12z" fill="black"/></svg>',
        },
      });
    }
    if (url.pathname.endsWith('/challenge')) return json(route, { id: 'challenge-1' });
    if (url.pathname.endsWith('/verify')) {
      return json(route, {
        access_token: jwt('aal2'),
        refresh_token: 'verified-refresh',
        expires_in: 3600,
        user: { id: operatorSession.user_id },
      });
    }
    if (url.pathname.endsWith('/logout')) return json(route, {});
    return json(route, { error: 'Unhandled auth fixture route' }, 404);
  });

  await page.route('**/portal/admin/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const key = `${url.pathname}${url.search}`;
    requests.push({ method: request.method(), path: key, body: request.postData() });
    if (url.pathname.endsWith('/session')) return json(route, options.session ?? operatorSession);
    if (url.pathname.endsWith('/command-center'))
      return json(route, options.commandCenter ?? commandCenter);
    if (url.pathname.endsWith('/work-queue')) {
      if (options.workQueue) return json(route, options.workQueue(url));
      const caps = (options.session ?? operatorSession).capabilities;
      const queue = url.searchParams.get('queue');
      const search = (url.searchParams.get('search') || '').toLowerCase();
      const items = (options.commandCenter ?? commandCenter).work_items.filter(
        (item) =>
          (item.queue === 'suggestions' ? caps.operations_read : caps.moderation_read) &&
          (queue === 'all' || item.queue === queue) &&
          JSON.stringify(item).toLowerCase().includes(search),
      );
      return json(route, { items, next_cursor: null });
    }
    if (url.pathname.endsWith('/appeals')) return json(route, []);
    if (url.pathname.endsWith('/resolved-reports'))
      return json(route, { items: [], next_cursor: null });
    if (url.pathname.endsWith('/audit-export')) {
      return json(route, {
        items: auditPage.items,
        truncated: false,
        exported_at: new Date().toISOString(),
      });
    }
    if (url.pathname.endsWith('/audit')) {
      return options.failAudit
        ? json(route, { error: 'Audit service unavailable' }, 503)
        : json(route, auditPage);
    }
    if (url.pathname.endsWith('/platform-health-history'))
      return json(route, { items: options.healthHistory ?? [] });
    if (url.pathname.endsWith('/platform-health')) {
      return options.failPlatform
        ? json(route, { error: 'Platform health unavailable' }, 503)
        : json(
            route,
            options.platformHealth ?? {
              operational: {
                available: true,
                healthy: true,
                checked_at: new Date().toISOString(),
                realtime_p95_ms_5m: 186,
                realtime_max_ms_5m: 220,
                realtime_sample_count_5m: 66,
                realtime_over_5s_5m: 0,
                apns_provider_credential_errors: 0,
                outbox_overdue: 0,
                outbox_exhausted: 0,
                push_stale_shards: 0,
                push_exhausted_shards: 0,
              },
              sentry: { configured: true, available: true, issues: [] },
            },
          );
    }
    if (url.pathname.endsWith('/operators')) {
      return json(route, [
        {
          id: operatorSession.user_id,
          username: 'gfahey',
          display_name: 'Gavin Fahey',
          roles: ['super_admin'],
          is_banned: false,
        },
      ]);
    }
    if (url.pathname.endsWith('/report-case') || url.pathname.endsWith('/report-case-v3'))
      return json(route, options.reportCase ?? reportCase);
    if (url.pathname.endsWith('/appeal-case'))
      return json(route, options.appealCase ?? {}, options.appealCase ? 200 : 503);
    if (url.pathname.endsWith('/realtime-token')) return json(route, { token: 'fixture-token' });
    if (request.method() === 'POST') return json(route, { ok: true });
    return json(route, { error: 'Unhandled portal fixture route' }, 404);
  });

  await page.route('**/storage/v1/object/sign/**', (route) =>
    json(route, { signedURL: '/object/sign/post-media/test?token=fixture' }),
  );
  return requests;
}

export { reportId, restrictedReportId };
