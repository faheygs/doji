import assert from 'node:assert/strict';
import { readBrowserSource } from '../browser-source.mts';
import vm from 'node:vm';
import type { PortalConfig } from './live-contracts.d.mts';
import type { AdminPortalClient } from './live-client.mts';
import { evidenceText } from '../../scripts/release-evidence.mts';
type Options = RequestInit & { headers: Record<string, string> };
type Call = { url: string; method?: string; body?: BodyInit | null; options?: Options };

const source = readBrowserSource('admin-portal/live-client.js');

function jwt(aal: string, role = 'authenticated') {
  const payload = Buffer.from(JSON.stringify({ aal, role })).toString('base64url');
  return `header.${payload}.signature`;
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body == null ? '' : JSON.stringify(body);
    },
  };
}

function makeClient(
  responder: (
    url: string,
    options: Options,
  ) => ReturnType<typeof jsonResponse> | Promise<ReturnType<typeof jsonResponse>>,
  options: PortalConfig = {},
) {
  const values = new Map<string, string>();
  const sandbox = {
    atob(value: string) {
      return Buffer.from(value, 'base64').toString('utf8');
    },
    fetch: responder,
    URLSearchParams,
    URL,
    AbortSignal,
    sessionStorage: {
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        values.set(key, value);
      },
      removeItem(key: string) {
        values.delete(key);
      },
    },
    window: {} as {
      DojiAdminPortalClient: { create: (config: PortalConfig) => AdminPortalClient };
    },
  };
  vm.runInNewContext(source, sandbox);
  return {
    client: sandbox.window.DojiAdminPortalClient.create({
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: 'public-anon-key',
      apiBaseUrl: 'https://api.example.com',
      ...options,
    }),
    values,
  };
}

