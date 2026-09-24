import {
  authenticateScaleReadRequest,
  normalizedSupabaseUrl,
  type ScaleReadAuthEnv,
} from './scale-read-auth';

type PortalReadEnv = ScaleReadAuthEnv & {
  ADMIN_PORTAL_ORIGINS?: string;
};

type PortalRoute = {
  args: (url: URL, body: Record<string, unknown>) => Record<string, unknown>;
  label: string;
  method: 'GET' | 'POST';
  rpc: string;
};

type ReadBudget = { count: number; resetAt: number };

const READS_PER_MINUTE = 120;
const MAX_BUDGET_ENTRIES = 100;
const UPSTREAM_TIMEOUT_MS = 8_000;
const budgets = new Map<string, ReadBudget>();

function boundedLimit(url: URL, fallback: number): number {
  const raw = url.searchParams.get('limit');
  const parsed = raw == null ? fallback : Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    throw new Error('Invalid limit');
  }
  return parsed;
}

export function portalRouteFor(url: URL): PortalRoute | null {
  if (url.pathname === '/portal/admin/session') {
    return {
      args: () => ({}),
      label: 'admin-session',
      method: 'GET',
      rpc: 'get_admin_portal_session_v2',
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
  if (url.pathname === '/portal/admin/report-decision') {
    return {
      args: (_requestUrl, body) => ({
        p_report_id: body.reportId,
        p_action: body.action,
        p_policy_code: body.policyCode,
        p_severity: body.severity,
        p_reason: body.reason,
        p_user_notice: body.userNotice,
        p_idempotency_key: body.idempotencyKey,
      }),
      label: 'admin-report-decision',
      method: 'POST',
      rpc: 'admin_decide_report_v2',
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
    if (!route && !realtimeTokenRoute) return jsonError(404, 'Not found', origin);
    if (realtimeTokenRoute && request.method !== 'GET') {
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

    const auth = await authenticateScaleReadRequest(request, env);
    if (auth.aal !== 'aal2') return jsonError(403, 'Administrator MFA required', origin);
    if (!consumeBudget(auth.userId)) {
      const response = jsonError(429, 'Portal request rate exceeded', origin);
      response.headers.set('retry-after', '60');
      return response;
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
          realtimeTokenRoute ? { postIds: [] } : route!.args(url, inputBody),
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
