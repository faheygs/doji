import { readJsonBody } from './json-body.ts';

export const BUSINESS_TOKEN_TTL = 10 * 60 * 1000;
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
type Env = { enabled: boolean; origin: string; supabaseUrl: string; anonKey: string };
type Signer = (params: { clientId: string; ttl: number; capability: string }) => Promise<unknown>;
async function bounded<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error('Deadline')), 8000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export async function businessRealtimeToken(
  request: Request,
  env: Env,
  sign: Signer,
  upstream: typeof fetch = fetch,
) {
  const headers = {
    'cache-control': 'no-store',
    vary: 'Origin',
    'access-control-allow-origin': env.origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, apikey, authorization',
  };
  const reply = (status: number, message: string) =>
    Response.json({ message }, { status, headers });
  if (!env.enabled) return reply(404, 'Business realtime is not enabled.');
  try {
    if (
      new URL(env.origin).origin !== env.origin ||
      !env.origin.startsWith('https://') ||
      new URL(env.supabaseUrl).origin !== env.supabaseUrl ||
      !env.supabaseUrl.startsWith('https://') ||
      !env.anonKey
    )
      throw Error();
  } catch {
    return reply(503, 'Business realtime is unavailable.');
  }
  if (request.headers.get('origin') !== env.origin) return reply(403, 'Origin not allowed.');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply(405, 'Method not allowed.');
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ') || authorization.length > 8192)
    return reply(401, 'Sign in again.');
  try {
    const body = await bounded(readJsonBody(request, 256));
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)
      throw Error();
  } catch {
    return reply(400, 'No subscription parameters are accepted.');
  }
  try {
    // The database verifies the caller JWT/live identity; never substitute service_role.
    const response = await upstream(
      `${env.supabaseUrl}/rest/v1/rpc/get_business_realtime_capability_v1`,
      {
        method: 'POST',
        headers: { authorization, apikey: env.anonKey, 'content-type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(8000),
        cache: 'no-store',
      },
    );
    const data = await response.json();
    if (!response.ok)
      return reply(
        [401, 403].includes(response.status) ? response.status : 503,
        'Business realtime authorization unavailable.',
      );
    if (data?.allowed === false)
      return reply(429, 'Business realtime renewal limit reached. Use Refresh.');
    if (
      data?.allowed !== true ||
      !uuid(data.userId) ||
      data.topic !== `business:${data.userId}:events`
    )
      return reply(503, 'Business realtime authorization unavailable.');
    const tokenRequest = await bounded(
      sign({
        clientId: `business:${data.userId}`,
        ttl: BUSINESS_TOKEN_TTL,
        capability: JSON.stringify({ [data.topic]: ['subscribe'] }),
      }),
    );
    return Response.json({ topic: data.topic, tokenRequest }, { headers });
  } catch {
    return reply(503, 'Business realtime is unavailable. Use Refresh.');
  }
}

type Event = {
  topic: string;
  event_type: string;
  aggregate_id: string | null;
  payload: Record<string, unknown>;
};
export function isBusinessEvent(event: Event) {
  return (
    event.topic.startsWith('business:') ||
    event.event_type.startsWith('business.') ||
    event.event_type.startsWith('moderation.business.')
  );
}
export function assertBusinessEvent(event: Event, enabled: boolean) {
  if (!isBusinessEvent(event)) return; // Existing member/employee event families unchanged.
  if (!enabled) throw Error('Business realtime disabled');
  const p = event.payload;
  const applicant = event.event_type === 'business.application.updated';
  if (
    (!applicant && event.event_type !== 'moderation.business.updated') ||
    !uuid(p.applicationId) ||
    event.aggregate_id !== p.applicationId ||
    p.sendPush !== false ||
    (p.realtimePublished !== undefined && p.realtimePublished !== true) ||
    Object.keys(p).some(
      (key) =>
        ![
          'applicationId',
          'sendPush',
          'realtimePublished',
          ...(applicant ? ['applicantId'] : []),
        ].includes(key),
    ) ||
    (applicant
      ? !uuid(p.applicantId) || event.topic !== `business:${p.applicantId}:events`
      : event.topic !== 'moderation:global')
  )
    throw Error('Invalid business realtime envelope');
}
