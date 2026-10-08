import { Platform } from 'react-native';
import { AndroidReadEvidence, appStateSnapshot, observeMemberResponseBody, startMemberRequestEvidence } from './androidReadEvidence';
import { mobileDiagnosticSnapshot, diagnosticSessionIsCurrent } from './mobileDiagnosticContext';
import { newCommandId } from './idempotency';
import { safeDiagnosticEndpoint } from './diagnosticOperations';

/** Read-only, request-scoped diagnostics. Never retains URLs, bodies or credentials.
 * Weak keys prevent one concurrent request/account from borrowing another's response.
 * This observes existing fetches; it never makes requests or changes their headers.
 */
type ReadDiagnostics = AndroidReadEvidence & {
  transport: 'supabase' | 'scale_gateway' | 'command_gateway';
  stage: 'before_fetch' | 'fetch' | 'headers' | 'fetch_rejected';
  dispatch_ms?: number;
  headers_ms?: number;
  response_status?: number;
  sb_request_id?: string;
  cf_ray?: string;
  response_type?: 'json' | 'html' | 'text' | 'other' | 'missing';
  cache_status?: string;
  status_text_available?: boolean;
  cache_only_signature?: boolean;
  native_response_source?: 'network' | 'cache' | 'local_cache_miss' | 'unknown';
  native_request_cache_only?: boolean;
  native_protocol?: 'http/1.0' | 'http/1.1' | 'h2' | 'h2_prior_knowledge';
  native_network_headers_ms?: number;
  native_prior_response_count?: number;
  abort_source?: 'none' | 'deadline' | 'parent';
  deadline_ms?: number;
  elapsed_ms?: number;
  elapsed_capped?: boolean;
  request_id?: string;
  in_flight_start?: number;
  in_flight_end?: number;
  endpoint?: string;
  fetch_error_name?: string;
  response_content_length?: number;
  response_age_seconds?: number;
  retry_after_seconds?: number;
};
type Runtime = ReturnType<typeof mobileDiagnosticSnapshot>;
type Entry = { startedAt: number; data: ReadDiagnostics; runtime?: Runtime };
const requests = new WeakMap<AbortSignal, Entry>();
const failures = new WeakMap<object, ReadDiagnostics>();
const failureContexts = new WeakMap<object, Runtime>();
let inFlight = 0;
const elapsed = (start: number) => Math.min(120_000, Math.max(0, Math.round(Date.now() - start)));

export function beginReadDiagnostics(signal: AbortSignal, transport: ReadDiagnostics['transport']): void {
  const mobile = Platform.OS === 'ios' || Platform.OS === 'android';
  if (requests.has(signal)) finishReadDiagnostics(signal);
  inFlight += 1;
  requests.set(signal, { startedAt: Date.now(), ...(mobile ? { runtime: mobileDiagnosticSnapshot() } : {}),
    data: { transport, stage: 'before_fetch', ...startMemberRequestEvidence(),
      ...(mobile ? { request_id: newCommandId('diag'), in_flight_start: inFlight } : {}) } });
}

export function finishReadDiagnostics(signal: AbortSignal, error?: object,
  command?: { abort_source: 'none' | 'deadline' | 'parent'; deadline_ms: number }): void {
  const entry = requests.get(signal);
  if (entry) inFlight = Math.max(0, inFlight - 1);
  if (entry?.runtime && error) {
    const current = diagnosticSessionIsCurrent(entry.runtime.session_id) ? mobileDiagnosticSnapshot() : undefined;
    failureContexts.set(error, { ...entry.runtime, request_started_at_ms: entry.startedAt,
      request_settled_at_ms: Date.now(), wall_elapsed_ms: Math.min(86_400_000, Math.max(0, Date.now() - entry.startedAt)),
      ...(current ? { ...(current.installation_id ? { installation_id: current.installation_id, installation_storage: current.installation_storage } : {}),
        screen_at_settlement: current.screen, network_type_at_settlement: current.network_type,
        network_connected_at_settlement: current.network_connected, network_reachable_at_settlement: current.network_reachable,
        network_sample_age_ms_at_settlement: current.network_sample_age_ms,
        network_changes_during_request: Number(current.network_changes) - Number(entry.runtime.network_changes),
        lifecycle_changes_during_request: Number(current.lifecycle_changes) - Number(entry.runtime.lifecycle_changes) } : { session_changed: true }) });
  }
  if (entry && error) failures.set(error, { ...entry.data,
    ...(entry.runtime ? { in_flight_end: inFlight, elapsed_capped: Date.now() - entry.startedAt > 120_000 } : {}),
    ...(command ? { abort_source: command.abort_source, deadline_ms: command.deadline_ms,
      elapsed_ms: elapsed(entry.startedAt) } : {}),
    ...(entry.data.diagnostics_version === 2 ? { app_state_failure: appStateSnapshot() } : {}) });
  requests.delete(signal);
}

export function readFailureDiagnostics(error: unknown): Readonly<ReadDiagnostics> | undefined {
  const data = error && typeof error === 'object' ? failures.get(error) : undefined;
  return data ? { ...data } : undefined;
}

