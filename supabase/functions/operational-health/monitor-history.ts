import { monitorProject, validMonitorObservation } from '../_shared/monitor-observation.ts';
import { assessMonitorHeartbeat } from '../_shared/monitor-heartbeat.ts';

type Result = { data?: unknown; error?: unknown };
type Database = { rpc(name: string, args?: Record<string, unknown>): { abortSignal(signal: AbortSignal): PromiseLike<Result> } };
type Config = { enabled?: string; environment?: string; supabaseUrl?: string; writeSecret?: string; readSecret?: string };
const reply = (status: number, value?: unknown) => new Response(value === undefined ? null : JSON.stringify(value), {
  status, headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
});

async function boundedJson(request: Request, signal: AbortSignal): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw Error('Missing body');
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    let text = '', length = 0;
    const decoder = new TextDecoder();
    while (!signal.aborted) {
      const part = await reader.read();
      if (part.done) return JSON.parse(text + decoder.decode());
      length += part.value.byteLength;
      if (length > 1024) throw Error('Oversize body');
      text += decoder.decode(part.value, { stream: true });
    }
    throw Error('Timed out');
  } finally { signal.removeEventListener('abort', cancel); cancel(); }
}

/** Dedicated paths never run collector repairs, archive refreshes or provider calls. */
export async function handleMonitorHistoryRequest(
  request: Request, config: Config, database: () => Database,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const write = path.endsWith('/monitor-observation'), read = path.endsWith('/monitor-check');
  if (!write && !read) return null;
  const project = monitorProject(config.environment);
  if (config.enabled !== 'true' || !project || config.supabaseUrl !== `https://${project}.supabase.co`)
    return reply(404);
  if (request.method !== (write ? 'POST' : 'GET')) return reply(405);
  const secret = write ? config.writeSecret : config.readSecret;
  if (!secret || request.headers.get(write ? 'x-outbox-secret' : 'x-monitor-check-secret') !== secret)
    return reply(401);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<Response>((resolve) => {
      timer = setTimeout(() => { controller.abort(); resolve(reply(503)); }, 2000);
    });
    const operation = async () => {
      if (write) {
        let body: unknown;
        try { body = await boundedJson(request, controller.signal); } catch { return reply(400); }
        if (!validMonitorObservation(body) || controller.signal.aborted) return reply(400);
        const result = await database().rpc('record_monitor_observation_v1', {
          p_monitor: 'worker', p_observation_id: body.id, p_observed_at: body.observedAt,
          p_state: body.state, p_family: body.family,
        }).abortSignal(controller.signal);
        return reply(result.error ? 503 : result.data === true ? 204 : 409);
      }
      const result = await database().rpc('get_monitor_heartbeat_v1').abortSignal(controller.signal);
      if (result.error || !result.data || typeof result.data !== 'object') return reply(503);
      const row = result.data as Record<string, unknown>;
      const timestamp = (value: unknown) => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
      if (typeof row.enabled !== 'boolean' || !timestamp(row.checked_at)
        || ![row.observed_at, row.received_at].every(value => value === null || timestamp(value))
        || ![null, 'healthy', 'degraded', 'unavailable'].includes(row.state as string | null)) return reply(503);
      const body = { environment: config.environment, heartbeat: {
        enabled: row.enabled, checked_at: row.checked_at, observed_at: row.observed_at,
        received_at: row.received_at, state: row.state,
      } };
      return reply(assessMonitorHeartbeat(body, config.environment!).ok ? 200 : 503, body);
    };
    return await Promise.race([operation().catch(() => reply(503)), deadline]);
  } finally { clearTimeout(timer); controller.abort(); }
}
