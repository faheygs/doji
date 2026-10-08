import * as Sentry from '@sentry/react-native';
import { notePushRegistrationIncident } from './pushRegistrationRecovery';
import { Platform } from 'react-native';
import { isCancelledError } from '@tanstack/react-query';
import { readDiagnosticContext, readFailureDiagnostics } from './memberReadDiagnostics';
import { summarizeMemberRequestFailure } from './androidReadEvidence';
import { androidTestLabStatus } from './androidTestEnvironment';
import { diagnosticSessionIsCurrent, diagnosticTimeline, mobileDiagnosticSnapshot,
  recordDiagnosticOutcome, safeNativeDiagnosticContexts } from './mobileDiagnosticContext';
export { queryFailureOperation } from './diagnosticOperations';

type Failure = { status?: unknown; statusCode?: unknown; code?: unknown; name?: unknown; message?: unknown; abortSource?: unknown; elapsedMs?: unknown; timeoutMs?: unknown };
const seen = new WeakSet<object>();
const reportedAt = new Map<string, number>();
const WINDOW_MS = 60_000;
let windowStart = 0;
let windowCount = 0;

/** Classify locally; raw server messages, IDs, arguments and SQL details never leave here. */
export function apiFailureDetails(error: unknown) {
  const value = error && typeof error === 'object' ? error as Failure : {};
  const rawStatus = Number(value.status ?? value.statusCode);
  const status = Number.isInteger(rawStatus) && rawStatus >= 100 && rawStatus <= 599 ? rawStatus : undefined;
  const code = typeof value.code === 'string' && /^(?:[0-9A-Z]{5}|PGRST\d{3}|DOJI_COMMAND_ERROR)$/.test(value.code)
    ? value.code : undefined;
  const message = typeof value.message === 'string' ? value.message : '';
  let kind = 'unexpected';
  if (isCancelledError(error) || value.name === 'AbortError') kind = 'cancelled';
  else if (status === 401 || status === 403 || code === '42501' || code === 'PGRST301' ||
    /^(?:Authentication required|Not authenticated|Invalid access token)$/i.test(message)) kind = 'authorization';
  else if (status === 429) kind = 'rate_limit';
  else if (code === 'P0001' || code === '23505' || (status != null && status >= 400 && status < 500 && status !== 408)) kind = 'rejected';
  else if (code === '57014' || status === 408 || status === 504 || value.name === 'TimeoutError' || /timed?\s*out/i.test(message)) kind = 'timeout';
  else if (status != null && status >= 500) kind = 'server';
  else if (/network request failed|failed to fetch|fetch failed|network.*(?:lost|unreachable)|connection (?:lost|closed)/i.test(message)) kind = 'network';
  else if (code) kind = 'database';
  return { kind, status, code };
}

// Bounded type information helps distinguish JS exceptions from API envelopes
// without transmitting arbitrary error names, messages or complete query keys.
function safeErrorType(error: unknown): string {
  if (!error || typeof error !== 'object') return 'non_error';
  const name = (error as Failure).name;
  return typeof name === 'string' && ['Error', 'TypeError', 'ReferenceError', 'SyntaxError',
    'RangeError', 'TimeoutError', 'AbortError'].includes(name) ? name : 'api_object';
}

function safeRequestDetails(error: unknown) {
  const value = error && typeof error === 'object' ? error as Failure : {};
  return {
    ...(typeof value.abortSource === 'string' && ['none', 'parent', 'deadline', 'manual'].includes(value.abortSource)
      ? { abort_source: value.abortSource } : {}),
    // PostgREST status 0 means no HTTP response, not an HTTP server error.
    ...(value.status === 0 ? { response_received: false } : {}),
    ...(typeof value.elapsedMs === 'number' && Number.isFinite(value.elapsedMs) && value.elapsedMs >= 0
      ? { elapsed_ms: Math.min(120_000, Math.round(value.elapsedMs)) } : {}),
    ...(typeof value.timeoutMs === 'number' && Number.isFinite(value.timeoutMs) && value.timeoutMs > 0
      ? { deadline_ms: Math.min(120_000, Math.round(value.timeoutMs)) } : {}),
  };
}

/** Snapshot only code-owned/validated fields, never an error or query object. */
export function apiAttemptDetails(error: unknown) {
  try {
    return { ...apiFailureDetails(error), error_type: safeErrorType(error),
      ...safeRequestDetails(error), ...readFailureDiagnostics(error) };
  } catch {
    return { kind: 'unexpected', error_type: 'unavailable' };
  }
}

export type ApiRetryDiagnostics = {
  attempt_count: number;
  fetch_elapsed_ms: number;
  attempts: ReturnType<typeof apiAttemptDetails>[];
};

