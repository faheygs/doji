jest.mock('../../infra/doji-orchestrator/src/scale-read-auth', () => ({
  authenticateScaleReadRequest: jest.fn(),
  authenticateEmployeePortalRequest: jest.fn(),
  normalizedSupabaseUrl: (env: { SUPABASE_URL: string }) => env.SUPABASE_URL.replace(/\/$/, ''),
}));
import { handlePortalRead, portalRouteFor } from '../../infra/doji-orchestrator/src/portal-read';
import {
  authenticateEmployeePortalRequest,
  authenticateScaleReadRequest,
} from '../../infra/doji-orchestrator/src/scale-read-auth';
const originalFetch = global.fetch;
const transport = jest.fn();
let sequence = 0;
let env: Parameters<typeof handlePortalRead>[1];
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const timestamp = '2026-10-01T12:00:00Z';
function req(
  path = 'session',
  method = 'GET',
  body?: string,
  headers: Record<string, string> = {},
) {
  return new Request(`https://gateway.invalid/portal/admin/${path}`, { method, body, headers });
}
beforeEach(() => {
  jest.clearAllMocks();
  ++sequence;
  env = {
    SUPABASE_URL: `https://database-${sequence}.invalid`,
    SUPABASE_ANON_KEY: 'synthetic',
    OUTBOX_RELAY_SECRET: 'not-used',
    ADMIN_PORTAL_ORIGINS: ' https://admin.invalid, https://other.invalid ',
  };
  global.fetch = transport;
  transport
    .mockReset()
    .mockImplementation(async (url) =>
      String(url).endsWith('/admin_user_has_permission')
        ? Response.json(true)
        : Response.json({ authorized: true }),
    );
  for (const auth of [authenticateEmployeePortalRequest, authenticateScaleReadRequest])
    jest
      .mocked(auth)
      .mockReset()
      .mockResolvedValue({ userId: `operator-${sequence}`, token: 'operator-token', aal: 'aal2' });
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse(timestamp) + sequence * 70000);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});
test('unrelated routes do not enter portal authentication', async () => {
  expect(await handlePortalRead(new Request('https://gateway.invalid/v1/feed'), env)).toBeNull();
  expect(authenticateScaleReadRequest).not.toHaveBeenCalled();
});
test.each(['https://evil.invalid', 'null'])(
  'unapproved origin %s is denied before authentication',
  async (origin) => {
    expect(
      (await handlePortalRead(req('session', 'GET', undefined, { origin }), env))?.status,
    ).toBe(403);
    expect(transport).not.toHaveBeenCalled();
  },
);
test('allowed preflight reflects only the approved origin and performs no reads', async () => {
  const result = await handlePortalRead(
    req('session', 'OPTIONS', undefined, { origin: 'https://admin.invalid' }),
    env,
  );
  expect(result?.status).toBe(204);
  expect(result?.headers.get('access-control-allow-origin')).toBe('https://admin.invalid');
  expect(result?.headers.get('vary')).toBe('Origin');
  expect(transport).not.toHaveBeenCalled();
});
test.each([
  ['session', 'DELETE'],
  ['session', 'POST'],
  ['realtime-token', 'POST'],
  ['platform-health', 'POST'],
])('rejects mismatched method %s %s', async (path, method) => {
  expect((await handlePortalRead(req(path, method), env))?.status).toBe(405);
  expect(transport).not.toHaveBeenCalled();
});
test('unknown private endpoint stays a 404', async () =>
  expect((await handlePortalRead(req('unknown'), env))?.status).toBe(404));
