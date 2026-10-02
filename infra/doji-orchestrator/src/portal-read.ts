import {
  authenticateScaleReadRequest,
  authenticateEmployeePortalRequest,
  normalizedSupabaseUrl,
  type ScaleReadAuthEnv,
} from './scale-read-auth';

type PortalReadEnv = ScaleReadAuthEnv & {
  ADMIN_PORTAL_EMPLOYEE_ACCOUNTS?: string;
  ADMIN_PORTAL_ORIGINS?: string;
  OUTBOX_RELAY_SECRET: string;
  SENTRY_API_TOKEN?: string;
  SENTRY_ORG_SLUG?: string;
  SENTRY_PROJECT_SLUGS?: string;
};

type PortalRoute = {
  args: (url: URL, body: Record<string, unknown>) => Record<string, unknown>;
  label: string;
  method: 'GET' | 'POST';
  rpc: string;
  employeeOnly?: boolean;
};

type ReadBudget = { count: number; resetAt: number };

const READS_PER_MINUTE = 120;
const MAX_BUDGET_ENTRIES = 100;
const UPSTREAM_TIMEOUT_MS = 8_000;
const SENTRY_CACHE_MS = 60_000;
const budgets = new Map<string, ReadBudget>();
let sentryCache: { expiresAt: number; value: Record<string, unknown> } | null = null;
let sentryTask: Promise<Record<string, unknown>> | null = null;
const healthReads = new Map<string, { expiresAt: number; task: Promise<Record<string, unknown>> }>();

function boundedLimit(url: URL, fallback: number): number {
  const raw = url.searchParams.get('limit');
  const parsed = raw == null ? fallback : Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    throw new Error('Invalid limit');
  }
  return parsed;
}

function resolvedReportCursor(url: URL): {
  p_before_report_id: string | null;
  p_before_resolved_at: string | null;
} {
  const resolvedAt = url.searchParams.get('beforeResolvedAt');
  const reportId = url.searchParams.get('beforeReportId');
  if (Boolean(resolvedAt) !== Boolean(reportId)) throw new Error('Invalid resolved report cursor');
  if (resolvedAt && !Number.isFinite(Date.parse(resolvedAt))) {
    throw new Error('Invalid resolved report cursor');
  }
  if (reportId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reportId)) {
    throw new Error('Invalid resolved report cursor');
  }
  return {
    p_before_report_id: reportId,
    p_before_resolved_at: resolvedAt,
  };
}

function auditCursor(url: URL): {
  p_before_id: string | null;
  p_before_occurred_at: string | null;
} {
  const occurredAt = url.searchParams.get('beforeOccurredAt');
  const id = url.searchParams.get('beforeId');
  if (Boolean(occurredAt) !== Boolean(id)) throw new Error('Invalid audit cursor');
  if (occurredAt && !Number.isFinite(Date.parse(occurredAt))) throw new Error('Invalid audit cursor');
  if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('Invalid audit cursor');
  }
  return { p_before_id: id, p_before_occurred_at: occurredAt };
}

function boundedText(url: URL, key: string, maximum: number): string | null {
  const value = url.searchParams.get(key)?.trim() ?? '';
  if (!value) return null;
  if (value.length > maximum) throw new Error(`Invalid ${key}`);
  return value;
}

function auditFilters(url: URL): { p_category: string; p_search: string | null } {
  const category = (url.searchParams.get('category') ?? 'activity').trim().toLowerCase();
  if (!['activity', 'all', 'decision', 'access', 'system'].includes(category)) {
    throw new Error('Invalid audit category');
  }
  return { p_category: category, p_search: boundedText(url, 'search', 160) };
}