/** QueryCache runs once per failed fetch, after retry, not once per mounted observer. */
export function reportApiFailure(area: 'query' | 'command' | 'mutation', operation: string, error: unknown, retry?: ApiRetryDiagnostics): void {
  try {
    if (error && typeof error === 'object') {
      if (seen.has(error)) return;
      seen.add(error);
    }
    const details = apiFailureDetails(error);
    const requestContext = readDiagnosticContext(error);
    // An old account's delayed request must not acquire the new account's timeline.
    const currentSession = !requestContext || diagnosticSessionIsCurrent(requestContext.session_id);
    if (currentSession) recordDiagnosticOutcome(operation, details.kind === 'cancelled' ? 'cancelled' : 'failed', retry?.attempt_count ?? 1);
    if (details.kind === 'cancelled') return;
    Sentry.addBreadcrumb({ category: `api.${area}`, level: 'warning', message: operation, data: details });
    if (__DEV__ || ['authorization', 'rejected', 'rate_limit', 'network'].includes(details.kind)) return;
    const now = Date.now();
    const key = `${area}:${operation}:${details.kind}:${details.code ?? details.status ?? ''}`;
    if (now - (reportedAt.get(key) ?? -Infinity) < WINDOW_MS) return;
    if (now - windowStart >= WINDOW_MS) { windowStart = now; windowCount = 0; }
    if (windowCount >= 10) return;
    for (const [oldKey, at] of reportedAt) if (now - at >= WINDOW_MS) reportedAt.delete(oldKey);
    reportedAt.set(key, now);
    windowCount += 1;
    // Mobile incidents must survive Sentry's default contexts depth of three.
    // contexts.api.attempts[].fields is too deep and becomes '[Object]'. Keep
    // first-attempt fields one level shallower; terminal fields remain at api.*.
    // Do not increase global normalization depth or change web reporting.
    const mobile = Platform.OS === 'android' || Platform.OS === 'ios';
    const retryContext = retry && mobile ? {
      attempt_count: retry.attempt_count,
      fetch_elapsed_ms: retry.fetch_elapsed_ms,
      ...(retry.attempts.length > 1 ? { first_attempt: retry.attempts[0] } : {}),
    } : retry;
    const terminal = apiAttemptDetails(error);
    const diagnosis = mobile && (area === 'query' ||
      (area === 'command' && 'diagnostics_version' in terminal && terminal.diagnostics_version === 2))
      ? summarizeMemberRequestFailure(terminal) : undefined;
    Sentry.withScope(scope => {
      scope.setTag('area', 'api');
      scope.setTag('operation', `${area}.${operation}`);
      scope.setTag('failure_kind', details.kind);
      if (diagnosis) {
        scope.setTag('failure_evidence', diagnosis.failure_evidence);
        scope.setTag('failure_phase', diagnosis.failure_phase);
      }
      scope.setContext('api', { ...terminal, ...retryContext, ...diagnosis });
      if (mobile) {
        const runtime = requestContext ?? mobileDiagnosticSnapshot();
        scope.setContext('diagnostic', { ...runtime, context_origin: requestContext ? 'request_start' : 'report_time_unattributed' });
        if (runtime.installation_id) scope.setTag('diagnostic_installation', String(runtime.installation_id));
        if (runtime.session_id) scope.setTag('diagnostic_session', String(runtime.session_id));
        // Separate shallow contexts survive default normalization without raw breadcrumbs.
        for (const [index, item] of (currentSession ? diagnosticTimeline() : []).entries()) {
          scope.setContext(`diagnostic_step_${index}`, { at: item.timestamp, category: item.category, ...item.data });
        }
      }
      scope.setFingerprint(['api', area, operation, details.kind, String(details.code ?? details.status ?? '')]);
      // Do not capture the raw exception: database messages may contain member content.
      const id = Sentry.captureException(new Error(`Doji ${area}.${operation} failed (${details.kind}${diagnosis ? `; ${diagnosis.summary}` : ''})`));
      if (area === 'command' && mobile && currentSession) {
        notePushRegistrationIncident(operation, id, (requestContext ?? mobileDiagnosticSnapshot()).session_id);
      }
    });
  } catch {
    // Monitoring is never allowed to change command outcomes or break query settlement.
  }
}

type BeforeSend = NonNullable<NonNullable<Parameters<typeof Sentry.init>[0]>['beforeSend']>;
/** Retain only purpose-built diagnostic context and allowlisted native facts on API events. */
export const sanitizeApiFailureEvent: BeforeSend = event => {
  const testLab = androidTestLabStatus();
  if (testLab !== undefined) event.tags = { ...event.tags, firebase_test_lab: testLab };
  if (event.tags?.area !== 'api') {
    // Other JS errors get processing-time context, never mislabeled request evidence.
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      const runtime = mobileDiagnosticSnapshot();
      event.contexts = { ...event.contexts, diagnostic: { ...runtime, context_origin: 'event_processing_unattributed' } };
      for (const [index, item] of diagnosticTimeline().entries()) {
        event.contexts[`diagnostic_step_${index}`] = { at: item.timestamp, category: item.category, ...item.data };
      }
    }
    return event;
  }
  event.breadcrumbs = [];
  delete event.request;
  delete event.user;
  delete event.extra;
  const context = event.contexts ?? {};
  event.contexts = { api: context.api, ...safeNativeDiagnosticContexts(context),
    ...(context.diagnostic ? { diagnostic: context.diagnostic } : {}) };
  for (let index = 0; index < 24; index++) {
    const key = `diagnostic_step_${index}`;
    if (context[key]) event.contexts[key] = context[key];
  }
  return event;
};
