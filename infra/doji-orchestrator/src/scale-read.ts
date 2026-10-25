import {
  authenticateScaleReadRequest,
  normalizedSupabaseUrl,
  type ScaleReadAuthEnv,
} from './scale-read-auth';
import {
  forScaleReadClient,
  scaleReadCache,
  storeScaleReadResponse,
} from './scale-read-cache';
import { readDeadline } from './read-deadline';

type ScaleReadEnv = ScaleReadAuthEnv & {
  SCALE_CACHE_VERSION?: string;
};

type Route = { args: Record<string, unknown>; label: string; rpc: string; ttl: number };
type OriginResult = { body: string; headers: HeadersInit; status: number };
type ReadBudget = { count: number; resetAt: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USERNAME = /^[a-z0-9_.]{1,30}$/;
const READS_PER_MINUTE = 240;
const MAX_BUDGET_ENTRIES = 10_000;
const readBudgets = new Map<string, ReadBudget>();

function consumeReadBudget(userId: string): boolean {
  const now = Date.now();
  const current = readBudgets.get(userId);
  if (!current || current.resetAt <= now) {
    if (!current && readBudgets.size >= MAX_BUDGET_ENTRIES) {
      const oldest = readBudgets.keys().next().value as string | undefined;
      if (oldest) readBudgets.delete(oldest);
    }
    readBudgets.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  current.count += 1;
  readBudgets.delete(userId);
  readBudgets.set(userId, current);
  return current.count <= READS_PER_MINUTE;
}

function oneOf(value: string | null, choices: string[], fallback: string): string {
  const resolved = value ?? fallback;
  if (!choices.includes(resolved)) throw new Error('Invalid query');
  return resolved;
}

function integer(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = value == null ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error('Invalid query');
  return parsed;
}

export function routeFor(url: URL): Route | null {
  let match = /^\/v1\/posts\/([0-9a-f-]+)\/engagement$/.exec(url.pathname);
  if (match && UUID.test(match[1]))
    return {
      args: {
        p_post_id: match[1],
        p_audience: oneOf(url.searchParams.get('audience'), ['friends', 'everyone'], 'everyone'),
      },
      label: 'engagement',
      rpc: 'get_post_engagement_snapshot_v2',
      ttl: 1,
    };
  match = /^\/v1\/polls\/([0-9a-f-]+)\/summary$/.exec(url.pathname);
  if (match && UUID.test(match[1]))
    return {
      args: {
        p_daily_event_id: match[1],
        p_audience: oneOf(url.searchParams.get('audience'), ['friends', 'everyone'], 'friends'),
      },
      label: 'poll',
      rpc: 'get_poll_results_summary',
      ttl: 1,
    };
  match = /^\/v1\/profiles\/([^/]+)$/.exec(url.pathname);
  if (match) {
    const username = decodeURIComponent(match[1]).toLowerCase();
    if (!USERNAME.test(username)) throw new Error('Invalid profile');
    return {
      args: { p_username: username },
      label: 'profile',
      rpc: 'get_public_profile_view',
      ttl: 5,
    };
  }
  match = /^\/v1\/feed\/([0-9a-f-]+)$/.exec(url.pathname);
  if (match && UUID.test(match[1])) {
    const audience = oneOf(url.searchParams.get('audience'), ['friends', 'everyone'], 'friends');
    const unlocked = oneOf(url.searchParams.get('unlocked'), ['true', 'false'], 'true') === 'true';
    const limit = integer(url.searchParams.get('limit'), 20, 1, 40);
    if (!unlocked)
      return {
        args: {
          p_daily_event_ids: [match[1]],
          p_audience: audience,
          p_limit: limit,
          p_offset: integer(url.searchParams.get('offset'), 0, 0, 10_000),
        },
        label: 'feed-locked',
        rpc: 'get_locked_feed_previews',
        ttl: 2,
      };
    const beforeCreatedAt = url.searchParams.get('beforeCreatedAt');
    const beforeId = url.searchParams.get('beforeId');
    if (
      (beforeCreatedAt && !Number.isFinite(Date.parse(beforeCreatedAt))) ||
      (beforeId && !UUID.test(beforeId))
    )
      throw new Error('Invalid cursor');
    return {
      args: {
        p_daily_event_id: match[1],
        p_audience: audience,
        p_limit: limit,
        p_before_created_at: beforeCreatedAt,
        p_before_id: beforeId,
      },
      label: 'feed',
      rpc: 'get_feed_page_snapshot_v2',
      ttl: 2,
    };
  }
  return null;
}

async function originRead(env: ScaleReadEnv, token: string, route: Route,
  budget: ReturnType<typeof readDeadline>, onHeaders: () => void): Promise<OriginResult> {
  const response = await budget.wait(fetch(`${normalizedSupabaseUrl(env)}/rest/v1/rpc/${route.rpc}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(route.args),
    signal: budget.signal,
  }));
  onHeaders();
  const body = await budget.wait(response.text());
  return {
    body: response.ok ? body || 'null' : body,
    status: response.ok ? 200 : response.status,
    headers: {
      'content-type': 'application/json',
      ...(response.ok ? { 'cache-control': `public, max-age=${route.ttl}` } : {}),
    },
  };
}

export async function handleScaleRead(
  request: Request,
  env: ScaleReadEnv,
  context?: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v1/')) return null;
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const started = Date.now();
  // Leave room for the response to reach existing clients with an 8s deadline.
  const budget = readDeadline(6_000);
  let phase = 'route';
  let route: Route | null = null;
  const ray = request.headers.get('cf-ray');
  const rayId = ray && /^[0-9a-f]{16}(?:-[A-Z]{3})?$/i.test(ray) ? ray : undefined;
  try {
    route = routeFor(url);
    if (!route) return new Response('Not found', { status: 404 });
    phase = 'authentication';
    const auth = await budget.wait(authenticateScaleReadRequest(request, env));
    if (!consumeReadBudget(auth.userId)) {
      return Response.json(
        { error: 'Read rate exceeded' },
        { status: 429, headers: { 'retry-after': '60' } },
      );
    }
    const version = env.SCALE_CACHE_VERSION?.trim() || 'v1';
    const requestIdentity = encodeURIComponent(JSON.stringify(route.args));
    const cacheKey = new Request(
      `https://scale-cache.doji.internal/${version}/${auth.userId}/${route.label}?args=${requestIdentity}`,
    );
    phase = 'cache_lookup';
    const cached = await budget.wait(scaleReadCache().match(cacheKey));
    if (cached) {
      phase = 'cache_body';
      const body = await budget.wait(cached.text());
      console.log(JSON.stringify({
          event: 'scale_read',
          route: route.label,
          status: cached.status,
          cache: 'hit',
          durationMs: Date.now() - started,
      }));
      return forScaleReadClient(new Response(body, { status: cached.status, headers: cached.headers }), 'hit', Date.now() - started);
    }
    // Pending upstream I/O belongs to this invocation. Completed responses are
    // shared only through the existing authorized, member-scoped edge cache.
    phase = 'origin_fetch';
    const result = await originRead(env, auth.token, route, budget, () => { phase = 'origin_body'; });
    const response = new Response(result.body, {
      status: result.status,
      headers: result.headers,
    });
    phase = 'cache_write';
    if (response.ok) await budget.wait(storeScaleReadResponse(cacheKey, response, route.label, context));
    console.log(JSON.stringify({
        event: 'scale_read',
        route: route.label,
        status: response.status,
        cache: 'miss',
        durationMs: Date.now() - started,
    }));
    return forScaleReadClient(response, 'miss', Date.now() - started);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scale read failed';
    const status = /Authentication|access token/.test(message)
      ? 401
      : /Invalid/.test(message)
        ? 400
        : 503;
    console.error(JSON.stringify({ event: 'scale_read_error', status, route: route?.label,
      phase, deadlineExceeded: budget.expired || (error instanceof Error && error.name === 'TimeoutError'),
      durationMs: Date.now() - started, rayId }));
    return Response.json(
      { error: status === 503 ? 'Scale read unavailable' : message },
      { status, headers: { 'cache-control': 'private, no-store' } },
    );
  } finally {
    budget.cleanup();
  }
}
