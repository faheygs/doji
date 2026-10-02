/** Read-only, request-scoped diagnostics. Never retains URLs, bodies or credentials.
 * Weak keys prevent one concurrent request/account from borrowing another's response.
 * This observes existing fetches; it never makes requests or changes their headers.
 */
type ReadDiagnostics = {
  transport: 'supabase' | 'scale_gateway';
  stage: 'before_fetch' | 'fetch' | 'headers' | 'fetch_rejected';
  dispatch_ms?: number;
  headers_ms?: number;
  response_status?: number;
  sb_request_id?: string;
  cf_ray?: string;
  response_type?: 'json' | 'html' | 'text' | 'other' | 'missing';
  cache_status?: string;
  cache_only_signature?: boolean;
};
type Entry = { startedAt: number; data: ReadDiagnostics };
const requests = new WeakMap<AbortSignal, Entry>();
const failures = new WeakMap<object, ReadDiagnostics>();
const elapsed = (start: number) => Math.min(120_000, Math.max(0, Math.round(Date.now() - start)));

export function beginReadDiagnostics(signal: AbortSignal, transport: ReadDiagnostics['transport']): void {
  requests.set(signal, { startedAt: Date.now(), data: { transport, stage: 'before_fetch' } });
}

export function finishReadDiagnostics(signal: AbortSignal, error?: object): void {
  const entry = requests.get(signal);
  if (entry && error) failures.set(error, { ...entry.data });
  requests.delete(signal);
}

export function readFailureDiagnostics(error: unknown): Readonly<ReadDiagnostics> | undefined {
  const data = error && typeof error === 'object' ? failures.get(error) : undefined;
  return data ? { ...data } : undefined;
}

export function inheritReadDiagnostics(source: unknown, target: object): void {
  const data = readFailureDiagnostics(source);
  if (data) failures.set(target, { ...data });
}

/** Exact allowlisted response hints, not a claim about which system caused failure. */
function responseHints(response: Response): Partial<ReadDiagnostics> {
  const hints: Partial<ReadDiagnostics> = {};
  if (Number.isInteger(response.status) && response.status >= 100 && response.status <= 599) {
    hints.response_status = response.status;
  }
  const requestId = response.headers.get('sb-request-id');
  if (requestId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    hints.sb_request_id = requestId;
  }
  const ray = response.headers.get('cf-ray');
  if (ray && /^[0-9a-f]{16}(?:-[A-Z]{3})?$/i.test(ray)) hints.cf_ray = ray;
  const mime = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  hints.response_type = !mime ? 'missing' : mime === 'application/json' || mime === 'application/problem+json'
    ? 'json' : mime === 'text/html' ? 'html' : mime === 'text/plain' ? 'text' : 'other';
  const cache = response.headers.get('cf-cache-status')?.toUpperCase();
  if (cache && ['HIT', 'MISS', 'DYNAMIC', 'BYPASS', 'EXPIRED', 'STALE', 'UPDATING', 'REVALIDATED'].includes(cache)) {
    hints.cache_status = cache;
  }
  // OkHttp's exact synthetic status text; do not retain arbitrary status/body text.
  hints.cache_only_signature = response.status === 504 && response.statusText === 'Unsatisfiable Request (only-if-cached)';
  return hints;
}

export async function observedMemberFetch(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const entry = init.signal ? requests.get(init.signal) : undefined;
  if (!entry) return fetch(input, init);
  entry.data = { transport: entry.data.transport, stage: 'fetch', dispatch_ms: elapsed(entry.startedAt) };
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    entry.data.stage = 'fetch_rejected';
    throw error;
  }
  // Broken/absent response headers must not change the request's real outcome.
  entry.data.stage = 'headers';
  entry.data.headers_ms = elapsed(entry.startedAt);
  try { Object.assign(entry.data, responseHints(response)); } catch { /* best effort */ }
  return response;
}