export function inheritReadDiagnostics(source: unknown, target: object): void {
  const data = readFailureDiagnostics(source);
  if (data) failures.set(target, { ...data });
  const context = readDiagnosticContext(source);
  if (context) failureContexts.set(target, context);
}

export function readDiagnosticContext(error: unknown): Runtime | undefined {
  const context = error && typeof error === 'object' ? failureContexts.get(error) : undefined;
  return context ? { ...context } : undefined;
}

/** Exact allowlisted response hints, not a claim about which system caused failure. */
function responseHints(response: Response, method: string): Partial<ReadDiagnostics> {
  const hints: Partial<ReadDiagnostics> = {};
  if (Number.isInteger(response.status) && response.status >= 100 && response.status <= 599) {
    hints.response_status = response.status;
  }
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    for (const [header, field, max] of [['content-length', 'response_content_length', 50_000_000],
      ['age', 'response_age_seconds', 86_400], ['retry-after', 'retry_after_seconds', 86_400]] as const) {
      const raw = response.headers.get(header);
      if (raw && /^\d{1,8}$/.test(raw) && Number(raw) <= max) hints[field] = Number(raw);
    }
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
  // Android's RN XHR bridge does not forward OkHttp response.message(). A blank
  // reason phrase is unavailable evidence, NOT proof that this was a remote 504.
  // Leave other platforms' diagnostics unchanged. Never retain arbitrary text.
  if (Platform.OS === 'android') {
    const version = response.headers.get('x-doji-native-read-version');
    const nativeRead = ['GET', 'HEAD'].includes(method) && (version === '1' || version === '2');
    const nativePost = method === 'POST' && version === '3';
    if ((nativeRead || nativePost) && response.status === 504) {
      const source = response.headers.get('x-doji-native-response-source');
      const cacheOnly = response.headers.get('x-doji-native-request-cache-only');
      if (source && ['network', 'cache', 'local_cache_miss', 'unknown'].includes(source)) {
        hints.native_response_source = source as ReadDiagnostics['native_response_source'];
      }
      if (cacheOnly === 'true' || cacheOnly === 'false') hints.native_request_cache_only = cacheOnly === 'true';
      if (version === '2' || version === '3') {
        const protocol = response.headers.get('x-doji-native-protocol');
        if (source === 'network' && protocol && ['http/1.0', 'http/1.1', 'h2', 'h2_prior_knowledge'].includes(protocol)) {
          hints.native_protocol = protocol as ReadDiagnostics['native_protocol'];
        }
        for (const [header, field, maximum] of [
          ['x-doji-native-network-headers-ms', 'native_network_headers_ms', 120_000],
          ['x-doji-native-prior-response-count', 'native_prior_response_count', 20],
        ] as const) {
          if (field === 'native_network_headers_ms' && source !== 'network') continue;
          const value = response.headers.get(header);
          if (value && /^\d{1,6}$/.test(value) && Number(value) <= maximum) hints[field] = Number(value);
        }
      }
    }
    hints.status_text_available = typeof response.statusText === 'string' && response.statusText.length > 0;
    if (response.status === 504 && !hints.status_text_available) return hints;
  }
  hints.cache_only_signature = response.status === 504 && response.statusText === 'Unsatisfiable Request (only-if-cached)';
  return hints;
}

export async function observedMemberFetch(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const entry = init.signal ? requests.get(init.signal) : undefined;
  if (!entry) return fetch(input, init);
  const mobile = entry.data.diagnostics_version === 2;
  entry.data = { transport: entry.data.transport, stage: 'fetch', dispatch_ms: elapsed(entry.startedAt),
    ...(mobile ? { diagnostics_version: 2, app_state_start: entry.data.app_state_start,
      request_id: entry.data.request_id, in_flight_start: entry.data.in_flight_start, endpoint: safeDiagnosticEndpoint(input),
      ...(entry.data.android_api_level !== undefined ? { android_api_level: entry.data.android_api_level } : {}),
      fetch_invocations: Math.min(100, (entry.data.fetch_invocations ?? 0) + 1) } : {}) };
  const snapshot = entry.data;
  let method = '';
  try {
    method = (init.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
    if (mobile) entry.data.request_method = method === 'GET' || method === 'HEAD' || method === 'POST' ? method : 'other';
  } catch { /* malformed optional method observation must not replace fetch behavior */ }
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    entry.data.stage = 'fetch_rejected';
    if (mobile && error instanceof Error && ['Error', 'TypeError', 'AbortError', 'TimeoutError'].includes(error.name)) {
      entry.data.fetch_error_name = error.name;
    }
    throw error;
  }
  // Broken/absent response headers must not change the request's real outcome.
  entry.data.stage = 'headers';
  entry.data.headers_ms = elapsed(entry.startedAt);
  try {
    Object.assign(entry.data, responseHints(response, method));
  } catch { /* best effort */ }
  if (mobile) observeMemberResponseBody(response, data => {
    // Ignore settlement after timeout/cancellation, or an obsolete response from
    // an earlier fetch in the same read (e.g. a 401 before token refresh).
    if (init.signal && requests.get(init.signal) === entry && entry.data === snapshot) Object.assign(snapshot, data);
  });
  return response;
}