test.each(['{', 'null', '[]', '1', 'true'])(
  'invalid command body %s makes no upstream request',
  async (body) => {
    expect((await handlePortalRead(req('report-triage', 'POST', body), env))?.status).toBe(400);
    expect(transport).not.toHaveBeenCalled();
  },
);
test.each([true, false])('body limits apply with declared length=%s', async (declared) => {
  const result = await handlePortalRead(
    req(
      'report-triage',
      'POST',
      declared ? '{}' : 'x'.repeat(8193),
      declared ? { 'content-length': '8193' } : {},
    ),
    env,
  );
  expect(result?.status).toBe(413);
  expect(transport).not.toHaveBeenCalled();
});
test('employee-only routes cannot enter through member credentials', async () => {
  expect((await handlePortalRead(req(`report-case-v3?id=${id}`), env))?.status).toBe(403);
  expect(authenticateScaleReadRequest).not.toHaveBeenCalled();
});
test.each([
  ['operators', 'GET', 'get_admin_employee_directory_v1'],
  ['operator-role', 'POST', 'admin_set_employee_role_v1'],
])('employee-mode %s uses the independent employee RPC', async (path, method, rpc) => {
  expect(
    (
      await handlePortalRead(req(path, method, method === 'POST' ? '{}' : undefined), {
        ...env,
        ADMIN_PORTAL_EMPLOYEE_ACCOUNTS: 'true',
      })
    )?.status,
  ).toBe(200);
  expect(authenticateEmployeePortalRequest).toHaveBeenCalledTimes(1);
  expect(authenticateScaleReadRequest).not.toHaveBeenCalled();
  expect(transport.mock.calls[0][0]).toContain(`/rpc/${rpc}`);
});
test('AAL1 cannot read or command the portal', async () => {
  jest
    .mocked(authenticateScaleReadRequest)
    .mockResolvedValue({ userId: 'member', token: 'token', aal: 'aal1' });
  expect((await handlePortalRead(req(), env))?.status).toBe(403);
  expect(transport).not.toHaveBeenCalled();
});
test.each([
  new Error('Authentication required'),
  new Error('Administrator access required'),
  new Error('Invalid query'),
  new Error('private failure'),
  'unknown',
])('portal errors are classified and sanitized (%s)', async (error) => {
  jest.mocked(authenticateScaleReadRequest).mockRejectedValue(error);
  const result = await handlePortalRead(req(), env);
  const status =
    error instanceof Error
      ? error.message.startsWith('Authentication')
        ? 401
        : error.message.startsWith('Administrator')
          ? 403
          : error.message.startsWith('Invalid')
            ? 400
            : 503
      : 503;
  expect(result?.status).toBe(status);
  if (status === 503)
    expect(await result?.json()).toEqual({ error: 'Portal data is temporarily unavailable' });
});
test('realtime token request has a fixed administrator-only audience and no content-profile header', async () => {
  const result = await handlePortalRead(
    req('realtime-token', 'GET', undefined, { 'x-client-info': 'synthetic-client' }),
    env,
  );
  expect(result?.status).toBe(200);
  expect(transport.mock.calls[0][0]).toContain('/functions/v1/realtime-token');
  expect(JSON.parse(transport.mock.calls[0][1].body)).toEqual({ admin: true, postIds: [] });
  expect(transport.mock.calls[0][1].headers).not.toHaveProperty('content-profile');
  expect(transport.mock.calls[0][1].headers['x-client-info']).toBe('synthetic-client');
});
test('the 121st portal read is throttled with a retry time', async () => {
  for (let i = 0; i < 120; i++) expect((await handlePortalRead(req(), env))?.status).toBe(200);
  const response = await handlePortalRead(req(), env);
  expect(response?.status).toBe(429);
  expect(response?.headers.get('retry-after')).toBe('60');
});
test('bounded operator budgets evict old entries without granting extra authority', async () => {
  for (let i = 0; i < 101; i++) {
    jest
      .mocked(authenticateScaleReadRequest)
      .mockResolvedValueOnce({ userId: `bounded-${sequence}-${i}`, token: 'token', aal: 'aal2' });
    expect((await handlePortalRead(req(), env))?.status).toBe(200);
  }
  expect(authenticateScaleReadRequest).toHaveBeenCalledTimes(101);
});
test.each([false, 'false', null])(
  'operations permission must be literal true (%j)',
  async (permitted) => {
    transport.mockResolvedValue(Response.json(permitted));
    expect((await handlePortalRead(req('platform-health'), env))?.status).toBe(403);
  },
);
test.each([
  ['http', 503],
  ['invalid', 200],
])('unavailable operational %s read is not reported healthy', async (kind, status) => {
  transport.mockImplementation(async (url) =>
    String(url).endsWith('admin_user_has_permission')
      ? Response.json(true)
      : new Response(kind === 'invalid' ? '[]' : '{}', { status: Number(status) }),
  );
  const response = await handlePortalRead(req('platform-health'), env);
  expect(response?.status).toBe(200);
  expect(await response?.json()).toMatchObject({
    operational: { available: false, healthy: false },
    sentry: { configured: false, available: false },
  });
});
test('concurrent health reads coalesce provider work but authorize every caller', async () => {
  const configured = {
    ...env,
    SENTRY_API_TOKEN: 'synthetic-token',
    SENTRY_ORG_SLUG: 'org',
    SENTRY_PROJECT_SLUGS: 'one, two',
  };
  transport.mockImplementation(async (url) =>
    String(url).includes('sentry.io')
      ? Response.json([
          {
            id: '1',
            shortId: 'ISSUE-1',
            title: 'Synthetic issue',
            culprit: 'function',
            level: 'warning',
            count: '4',
            userCount: 2,
            firstSeen: timestamp,
            lastSeen: timestamp,
            status: 'unresolved',
            project: { slug: 'app' },
            permalink: 'https://sentry.invalid/issue',
          },
          {
            metadata: { title: 'Metadata title' },
            project: { name: 'fallback' },
            permalink: 'http://unsafe.invalid',
          },
          { metadata: { value: 'Metadata value' } },
          {},
        ])
      : String(url).endsWith('admin_user_has_permission')
        ? Response.json(true)
        : Response.json({ healthy: true }),
  );
  const results = await Promise.all([
    handlePortalRead(req('platform-health'), configured),
    handlePortalRead(req('platform-health'), configured),
  ]);
  const body = await results[0]?.json();
  expect(body).toMatchObject({
    operational: { healthy: true, available: true },
    sentry: { configured: true, available: true, unresolved_count: 4 },
  });
  expect(body.sentry.issues.map((issue: { title: string }) => issue.title)).toEqual([
    'Synthetic issue',
    'Metadata title',
    'Metadata value',
    'Unhandled production issue',
  ]);
  expect(body.sentry.issues[0]).toMatchObject({
    event_count: 4,
    affected_users: 2,
    project: 'app',
  });
  expect(body.sentry.issues[1].permalink).toBeNull();
  expect(transport.mock.calls.filter(([url]) => String(url).includes('sentry.io'))).toHaveLength(1);
  expect(
    transport.mock.calls.filter(([url]) => String(url).endsWith('admin_user_has_permission')),
  ).toHaveLength(2);
  await handlePortalRead(req('platform-health'), configured);
  expect(transport.mock.calls.filter(([url]) => String(url).includes('sentry.io'))).toHaveLength(1);
});
test.each(['http', 'transport', 'object'])(
  'Sentry %s result has explicit availability',
  async (kind) => {
    transport.mockImplementation(async (url) => {
      if (String(url).includes('sentry.io')) {
        if (kind === 'transport') throw new Error('provider offline');
        return kind === 'http'
          ? new Response('', { status: 503 })
          : Response.json({ not: 'an array' });
      }
      return String(url).endsWith('admin_user_has_permission')
        ? Response.json(true)
        : Response.json({ healthy: true });
    });
    const body = await (
      await handlePortalRead(req('platform-health'), {
        ...env,
        SENTRY_API_TOKEN: 'synthetic',
        SENTRY_ORG_SLUG: 'org',
      })
    )?.json();
    expect(body.sentry).toMatchObject({
      configured: true,
      available: kind === 'object',
      issues: [],
    });
  },
);

