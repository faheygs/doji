import { AppState, Platform } from 'react-native';

type AppSnapshot = 'active' | 'background' | 'inactive' | 'unknown';
export type AndroidReadEvidence = {
  diagnostics_version?: 2;
  app_state_start?: AppSnapshot;
  app_state_failure?: AppSnapshot;
  android_api_level?: number;
  fetch_invocations?: number;
  request_method?: 'GET' | 'HEAD' | 'POST' | 'other';
  body_state?: 'unread' | 'reading' | 'complete' | 'rejected' | 'unavailable';
  body_read_ms?: number;
};

export function appStateSnapshot(): AppSnapshot {
  try {
    const state = AppState.currentState;
    return state === 'active' || state === 'background' || state === 'inactive' ? state : 'unknown';
  } catch { return 'unknown'; }
}

export function startAndroidReadEvidence(): AndroidReadEvidence {
  if (Platform.OS !== 'android') return {};
  const data: AndroidReadEvidence = { diagnostics_version: 2, app_state_start: appStateSnapshot(), fetch_invocations: 0 };
  try {
    const api = Platform.Version;
    if (typeof api === 'number' && Number.isInteger(api) && api > 0 && api <= 1000) data.android_api_level = api;
  } catch { /* no guessed device metadata */ }
  return data;
}

/** Shared JS evidence; native Android hints remain platform-specific. */
export function startMemberRequestEvidence(): AndroidReadEvidence {
  if (Platform.OS === 'android') return startAndroidReadEvidence();
  return Platform.OS === 'ios'
    ? { diagnostics_version: 2, app_state_start: appStateSnapshot(), fetch_invocations: 0 }
    : {};
}

/** Observe only the existing caller's consumption, never read/clone a body for logging.
 * Keep response identity, native method receiver, value/error and cancellation intact.
 * A non-extensible response is usable without this optional observation.
 */
export function observeMemberResponseBody(response: Response, update: (data: AndroidReadEvidence) => void): void {
  const record = (data: AndroidReadEvidence) => { try { update(data); } catch { /* telemetry is optional */ } };
  record({ body_state: 'unread' });
  try {
    // Stage both descriptors before touching the response. Only these two methods
    // are consumed by the installed PostgREST/scale readers; streams/clones aren't observed.
    const descriptors: PropertyDescriptorMap = {};
    for (const method of ['text', 'json'] as const) {
      const original = response[method];
      if (typeof original !== 'function') continue;
      const own = Object.getOwnPropertyDescriptor(response, method);
      if (!Object.isExtensible(response) || own?.configurable === false) {
        record({ body_state: 'unavailable' }); return;
      }
      descriptors[method] = { configurable: true, writable: true, value: function (this: Response) {
        // A borrowed method must retain its original behavior, not consume our response.
        if (this !== response) return original.call(this);
        const started = Date.now();
        record({ body_state: 'reading' });
        const settle = (body_state: 'complete' | 'rejected') => record({ body_state,
          body_read_ms: Math.min(120_000, Math.max(0, Math.round(Date.now() - started))) });
        try {
          return original.call(response).then(value => { settle('complete'); return value; },
            error => { settle('rejected'); throw error; });
        } catch (error) { settle('rejected'); throw error; }
      } };
    }
    if (!Object.keys(descriptors).length) { record({ body_state: 'unavailable' }); return; }
    Object.defineProperties(response, descriptors);
  } catch { record({ body_state: 'unavailable' }); }
}

type FailureEvidence = AndroidReadEvidence & {
  kind?: string;
  status?: number; response_status?: number; abort_source?: string; stage?: string;
  native_response_source?: string;
};

/** Facts about the observed boundary, NOT a provider/root-cause verdict. */
export function summarizeMemberRequestFailure(data: FailureEvidence) {
  const status = data.response_status ?? data.status;
  const httpError = typeof status === 'number' && status >= 400 && status <= 599;
  const evidence = httpError ? data.native_response_source === 'local_cache_miss' ? 'local_cache_miss'
    : data.native_response_source === 'network' ? 'network_http_response'
      : data.native_response_source === 'cache' ? 'cached_http_response' : 'http_response_origin_unknown'
    : data.abort_source === 'deadline' ? 'client_deadline'
      : data.stage === 'fetch_rejected' ? 'fetch_rejected' : 'unclassified';
  const phase = data.body_state === 'reading' ? 'body_read'
    : data.body_state === 'rejected' ? 'body_read_rejected'
      : data.body_state === 'complete' ? 'after_body'
        : data.stage === 'headers' ? 'after_headers'
          : data.stage === 'fetch' || data.stage === 'fetch_rejected' ? 'fetch'
            : data.stage === 'before_fetch' ? 'before_fetch' : 'unknown';
  const labels = { local_cache_miss: 'Android cache-only miss', network_http_response: 'network HTTP response',
    cached_http_response: 'cached HTTP response', http_response_origin_unknown: 'HTTP response; origin unknown',
    client_deadline: 'client deadline reached', fetch_rejected: 'fetch rejected; cause unknown', unclassified: 'cause unknown' };
  return { failure_evidence: evidence, failure_phase: phase,
    summary: `${labels[evidence]}${httpError ? ` ${status}` : ''}; phase=${phase}` };
}

// Compatibility for existing native probe and Android-only regression callers.
export const observeAndroidReadBody = observeMemberResponseBody;
export const summarizeAndroidReadFailure = summarizeMemberRequestFailure;