export function portalRouteFor(url: URL): PortalRoute | null {
  // Additive employee editorial routes; frontend remains disabled until the
  // separately approved database + Worker release has been qualified.
  if (['/portal/admin/editorial-page', '/portal/admin/editorial-item', '/portal/admin/editorial-command'].includes(url.pathname)) {
    const command = url.pathname.endsWith('-command');
    const item = url.pathname.endsWith('-item');
    const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    return {
      employeeOnly: true,
      method: command ? 'POST' : 'GET',
      label: command ? 'admin-editorial-command' : item ? 'admin-editorial-item' : 'admin-editorial-page',
      rpc: command ? 'admin_editorial_command_v1' : item ? 'get_admin_editorial_item_v1' : 'get_admin_editorial_page_v1',
      args: (requestUrl, body) => {
        const kind = command ? body.kind : requestUrl.searchParams.get('kind');
        if (kind !== 'announcements' && kind !== 'suggestions') throw new Error('Invalid editorial collection');
        if (command) {
          const actions = kind === 'announcements' ? ['create','save','publish','cancel'] : ['approved','rejected','pending'];
          if (typeof body.action !== 'string' || !actions.includes(body.action)
            || (body.action === 'create' ? body.id != null || body.version != null : !uuid(body.id) || typeof body.version !== 'string' || !/^[a-f0-9]{32}$/.test(body.version))
            || !body.input || typeof body.input !== 'object' || Array.isArray(body.input)
            || typeof body.reason !== 'string' || body.reason.trim().length < 8 || body.reason.length > 1000
            || typeof body.idempotencyKey !== 'string' || body.idempotencyKey.length < 16 || body.idempotencyKey.length > 128) {
            throw new Error('Invalid editorial command');
          }
          return { p_kind: kind, p_action: body.action, p_id: body.id ?? null, p_version: body.version ?? null,
            p_input: body.input, p_reason: body.reason, p_idempotency_key: body.idempotencyKey };
        }
        if (item) {
          const id = requestUrl.searchParams.get('id');
          if (!uuid(id)) throw new Error('Invalid editorial ID');
          return { p_kind: kind, p_id: id };
        }
        const at = requestUrl.searchParams.get('beforeAt'); const id = requestUrl.searchParams.get('beforeId');
        if (Boolean(at) !== Boolean(id) || (at && !Number.isFinite(Date.parse(at))) || (id && !uuid(id))) throw new Error('Invalid editorial cursor');
        const filter = requestUrl.searchParams.get('filter') || 'all';
        if (!(kind === 'announcements' ? ['all','draft','published','cancelled'] : ['all','pending','approved','rejected']).includes(filter)) throw new Error('Invalid editorial filter');
        return { p_kind: kind, p_limit: boundedLimit(requestUrl, 25), p_before_at: at, p_before_id: id, p_filter: filter };
      },
    };
  }
  // Additive contracts: old report readers keep v2 until the separately reviewed
  // database release and portal integration are ready. No automatic fallback.
  if (url.pathname === '/portal/admin/report-case-v3' || url.pathname === '/portal/admin/appeal-case') {
    const appeal = url.pathname === '/portal/admin/appeal-case';
    return {
      label: appeal ? 'admin-appeal-case' : 'admin-report-case-v3',
      method: 'GET', employeeOnly: true,
      rpc: appeal ? 'get_admin_appeal_case_v1' : 'get_admin_report_case_v3',
      args: (requestUrl) => {
        const id = requestUrl.searchParams.get('id');
        if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
          || requestUrl.searchParams.getAll('id').length !== 1) throw new Error('Invalid case ID');
        return appeal ? { p_appeal_id: id } : { p_report_id: id };
      },
    };
  }
  if (url.pathname === '/portal/admin/work-queue') {
    return {
      label: 'admin-work-queue', method: 'GET', rpc: 'get_admin_work_queue_page_v1',
      args: (requestUrl) => {
        const queue = requestUrl.searchParams.get('queue') || 'all';
        const filter = requestUrl.searchParams.get('filter') || 'all';
        const at = requestUrl.searchParams.get('afterAt');
        const id = requestUrl.searchParams.get('afterId');
        if (!['all', 'moderation', 'safety', 'suggestions'].includes(queue)
          || !['all', 'open', 'urgent', 'unassigned', 'mine', 'appeal'].includes(filter)
          || Boolean(at) !== Boolean(id) || (at && !Number.isFinite(Date.parse(at)))
          || (id && !/^(report|appeal|suggestion):[0-9a-f-]{36}$/.test(id))) throw new Error('Invalid work queue parameters');
        return { p_limit: boundedLimit(requestUrl, 25), p_queue: queue, p_filter: filter,
          p_search: boundedText(requestUrl, 'search', 160), p_after_at: at, p_after_id: id };
      },
    };
  }
  if (url.pathname === '/portal/admin/session') {
    return {
      args: () => ({}),
      label: 'admin-session',
      method: 'GET',
      rpc: 'get_admin_portal_session_v3',
    };
  }
  if (url.pathname === '/portal/admin/command-center') {
    return {
      args: (requestUrl) => ({ p_limit: boundedLimit(requestUrl, 20) }),
      label: 'admin-command-center',
      method: 'GET',
      rpc: 'get_admin_command_center_snapshot_v2',
    };
  }
  if (url.pathname === '/portal/admin/report-case') {
    return {
      args: (requestUrl) => ({ p_report_id: requestUrl.searchParams.get('id') }),
      label: 'admin-report-case',
      method: 'GET',
      rpc: 'get_admin_report_case_v2',
    };
  }
  if (url.pathname === '/portal/admin/resolved-reports') {
    return {
      args: (requestUrl) => ({
        p_limit: boundedLimit(requestUrl, 25),
        ...resolvedReportCursor(requestUrl),
      }),
      label: 'admin-resolved-reports',
      method: 'GET',
      rpc: 'get_admin_resolved_reports_page_v1',
    };
  }
  if (url.pathname === '/portal/admin/audit') {
    return {
      args: (requestUrl) => ({
        p_limit: boundedLimit(requestUrl, 50),
        ...auditCursor(requestUrl),
        ...auditFilters(requestUrl),
      }),
      label: 'admin-audit',
      method: 'GET',
      rpc: 'get_admin_audit_page_v2',
    };
  }
  if (url.pathname === '/portal/admin/audit-export') {
    return {
      args: (requestUrl) => auditFilters(requestUrl),
      label: 'admin-audit-export',
      method: 'GET',
      rpc: 'get_admin_audit_export_v1',
    };
  }
  if (url.pathname === '/portal/admin/operators') {
    return {
      args: () => ({}),
      label: 'admin-operators',
      method: 'GET',
      rpc: 'get_admin_operator_directory_v1',
    };
  }
  if (url.pathname === '/portal/admin/operator-role') {
    return {
      args: (_requestUrl, body) => ({
        p_username: body.username,
        p_role: body.role,
        p_active: body.active,
        p_reason: body.reason,
        p_idempotency_key: body.idempotencyKey,
      }),
      label: 'admin-operator-role',
      method: 'POST',
      rpc: 'admin_set_operator_role_v1',
    };
  }
  if (url.pathname === '/portal/admin/platform-health-history') {
    return {
      args: (requestUrl) => ({ p_limit: boundedLimit(requestUrl, 12) }),
      label: 'admin-platform-health-history',
      method: 'GET',
      rpc: 'get_admin_event_health_history_v1',
    };
  }
  if (url.pathname === '/portal/admin/report-triage') {
    return {
      args: (_requestUrl, body) => ({
        p_report_id: body.reportId,
        p_action: body.action,
        p_priority: body.priority ?? null,
        p_note: body.note ?? null,
        p_idempotency_key: body.idempotencyKey,
      }),
      label: 'admin-report-triage',
      method: 'POST',
      rpc: 'admin_triage_report',
    };
  }
  if (url.pathname === '/portal/admin/report-review-state') {
    return {
      args: (_requestUrl, body) => ({
        p_report_id: body.reportId,
        p_action: body.action,
        p_reason: body.reason,
        p_idempotency_key: body.idempotencyKey,
      }),
      label: 'admin-report-review-state',
      method: 'POST',
      rpc: 'admin_set_report_review_state_v1',
    };
  }
  if (url.pathname === '/portal/admin/report-decision') {
    return {
      args: (_requestUrl, body) => ({
        p_report_id: body.reportId,
        p_action: body.action,
        p_policy_code: body.policyCode,
        p_severity: body.severity,
        p_reason: body.reason,
        p_user_notice: body.userNotice,
        p_account_action: body.accountAction ?? null,
        p_restriction_days: body.restrictionDays ?? null,
        p_idempotency_key: body.idempotencyKey,
      }),
      label: 'admin-report-decision',
      method: 'POST',
      rpc: 'admin_decide_report_v3',
    };
  }
  if (url.pathname === '/portal/admin/appeals') {
    return {
      args: (requestUrl) => ({ p_limit: boundedLimit(requestUrl, 20) }),
      label: 'admin-appeals',
      method: 'GET',
      rpc: 'get_admin_appeals_snapshot',
    };
  }
  if (url.pathname === '/portal/admin/appeal-decision') {
    return {
      args: (_requestUrl, body) => ({
        p_appeal_id: body.appealId,
        p_outcome: body.outcome,
        p_reason: body.reason,
        p_idempotency_key: body.idempotencyKey,
      }),
      label: 'admin-appeal-decision',
      method: 'POST',
      rpc: 'admin_review_moderation_appeal',
    };
  }
  return null;
}