{
  const calls: Call[] = [];
  const { client, values } = makeClient(async (url, options) => {
    calls.push({ url, method: options.method, body: options.body });
    if (url.endsWith('/auth/v1/token?grant_type=password')) {
      return jsonResponse({
        access_token: jwt('aal1'),
        refresh_token: 'refresh-aal1',
        expires_in: 3600,
        user: { id: 'operator-1', factors: [] },
      });
    }
    if (url.endsWith('/auth/v1/factors')) {
      return jsonResponse({
        id: 'factor-1',
        type: 'totp',
        totp: {
          qr_code:
            '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>',
          secret: 'SETUPSECRET',
        },
      });
    }
    if (url.endsWith('/auth/v1/factors/factor-1/challenge'))
      return jsonResponse({ id: 'challenge-1' });
    if (url.endsWith('/auth/v1/factors/factor-1/verify')) {
      return jsonResponse({
        access_token: jwt('aal2'),
        refresh_token: 'refresh-aal2',
        expires_in: 3600,
        user: { id: 'operator-1' },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  const signIn = await client.signIn('operator@example.com', 'password');
  assert.equal('requiresEnrollment' in signIn ? signIn.requiresEnrollment : undefined, true);
  assert.equal(client.hasSession(), false);

  const enrollment = await client.enrollTotp();
  assert.equal(enrollment.secret, 'SETUPSECRET');
  assert.match(enrollment.qrCode, /^data:image\/svg\+xml;utf-8,<\?xml/);
  const enrollBody = JSON.parse(
    evidenceText(calls.find((call) => call.url.endsWith('/auth/v1/factors'))?.body),
  );
  assert.equal(enrollBody.friendly_name, 'Doji Admin');
  assert.equal(enrollBody.issuer, 'Doji Admin');

  await client.verifyTotpEnrollment('123456');
  assert.equal(client.hasSession(), true);
  assert.match(evidenceText(values.get('doji-admin-session-v1')), /refresh-aal2/);
  assert.equal(calls.filter((call) => call.url.endsWith('/challenge')).length, 1);
  assert.equal(calls.filter((call) => call.url.endsWith('/verify')).length, 1);
}

{
  const { client } = makeClient(async (url) => {
    if (url.endsWith('/auth/v1/token?grant_type=password')) {
      return jsonResponse({
        access_token: jwt('aal1'),
        refresh_token: 'returning-refresh',
        expires_in: 3600,
        user: {
          id: 'operator-2',
          factors: [{ id: 'factor-2', factor_type: 'totp', status: 'verified' }],
        },
      });
    }
    if (url.endsWith('/auth/v1/factors/factor-2/challenge'))
      return jsonResponse({ id: 'challenge-2' });
    if (url.endsWith('/auth/v1/factors/factor-2/verify')) {
      return jsonResponse({
        access_token: jwt('aal2'),
        refresh_token: 'returning-aal2',
        expires_in: 3600,
        user: { id: 'operator-2' },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  const signIn = await client.signIn('returning@example.com', 'password');
  assert.equal('requiresChallenge' in signIn ? signIn.requiresChallenge : undefined, true);
  assert.equal('method' in signIn ? signIn.method : undefined, 'totp');
  await client.verifyPendingChallenge('654321');
  assert.equal(client.hasSession(), true);
}

{
  const { client } = makeClient(async (url) => {
    if (url.endsWith('/auth/v1/token?grant_type=password')) {
      return jsonResponse({
        access_token: jwt('aal1'),
        refresh_token: 'incomplete-refresh',
        expires_in: 3600,
        user: { id: 'operator-3', factors: [] },
      });
    }
    if (url.endsWith('/auth/v1/factors')) {
      return jsonResponse({ id: 'factor-3', type: 'totp', totp: { qr_code: '<svg></svg>' } });
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  await client.signIn('incomplete@example.com', 'password');
  await assert.rejects(client.enrollTotp(), /setup key/);
}

{
  const calls: Call[] = [];
  const { client } = makeClient(async (url, options) => {
    calls.push({ url, method: options.method || 'GET', body: options.body });
    if (url.endsWith('/auth/v1/token?grant_type=password')) {
      return jsonResponse({
        access_token: jwt('aal2'),
        refresh_token: 'command-refresh',
        expires_in: 3600,
        user: { id: 'operator-4' },
      });
    }
    if (url.includes('/portal/admin/report-case')) return jsonResponse({ id: 'report-1' });
    if (url.includes('/portal/admin/audit-export'))
      return jsonResponse({ items: [{ id: 'audit-export-1' }], truncated: false });
    if (url.includes('/portal/admin/audit'))
      return jsonResponse({ items: [{ id: 'audit-1' }], next_cursor: null });
    if (url.endsWith('/portal/admin/operators'))
      return jsonResponse({ items: [{ user_id: 'operator-4', roles: ['super_admin'] }] });
    if (url.endsWith('/portal/admin/operator-role'))
      return jsonResponse({ username: 'helper', role: 'moderator', active: true });
    if (url.includes('/portal/admin/platform-health-history'))
      return jsonResponse({ items: [{ daily_event_id: 'event-1' }] });
    if (url.endsWith('/portal/admin/platform-health'))
      return jsonResponse({ operational: { healthy: true }, sentry: { configured: false } });
    if (url.includes('/portal/admin/resolved-reports'))
      return jsonResponse({ items: [{ id: 'report-closed' }], next_cursor: null });
    if (url.includes('/portal/admin/appeals')) return jsonResponse([{ id: 'appeal-1' }]);
    if (url.endsWith('/portal/admin/report-triage')) return jsonResponse({ report_id: 'report-1' });
    if (url.endsWith('/portal/admin/report-review-state'))
      return jsonResponse({
        report_id: 'report-1',
        review_state: 'reopened',
        enforcement_changed: false,
      });
    if (url.endsWith('/portal/admin/report-decision'))
      return jsonResponse({ report_id: 'report-1', status: 'dismissed' });
    if (url.endsWith('/portal/admin/appeal-decision'))
      return jsonResponse({ appeal_id: 'appeal-1', status: 'reversed' });
    if (url.includes('/storage/v1/object/sign/post-media/'))
      return jsonResponse({ signedURL: '/storage/v1/object/sign/post-media/path?token=signed' });
    throw new Error(`Unexpected request: ${url}`);
  });

  const signIn = await client.signIn('operator@example.com', 'password');
  assert.equal('authenticated' in signIn ? signIn.authenticated : undefined, true);
  await client.reportCase('report-1');
  await client.auditEvents(
    50,
    {
      occurred_at: '2026-09-25T12:00:00.000Z',
      id: '779930ce-ad56-4f46-a4bf-4b104d0adf57',
    },
    { category: 'decision', search: 'remove' },
  );
  await client.auditExport({ category: 'decision', search: 'remove' });
  await client.operators();
  await client.setOperatorRole({
    username: 'helper',
    role: 'moderator',
    active: true,
    reason: 'Delegated moderation coverage.',
    idempotencyKey: 'operator-key-123456',
  });
  await client.platformHealth();
  await client.platformHealthHistory(12);
  await client.resolvedReports(25, {
    resolved_at: '2026-09-24T23:00:00.000Z',
    report_id: '9d33774b-7dec-42cf-8acb-6709a9f1491d',
  });
  await client.appeals(20);
  await client.triageReport({
    reportId: 'report-1',
    action: 'claim',
    priority: null,
    note: null,
    idempotencyKey: 'triage-key-123456',
  });
  await client.setReportReviewState({
    reportId: 'report-1',
    action: 'reopen',
    reason: 'Additional review is required.',
    idempotencyKey: 'review-state-key-123456',
  });
  await client.decideReport({
    reportId: 'report-1',
    action: 'remove_content',
    policyCode: 'restricted_goods',
    severity: 'level_2',
    reason: 'The restricted reviewer confirmed the violation.',
    userNotice: 'The content was removed and your account is temporarily restricted.',
    accountAction: 'temporary_restriction',
    restrictionDays: 7,
    idempotencyKey: 'decision-key-1234',
  });
  await client.decideAppeal({
    appealId: 'appeal-1',
    outcome: 'reverse',
    reason: 'The original decision was incorrect.',
    idempotencyKey: 'appeal-key-123456',
  });
  const signed = await client.signEvidence('post-media', 'user/report/photo.jpg');
  assert.match(
    evidenceText(signed),
    /^https:\/\/project\.supabase\.co\/storage\/v1\/object\/sign\//,
  );

  const triageCall = calls.find((call) => call.url.endsWith('/portal/admin/report-triage'));
  assert.ok(triageCall);
  assert.equal(triageCall.method, 'POST');
  assert.deepEqual(JSON.parse(evidenceText(triageCall.body)), {
    reportId: 'report-1',
    action: 'claim',
    priority: null,
    note: null,
    idempotencyKey: 'triage-key-123456',
  });
  const decisionCall = calls.find((call) => call.url.endsWith('/portal/admin/report-decision'));
  assert.ok(decisionCall);
  assert.equal(decisionCall.method, 'POST');
  assert.equal(
    JSON.parse(evidenceText(decisionCall.body)).reason,
    'The restricted reviewer confirmed the violation.',
  );
  assert.equal(JSON.parse(evidenceText(decisionCall.body)).policyCode, 'restricted_goods');
  assert.equal(JSON.parse(evidenceText(decisionCall.body)).accountAction, 'temporary_restriction');
  assert.equal(JSON.parse(evidenceText(decisionCall.body)).restrictionDays, 7);
  const reviewStateCall = calls.find((call) =>
    call.url.endsWith('/portal/admin/report-review-state'),
  );
  assert.ok(reviewStateCall);
  assert.deepEqual(JSON.parse(evidenceText(reviewStateCall.body)), {
    reportId: 'report-1',
    action: 'reopen',
    reason: 'Additional review is required.',
    idempotencyKey: 'review-state-key-123456',
  });
  const appealCall = calls.find((call) => call.url.endsWith('/portal/admin/appeal-decision'));
  assert.ok(appealCall);
  assert.equal(JSON.parse(evidenceText(appealCall.body)).outcome, 'reverse');
  const resolvedCall = calls.find((call) => call.url.includes('/portal/admin/resolved-reports'));
  assert.ok(resolvedCall);
  assert.match(resolvedCall.url, /limit=25/);
  assert.match(resolvedCall.url, /beforeResolvedAt=2026-09-24T23%3A00%3A00.000Z/);
  assert.match(resolvedCall.url, /beforeReportId=9d33774b-7dec-42cf-8acb-6709a9f1491d/);
  const auditCall = calls.find((call) => call.url.includes('/portal/admin/audit'));
  assert.ok(auditCall);
  assert.match(auditCall.url, /limit=50/);
  assert.match(auditCall.url, /beforeOccurredAt=2026-09-25T12%3A00%3A00.000Z/);
  assert.match(auditCall.url, /beforeId=779930ce-ad56-4f46-a4bf-4b104d0adf57/);
  assert.match(auditCall.url, /category=decision/);
  assert.match(auditCall.url, /search=remove/);
  const operatorCall = calls.find((call) => call.url.endsWith('/portal/admin/operator-role'));
  assert.ok(operatorCall);
  assert.equal(operatorCall.method, 'POST');
  assert.equal(JSON.parse(evidenceText(operatorCall.body)).role, 'moderator');
  assert.equal(client.sessionPolicy().idleTimeoutMs, 30 * 60 * 1000);
  client.noteActivity();
  assert.equal(
    calls.filter((call) => call.url.endsWith('/portal/admin/platform-health')).length,
    1,
  );
  assert.equal(
    calls.filter((call) => call.url.endsWith('/portal/admin/platform-health-history?limit=12'))
      .length,
    1,
  );
}

{
  const { client } = makeClient(async (url) => {
    if (url.endsWith('/auth/v1/token?grant_type=password')) {
      return jsonResponse({
        access_token: jwt('aal2'),
        refresh_token: 'storage-refresh',
        expires_in: 3600,
        user: { id: 'operator-5' },
      });
    }
    if (url.includes('/storage/v1/object/sign/post-media/')) {
      return jsonResponse({ signedURL: '/object/sign/post-media/path?token=signed' });
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  await client.signIn('operator@example.com', 'password');
  const signed = await client.signEvidence('post-media', 'user/report/photo.jpg');
  assert.equal(
    signed,
    'https://project.supabase.co/storage/v1/object/sign/post-media/path?token=signed',
  );
}

{
  let refreshCount = 0;
  const { client } = makeClient(async (url) => {
    if (url.endsWith('/auth/v1/token?grant_type=password')) {
      return jsonResponse({
        access_token: jwt('aal2'),
        refresh_token: 'expired-refresh',
        expires_at: Math.floor(Date.now() / 1000) - 1,
        user: { id: 'operator-6' },
      });
    }
    if (url.endsWith('/auth/v1/token?grant_type=refresh_token')) {
      refreshCount += 1;
      return jsonResponse({
        access_token: jwt('aal2'),
        refresh_token: 'rotated-refresh',
        expires_in: 3600,
        user: { id: 'operator-6' },
      });
    }
    if (url.endsWith('/portal/admin/session'))
      return jsonResponse({ operator: { id: 'operator-6' } });
    if (url.includes('/portal/admin/command-center')) return jsonResponse({ moderation: [] });
    if (url.includes('/portal/admin/appeals')) return jsonResponse([]);
    if (url.includes('/portal/admin/resolved-reports'))
      return jsonResponse({ items: [], next_cursor: null });
    if (url.includes('/portal/admin/audit')) return jsonResponse({ items: [], next_cursor: null });
    if (url.includes('/portal/admin/platform-health-history')) return jsonResponse({ items: [] });
    if (url.endsWith('/portal/admin/platform-health'))
      return jsonResponse({ operational: { healthy: true } });
    throw new Error(`Unexpected request: ${url}`);
  });

  await client.signIn('operator@example.com', 'password');
  await Promise.all([
    client.session(),
    client.commandCenter(10),
    client.appeals(10),
    client.resolvedReports(10),
    client.auditEvents(10),
    client.platformHealth(),
    client.platformHealthHistory(12),
  ]);
  assert.equal(refreshCount, 1, 'parallel protected reads must share one refresh-token rotation');
}

{
  const calls: Call[] = [];
  const { client } = makeClient(async (url, options) => {
    calls.push({ url, method: options.method || 'GET' });
    if (url.endsWith('/auth/v1/token?grant_type=password')) {
      return jsonResponse({
        access_token: jwt('aal2'),
        refresh_token: 'logout-refresh',
        expires_in: 3600,
        user: { id: 'operator-7' },
      });
    }
    if (url.endsWith('/auth/v1/logout?scope=local')) return jsonResponse(null, 204);
    throw new Error(`Unexpected request: ${url}`);
  });

  await client.signIn('operator@example.com', 'password');
  await client.signOut();
  assert.equal(client.hasSession(), false);
  assert.equal(
    calls.filter((call) => call.url.endsWith('/auth/v1/logout?scope=local')).length,
    1,
    'locking the portal must terminate only the browser session',
  );
}

console.log(
  'Admin MFA, report read, triage, follow-up review, enforcement, appeals, evidence signing, refresh single-flight, and local logout tests passed.',
);

for (const operation of ['session', 'signEvidence']) {
  let finishRead!: () => void;
  let startedRead!: () => void;
  const started = new Promise<void>((resolve) => {
    startedRead = resolve;
  });
  const { client } = makeClient(async (url) => {
    if (url.includes('grant_type=password'))
      return jsonResponse({
        access_token: jwt('aal2'),
        refresh_token: 'refresh',
        expires_in: 3600,
        user: { id: 'old-operator' },
      });
    startedRead();
    return new Promise((resolve) => {
      finishRead = () =>
        resolve(
          jsonResponse(
            operation === 'session' ? { secret: 'protected' } : { signedURL: '/protected' },
          ),
        );
    });
  });
  await client.signIn('operator@example.com', 'password');
  const read =
    operation === 'session' ? client.session() : client.signEvidence('post-media', 'test.jpg');
  await started;
  client.clearSession();
  finishRead();
  await assert.rejects(read, /session changed/);
}
console.log('Late session/evidence reads are rejected after local session cleanup.');

for (const signedURL of [
  'https://untrusted.invalid/storage/v1/object/sign/post-media/photo.jpg',
  '/object/public/post-media/photo.jpg',
  '/object/sign/avatars/photo.jpg',
]) {
  const { client } = makeClient(async (url, options) => {
    if (url.includes('grant_type=password'))
      return jsonResponse({
        access_token: jwt('aal2'),
        refresh_token: 'refresh',
        expires_in: 3600,
        user: { id: 'operator' },
      });
    assert(options.signal, 'signing requests have a bounded deadline');
    assert.equal(options.headers.authorization, `Bearer ${jwt('aal2')}`);
    return jsonResponse({ signedURL });
  });
  await client.signIn('operator@example.test', 'password');
  await assert.rejects(
    client.signEvidence('post-media', 'photo.jpg'),
    /authorized Storage service/,
  );
}
{
  const { client } = makeClient(() => {
    throw new Error('Invalid references must not request a token or make a network call');
  });
  for (const [bucket, path] of [
    ['other', 'photo.jpg'],
    ['avatars', '../photo.jpg'],
    ['post-media', '/photo.jpg'],
    ['post-media', 'a//photo.jpg'],
    ['moderation-evidence', 'photo.jpg'],
    ['moderation-evidence', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/%6friginal'],
  ] as const) {
    await assert.rejects(client.signEvidence(bucket, path), /Invalid evidence reference/);
  }
}
console.log(
  'Protected media signing enforces service origin, bucket, valid paths and caller-scoped deadlines.',
);

for (const status of ['pending', 'disabled']) {
  const calls: string[] = [];
  const { client, values } = makeClient(
    async (url) => {
      calls.push(url);
      if (url.endsWith('/functions/v1/employee-signin'))
        return jsonResponse({
          access_token: jwt('aal1', 'doji_employee'),
          refresh_token: 'employee-refresh',
          user: { id: 'employee' },
        });
      if (url.endsWith('/rpc/get_employee_registration_status_v1')) return jsonResponse({ status });
      if (url.includes('/logout?scope=local')) return jsonResponse(null, 204);
      throw new Error(`Unexpected request: ${url}`);
    },
    { employeeAccountsEnabled: true },
  );
  await assert.rejects(
    client.signIn('work@example.test', 'password'),
    status === 'pending' ? /awaiting administrator approval/ : /disabled/,
  );
  assert.equal(client.hasSession(), false);
  assert.equal(values.size, 0);
  assert(
    !calls.some((url) => url.includes('/factors')),
    'pending/disabled employees never start MFA',
  );
  assert(
    !calls.some((url) => url.includes('/portal/')),
    'pending/disabled employees never read protected data',
  );
}
{
  const calls: string[] = [];
  const { client } = makeClient(
    async (url) => {
      calls.push(url);
      if (url.endsWith('/functions/v1/employee-signin'))
        return jsonResponse({ message: 'Use employee credentials' }, 401);
      throw new Error(`Unexpected request: ${url}`);
    },
    { employeeAccountsEnabled: true },
  );
  await assert.rejects(client.signIn('personal@example.test', 'password'), /employee credentials/);
  assert.equal(calls.length, 1, 'personal identity does not start password Auth or MFA in browser');
}
{
  const { client } = makeClient(
    async (url, options) => {
      assert(url.endsWith('/functions/v1/employee-register'));
      assert.deepEqual(JSON.parse(evidenceText(options.body)), {
        displayName: 'Employee',
        email: 'work@example.test',
        password: 'long-password',
      });
      return jsonResponse({ message: 'Check email' }, 202);
    },
    { employeeAccountsEnabled: true },
  );
  await client.registerEmployee('Employee', 'work@example.test', 'long-password');
  assert.equal(client.hasSession(), false);
}
console.log(
  'Employee registration, personal login rejection, pending/disabled approval and no-MFA gates passed.',
);

for (const revoked of [false, true]) {
  let sessionReads = 0;
  let invalidations = 0;
  const { client } = makeClient(
    async (url, options) => {
      if (url.includes('grant_type=password'))
        return jsonResponse({
          access_token: jwt('aal2'),
          refresh_token: 'refresh',
          expires_in: 3600,
          user: { id: 'operator' },
        });
      assert(options.signal, 'portal requests have a bounded deadline');
      if (url.endsWith('/session')) {
        sessionReads++;
        return revoked
          ? jsonResponse({ error: 'Access removed' }, 403)
          : jsonResponse({
              user_id: 'operator',
              roles: ['moderator'],
              capabilities: { moderation_read: true },
            });
      }
      return jsonResponse({ error: 'Item access denied' }, 403);
    },
    {
      onAccessInvalidated() {
        invalidations++;
      },
    },
  );
  await client.signIn('operator@example.test', 'password');
  const outcomes = await Promise.allSettled([client.commandCenter(), client.auditEvents()]);
  assert(outcomes.every((result) => result.status === 'rejected'));
  assert.equal(sessionReads, 1, 'concurrent denials share an authoritative session check');
  assert.equal(client.hasSession(), !revoked);
  assert.equal(invalidations, revoked ? 1 : 0);
  if (!revoked)
    assert(
      outcomes.every((result) => result.status === 'rejected' && result.reason.status === 403),
    );
}
console.log(
  'Authorization denials retain HTTP status, coalesce checks and clear only invalid staff access.',
);

for (const flags of [
  {},
  { businessApplicationsEnabled: true },
  { employeeAccountsEnabled: true },
]) {
  const { client } = makeClient(() => {
    throw Error('Disabled business transport must not access the network');
  }, flags);
  for (const request of [
    () => client.businessPage({}),
    () => client.businessItem('case'),
    () => client.businessCommand({}),
  ]) {
    await assert.rejects(request(), /Business review is not enabled/);
  }
}
{
  const calls: { url: string; options: Options }[] = [];
  let completeRead: (() => void) | undefined;
  const { client } = makeClient(
    async (url, options) => {
      if (url.endsWith('/functions/v1/employee-signin'))
        return jsonResponse({
          access_token: jwt('aal2', 'doji_employee'),
          refresh_token: 'business-review-refresh',
          expires_in: 3600,
          user: { id: 'employee' },
        });
      if (url.endsWith('/rpc/get_employee_registration_status_v1'))
        return jsonResponse({ status: 'active' });
      calls.push({ url, options });
      if (JSON.parse(evidenceText(options.body)).p_id === 'late')
        return new Promise((resolve) => {
          completeRead = () => resolve(jsonResponse({ id: 'late' }));
        });
      return jsonResponse({});
    },
    { employeeAccountsEnabled: true, businessApplicationsEnabled: true },
  );
  await client.signIn('work@example.test', 'password');
  await client.businessPage({ p_state: 'pending', p_limit: 25 });
  await client.businessItem('exact-case');
  await client.businessCommand({ p_id: 'exact-case', p_request_id: 'same-intent' });
  assert.deepEqual(
    calls.map((call) => call.url),
    [
      'https://project.supabase.co/rest/v1/rpc/get_admin_business_applications_page_v1',
      'https://project.supabase.co/rest/v1/rpc/get_admin_business_application_v1',
      'https://project.supabase.co/rest/v1/rpc/admin_business_application_command_v1',
    ],
  );
  for (const { options } of calls) {
    assert.equal(options.method, 'POST');
    assert.equal(options.cache, 'no-store');
    assert(options.signal);
    assert.equal(options.headers.authorization, `Bearer ${jwt('aal2', 'doji_employee')}`);
    assert.equal(options.headers.apikey, 'public-anon-key');
  }
  assert.deepEqual(JSON.parse(evidenceText(calls[1]?.options.body)), { p_id: 'exact-case' });
  const lateRead = client.businessItem('late');
  // accessToken resolves before the controlled network response is installed.
  while (!completeRead) await Promise.resolve();
  client.clearSession();
  completeRead();
  await assert.rejects(lateRead, /session changed/);
}
console.log(
  'Business review transport is independently gated, employee-scoped, bounded and rejects late reads after locking.',
);

for (const flags of [{}, { businessPrivacyEnabled: true }, { employeeAccountsEnabled: true }]) {
  const { client } = makeClient(() => {
    throw Error('No network when privacy is disabled');
  }, flags);
  for (const method of [
    'businessPrivacyPage',
    'businessPrivacyCase',
    'businessPrivacyAccess',
    'businessPrivacyCorrection',
    'businessPrivacyOpen',
    'businessPrivacyCommand',
  ] as const) {
    await assert.rejects(client[method]({}), /Business privacy is not enabled/);
  }
}
{
  const calls: { url: string; options: Options }[] = [];
  const { client } = makeClient(
    async (url, options) => {
      if (url.endsWith('/functions/v1/employee-signin'))
        return jsonResponse({
          access_token: jwt('aal2', 'doji_employee'),
          refresh_token: 'privacy-test',
          expires_in: 3600,
          user: { id: 'employee' },
        });
      if (url.endsWith('/rpc/get_employee_registration_status_v1'))
        return jsonResponse({ status: 'active' });
      calls.push({ url, options });
      return jsonResponse({});
    },
    { employeeAccountsEnabled: true, businessPrivacyEnabled: true },
  );
  await client.signIn('work@example.test', 'password');
  for (const method of [
    'businessPrivacyPage',
    'businessPrivacyCase',
    'businessPrivacyAccess',
    'businessPrivacyCorrection',
    'businessPrivacyOpen',
    'businessPrivacyCommand',
  ] as const)
    await client[method]({ p_case_id: 'exact' });
  assert.deepEqual(
    calls.map((call) => call.url.split('/').at(-1)),
    [
      'get_admin_business_privacy_page_v1',
      'get_admin_business_privacy_case_v1',
      'get_admin_business_privacy_access_v1',
      'get_admin_business_privacy_correction_v1',
      'admin_business_privacy_open_v1',
      'admin_business_privacy_command_v1',
    ],
  );
  for (const { options } of calls) {
    assert.equal(options.method, 'POST');
    assert.equal(options.cache, 'no-store');
    assert(options.signal);
    assert.equal(options.headers.authorization, `Bearer ${jwt('aal2', 'doji_employee')}`);
    assert.equal(options.headers.apikey, 'public-anon-key');
  }
  assert.equal(Reflect.get(client, 'claimBusinessErasure'), undefined);
  assert.equal(Reflect.get(client, 'finishBusinessErasure'), undefined);
}
console.log(
  'Privacy transport exposes only six independently gated employee RPCs, never service erasure calls.',
);