describe('exact route argument contracts', () => {
  test.each([
    ['session', {}, {}],
    ['operators', {}, {}],
    ['command-center', {}, { p_limit: 20 }],
    [`report-case?id=${id}`, {}, { p_report_id: id }],
    ['platform-health-history', {}, { p_limit: 12 }],
    ['appeals', {}, { p_limit: 20 }],
    ['audit-export?category=decision&search=one', {}, { p_category: 'decision', p_search: 'one' }],
    [
      'report-triage',
      { reportId: id, action: 'claim', idempotencyKey: 'key' },
      {
        p_report_id: id,
        p_action: 'claim',
        p_priority: null,
        p_note: null,
        p_idempotency_key: 'key',
      },
    ],
    [
      'report-triage',
      {
        reportId: id,
        action: 'priority',
        priority: 'urgent',
        note: 'reason',
        idempotencyKey: 'key',
      },
      {
        p_report_id: id,
        p_action: 'priority',
        p_priority: 'urgent',
        p_note: 'reason',
        p_idempotency_key: 'key',
      },
    ],
    [
      'report-review-state',
      { reportId: id, action: 'reopen', reason: 'reason', idempotencyKey: 'key' },
      { p_report_id: id, p_action: 'reopen', p_reason: 'reason', p_idempotency_key: 'key' },
    ],
    [
      'appeal-decision',
      { appealId: id, outcome: 'uphold', reason: 'reason', idempotencyKey: 'key' },
      { p_appeal_id: id, p_outcome: 'uphold', p_reason: 'reason', p_idempotency_key: 'key' },
    ],
  ] as const)('maps %s without widening arguments', (path, body, expected) => {
    const url = new URL(`https://gateway.invalid/portal/admin/${path}`);
    expect(portalRouteFor(url)?.args(url, body)).toEqual(expected);
  });
  for (const [path, timeKey, idKey] of [
    ['audit', 'beforeOccurredAt', 'beforeId'],
    ['resolved-reports', 'beforeResolvedAt', 'beforeReportId'],
  ] as const) {
    test.each(['none', 'valid', 'missing ID', 'missing time', 'invalid time', 'invalid ID'])(
      `${path} cursor validates %s`,
      (kind) => {
        const url = new URL(`https://gateway.invalid/portal/admin/${path}`);
        if (kind !== 'none') {
          if (kind !== 'missing time')
            url.searchParams.set(timeKey, kind === 'invalid time' ? 'bad' : timestamp);
          if (kind !== 'missing ID')
            url.searchParams.set(idKey, kind === 'invalid ID' ? 'bad' : id);
        }
        const run = () => portalRouteFor(url)?.args(url, {});
        if (kind === 'none' || kind === 'valid')
          expect(run()).toMatchObject({ p_limit: path === 'audit' ? 50 : 25 });
        else expect(run).toThrow('Invalid');
      },
    );
  }
  test.each(['limit=0', 'limit=51', 'limit=1.5', 'category=invalid', `search=${'x'.repeat(161)}`])(
    'rejects malformed bounded audit argument %s',
    (query) => {
      const url = new URL(`https://gateway.invalid/portal/admin/audit?${query}`);
      expect(() => portalRouteFor(url)?.args(url, {})).toThrow('Invalid');
    },
  );
  test.each([
    'queue=unknown',
    'filter=unknown',
    `afterAt=${timestamp}`,
    `afterId=report:${id}`,
    `afterAt=no&afterId=report:${id}`,
    `afterAt=${timestamp}&afterId=bad`,
  ])('rejects malformed queue cursor %s', (query) => {
    const url = new URL(`https://gateway.invalid/portal/admin/work-queue?${query}`);
    expect(() => portalRouteFor(url)?.args(url, {})).toThrow('Invalid');
  });
  test('valid queue cursor preserves exact ID and timestamp', () => {
    const url = new URL(
      `https://gateway.invalid/portal/admin/work-queue?afterAt=${timestamp}&afterId=report:${id}`,
    );
    expect(portalRouteFor(url)?.args(url, {})).toMatchObject({
      p_after_at: timestamp,
      p_after_id: `report:${id}`,
      p_search: null,
    });
  });
});