function allowedOrigins(env: PortalReadEnv): Set<string> {
  return new Set(
    (env.ADMIN_PORTAL_ORIGINS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function responseHeaders(origin: string | null, serverTiming?: string): Headers {
  const headers = new Headers({
    'access-control-allow-headers': 'authorization, content-type, x-client-info',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'cache-control': 'private, no-store',
    'content-type': 'application/json',
    vary: 'Origin',
  });
  if (origin) headers.set('access-control-allow-origin', origin);
  if (serverTiming) headers.set('server-timing', serverTiming);
  return headers;
}

function consumeBudget(userId: string): boolean {
  const now = Date.now();
  const current = budgets.get(userId);
  if (!current || current.resetAt <= now) {
    if (!current && budgets.size >= MAX_BUDGET_ENTRIES) {
      const oldest = budgets.keys().next().value as string | undefined;
      if (oldest) budgets.delete(oldest);
    }
    budgets.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  current.count += 1;
  budgets.delete(userId);
  budgets.set(userId, current);
  return current.count <= READS_PER_MINUTE;
}

function jsonError(status: number, message: string, origin: string | null): Response {
  return Response.json(
    { error: message },
    { status, headers: responseHeaders(origin) },
  );
}

async function requireOperationsRead(authToken: string, env: PortalReadEnv): Promise<void> {
  const response = await fetch(
    `${normalizedSupabaseUrl(env)}/rest/v1/rpc/admin_user_has_permission`,
    {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        authorization: `Bearer ${authToken}`,
        'content-profile': 'public',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_permission: 'operations.read' }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    },
  );
  if (!response.ok || await response.json() !== true) throw new Error('Administrator access required');
}

type SentryIssue = {
  count?: string;
  culprit?: string;
  firstSeen?: string;
  id?: string;
  lastSeen?: string;
  level?: string;
  metadata?: { title?: string; type?: string; value?: string };
  permalink?: string;
  project?: { id?: string; name?: string; slug?: string };
  shortId?: string;
  status?: string;
  title?: string;
  userCount?: number;
};

async function fetchSentrySnapshot(env: PortalReadEnv): Promise<Record<string, unknown>> {
  if (!env.SENTRY_API_TOKEN || !env.SENTRY_ORG_SLUG) {
    return { configured: false, available: false, issues: [] };
  }
  const query = new URLSearchParams({
    environment: 'production',
    statsPeriod: '24h',
    sort: 'date',
    limit: '25',
    query: 'is:unresolved',
  });
  for (const project of (env.SENTRY_PROJECT_SLUGS ?? '').split(',').map((value) => value.trim()).filter(Boolean)) {
    query.append('project', project);
  }
  const response = await fetch(
    `https://sentry.io/api/0/organizations/${encodeURIComponent(env.SENTRY_ORG_SLUG)}/issues/?${query}`,
    {
      headers: { authorization: `Bearer ${env.SENTRY_API_TOKEN}` },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    return { configured: true, available: false, issues: [], upstream_status: response.status };
  }
  const payload = await response.json() as unknown;
  const issues = Array.isArray(payload) ? payload as SentryIssue[] : [];
  return {
    configured: true,
    available: true,
    window: '24h',
    unresolved_count: issues.length,
    issues: issues.map((issue) => ({
      id: issue.id ?? null,
      short_id: issue.shortId ?? null,
      title: issue.title ?? issue.metadata?.title ?? issue.metadata?.value ?? 'Unhandled production issue',
      culprit: issue.culprit ?? null,
      level: issue.level ?? 'error',
      event_count: Number(issue.count ?? 0),
      affected_users: Number(issue.userCount ?? 0),
      first_seen: issue.firstSeen ?? null,
      last_seen: issue.lastSeen ?? null,
      status: issue.status ?? 'unresolved',
      project: issue.project?.slug ?? issue.project?.name ?? null,
      permalink: issue.permalink?.startsWith('https://') ? issue.permalink : null,
    })),
  };
}

async function cachedSentrySnapshot(env: PortalReadEnv): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (sentryCache && sentryCache.expiresAt > now) return sentryCache.value;
  if (sentryTask) return sentryTask;
  sentryTask = fetchSentrySnapshot(env).then((value) => {
    sentryCache = { expiresAt: Date.now() + SENTRY_CACHE_MS, value };
    return value;
  }).finally(() => { sentryTask = null; });
  return sentryTask;
}

async function cachedOperationalRead(authToken: string, env: PortalReadEnv): Promise<Record<string, unknown>> {
  // Only called AFTER per-request authorization. Cache contains operational
  // aggregates, never credentials or case evidence; no snapshot-writing endpoint.
  const key = normalizedSupabaseUrl(env);
  const cached = healthReads.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.task;
  const task = fetch(`${key}/rest/v1/rpc/get_admin_operational_health_read_v1`, {
    method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${authToken}`,
      'content-profile': 'public', 'content-type': 'application/json' },
    body: '{}', signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  }).then(async (response) => {
    if (!response.ok) throw new Error('Operational read unavailable');
    const value = await response.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid operational read');
    return value as Record<string, unknown>;
  });
  if (healthReads.size >= 4) healthReads.clear();
  healthReads.set(key, { expiresAt: Date.now() + 30_000, task });
  return task;
}

async function platformHealthSnapshot(authToken: string, env: PortalReadEnv): Promise<Record<string, unknown>> {
  const generatedAt = new Date().toISOString();
  const [operationalResult, sentryResult] = await Promise.allSettled([
    cachedOperationalRead(authToken, env),
    cachedSentrySnapshot(env),
  ]);
  return {
    generated_at: generatedAt,
    operational: operationalResult.status === 'fulfilled'
      ? { available: true, ...operationalResult.value }
      : { available: false, healthy: false },
    sentry: sentryResult.status === 'fulfilled'
      ? sentryResult.value
      : { configured: Boolean(env.SENTRY_API_TOKEN), available: false, issues: [] },
  };
}

/**
 * Bounded gateway for the private operator portal. The caller's JWT remains the
 * database authorization context; the Worker never receives or uses a service-role
 * key. Writes route only to narrow AAL2/idempotent RPCs and nothing is edge cached.
 */
export async function handlePortalRead(
  request: Request,
  env: PortalReadEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/portal/admin/')) return null;

  const requestOrigin = request.headers.get('origin');
  const origin = requestOrigin && allowedOrigins(env).has(requestOrigin)
    ? requestOrigin
    : null;
  if (requestOrigin && !origin) return jsonError(403, 'Origin not allowed', null);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: responseHeaders(origin) });
  }
  if (!['GET', 'POST'].includes(request.method)) {
    return jsonError(405, 'Method not allowed', origin);
  }

  const startedAt = performance.now();
  try {
    const route = portalRouteFor(url);
    const realtimeTokenRoute = url.pathname === '/portal/admin/realtime-token';
    const platformHealthRoute = url.pathname === '/portal/admin/platform-health';
    if (!route && !realtimeTokenRoute && !platformHealthRoute) return jsonError(404, 'Not found', origin);
    if (realtimeTokenRoute && request.method !== 'GET') {
      return jsonError(405, 'Method not allowed', origin);
    }
    if (platformHealthRoute && request.method !== 'GET') {
      return jsonError(405, 'Method not allowed', origin);
    }
    if (route && request.method !== route.method) {
      return jsonError(405, 'Method not allowed', origin);
    }

    let inputBody: Record<string, unknown> = {};
    if (request.method === 'POST') {
      const declaredLength = Number(request.headers.get('content-length') || 0);
      if (declaredLength > 8_192) return jsonError(413, 'Request body too large', origin);
      const bodyText = await request.text();
      if (new TextEncoder().encode(bodyText).byteLength > 8_192) {
        return jsonError(413, 'Request body too large', origin);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        return jsonError(400, 'Invalid request body', origin);
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return jsonError(400, 'Invalid request body', origin);
      }
      inputBody = parsed as Record<string, unknown>;
    }

    const employeeMode = env.ADMIN_PORTAL_EMPLOYEE_ACCOUNTS === 'true';
    if (route?.employeeOnly && !employeeMode) return jsonError(403, 'Employee portal required', origin);
    const auth = await (employeeMode ? authenticateEmployeePortalRequest : authenticateScaleReadRequest)(request, env);
    if (employeeMode && route?.rpc === 'get_admin_operator_directory_v1') route.rpc = 'get_admin_employee_directory_v1';
    if (employeeMode && route?.rpc === 'admin_set_operator_role_v1') route.rpc = 'admin_set_employee_role_v1';
    if (auth.aal !== 'aal2') return jsonError(403, 'Administrator MFA required', origin);
    if (!consumeBudget(auth.userId)) {
      const response = jsonError(429, 'Portal request rate exceeded', origin);
      response.headers.set('retry-after', '60');
      return response;
    }
    if (platformHealthRoute) {
      await requireOperationsRead(auth.token, env);
      return Response.json(await platformHealthSnapshot(auth.token, env), {
        headers: responseHeaders(origin),
      });
    }

    const upstreamStartedAt = performance.now();
    const upstream = await fetch(
      realtimeTokenRoute
        ? `${normalizedSupabaseUrl(env)}/functions/v1/realtime-token`
        : `${normalizedSupabaseUrl(env)}/rest/v1/rpc/${route!.rpc}`,
      {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          authorization: `Bearer ${auth.token}`,
          ...(realtimeTokenRoute ? {} : { 'content-profile': 'public' }),
          'content-type': 'application/json',
          'x-client-info': request.headers.get('x-client-info') ?? 'doji-admin-portal/1.0',
        },
        body: JSON.stringify(
          realtimeTokenRoute ? { admin: true, postIds: [] } : route!.args(url, inputBody),
        ),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      },
    );
    const body = await upstream.arrayBuffer();
    const upstreamDuration = Math.max(0, performance.now() - upstreamStartedAt);
    const totalDuration = Math.max(0, performance.now() - startedAt);
    console.info(JSON.stringify({
      event: request.method === 'POST' ? 'portal_command' : 'portal_read',
      route: realtimeTokenRoute ? 'admin-realtime-token' : route!.label,
      status: upstream.status,
      upstreamDurationMs: Math.round(upstreamDuration * 10) / 10,
      totalDurationMs: Math.round(totalDuration * 10) / 10,
    }));
    return new Response(body, {
      status: upstream.status,
      headers: responseHeaders(
        origin,
        `db;dur=${upstreamDuration.toFixed(1)}, total;dur=${totalDuration.toFixed(1)}`,
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Portal read failed';
    const status = /Authentication|access token/.test(message)
      ? 401
      : /Administrator access required/.test(message)
        ? 403
      : /Invalid/.test(message)
        ? 400
        : 503;
    console.error(JSON.stringify({ event: 'portal_read_error', status, message }));
    return jsonError(
      status,
      status === 503 ? 'Portal data is temporarily unavailable' : message,
      origin,
    );
  }
}
