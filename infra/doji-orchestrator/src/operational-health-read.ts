export type OperationalEnv = { SUPABASE_URL: string; OUTBOX_RELAY_SECRET: string };
type HealthPhase = 'headers' | 'body' | 'parse' | 'repair';
type HealthFailureKind = 'http' | 'invalid-response' | 'network' | 'timeout' | 'repair';
const HEALTH_TIMEOUT_MS = 20_000;
const HEALTH_ATTEMPTS = 2;

export class OperationalHealthCheckError extends Error {
  constructor(
    readonly failureKind: HealthFailureKind,
    readonly attempts: number,
    readonly phase: HealthPhase = 'headers',
    readonly status: number | null = null,
    readonly elapsedMs = 0,
    readonly requestId: string | null = null,
  ) {
    super(`Operational health ${failureKind} failure during ${phase}`);
    this.name = 'OperationalHealthCheckError';
  }
}

function timeoutFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { message?: unknown; name?: unknown };
  return value.name === 'AbortError' || value.name === 'TimeoutError' ||
    (typeof value.message === 'string' && /aborted.*timeout|timed out/i.test(value.message));
}

export function operationalHealthFailureDetails(error: unknown): Record<string, unknown> {
  const failure = error instanceof OperationalHealthCheckError ? error
    : new OperationalHealthCheckError(timeoutFailure(error) ? 'timeout' : 'network', HEALTH_ATTEMPTS);
  return {
    provider: failure.phase === 'repair' ? 'cloudflare' : 'supabase',
    provider_surface: failure.phase === 'repair' ? 'durable-objects' : 'edge-functions',
    failure_kind: failure.failureKind,
    failure_phase: failure.phase,
    attempts: failure.attempts,
    upstream_status: failure.status,
    attempt_elapsed_ms: failure.elapsedMs,
    upstream_request_id: failure.requestId,
    durable_event_state: 'unverified-health-read',
  };
}

async function readAttempt(env: OperationalEnv, attempt: number): Promise<Record<string, unknown>> {
  const started = Date.now();
  const controller = new AbortController();
  let phase: HealthPhase = 'headers';
  let status: number | null = null;
  let requestId: string | null = null;
  const failure = (kind: HealthFailureKind) => new OperationalHealthCheckError(
    kind, attempt, phase, status, Date.now() - started, requestId,
  );
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(failure('timeout'));
      controller.abort();
    }, HEALTH_TIMEOUT_MS);
  });
  const read = async () => {
    const response = await fetch(`${env.SUPABASE_URL}/functions/v1/operational-health`, {
      method: 'POST', headers: { 'x-outbox-secret': env.OUTBOX_RELAY_SECRET }, signal: controller.signal,
    });
    if (controller.signal.aborted) {
      void response.body?.cancel().catch(() => {});
      throw failure('timeout');
    }
    status = response.status;
    const id = response.headers.get('sb-request-id');
    requestId = id && /^[a-zA-Z0-9_-]{1,80}$/.test(id) ? id : null;
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw failure('http');
    }
    phase = 'body';
    const text = await response.text();
    if (controller.signal.aborted) throw failure('timeout');
    phase = 'parse';
    try {
      const value: unknown = JSON.parse(text);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('invalid-response');
      return value as Record<string, unknown>;
    } catch { throw failure('invalid-response'); }
  };
  try { return await Promise.race([read(), deadline]); }
  catch (error) {
    throw error instanceof OperationalHealthCheckError ? error
      : failure(timeoutFailure(error) ? 'timeout' : 'network');
  } finally { clearTimeout(timer!); }
}

export async function fetchOperationalHealth(env: OperationalEnv): Promise<Record<string, unknown>> {
  for (let attempt = 1; ; attempt += 1) {
    try { return await readAttempt(env, attempt); }
    catch (error) {
      if (attempt === HEALTH_ATTEMPTS) throw error;
      await new Promise((resolve) => { setTimeout(resolve, 750); });
    }
  }
}
