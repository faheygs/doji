import * as Sentry from '@sentry/react-native';
import { isCancelledError } from '@tanstack/react-query';
import { readFailureDiagnostics } from './memberReadDiagnostics';

type Failure = { status?: unknown; statusCode?: unknown; code?: unknown; name?: unknown; message?: unknown; abortSource?: unknown; elapsedMs?: unknown; timeoutMs?: unknown };
const seen = new WeakSet<object>();
const reportedAt = new Map<string, number>();
const WINDOW_MS = 60_000;
let windowStart = 0;
let windowCount = 0;
// Only code-owned root names may leave the device, never complete query keys.
const QUERY_ROOTS = new Set(['feed', 'lockedFeed', 'post', 'profilePost', 'profile', 'publicProfile',
  'comments', 'commentLikes', 'postReactions', 'reactions', 'pollResults', 'pollVotersDetail', 'userEvent',
  'friends', 'friendRequests', 'friendCount', 'blockedUsers', 'leaderboard', 'notifications',
  'notificationCenter', 'friendship', 'searchUsers', 'mentionSearch', 'badges', 'shop', 'shopItems', 'userShopItems', 'moderationStatus',
  'mobileReleasePolicy', 'upcomingDoji', 'appAnnouncement', 'userBadges', 'badgeCategories',
  'badgeTiers', 'userBadgeProgress', 'challengeSuggestionCounts', 'pollVotesCount', 'reactionsGiven',
  'profileFriends', 'mySuggestions', 'pendingSuggestions', 'shopCatalog', 'ownedShopItems', 'isBlocked', 'admin']);

export function queryFailureOperation(key: readonly unknown[]): string {
  return typeof key[0] === 'string' && QUERY_ROOTS.has(key[0]) ? key[0] : 'other';
}

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
    Sentry.withScope(scope => {
      scope.setTag('area', 'api');
      scope.setTag('operation', `${area}.${operation}`);
      scope.setTag('failure_kind', details.kind);
      scope.setContext('api', { ...apiAttemptDetails(error), ...retry });
      scope.setFingerprint(['api', area, operation, details.kind, String(details.code ?? details.status ?? '')]);
      // Do not capture the raw exception: database messages may contain member content.
      Sentry.captureException(new Error(`Doji ${area}.${operation} failed (${details.kind})`));
    });
  } catch {
    // Monitoring is never allowed to change command outcomes or break query settlement.
  }
}

type BeforeSend = NonNullable<NonNullable<Parameters<typeof Sentry.init>[0]>['beforeSend']>;
/** Drop ambient request/breadcrumb/identity data from the new handled-failure events. */
export const sanitizeApiFailureEvent: BeforeSend = event => {
  if (event.tags?.area !== 'api') return event;
  event.breadcrumbs = [];
  delete event.request;
  delete event.user;
  delete event.extra;
  event.contexts = { api: event.contexts?.api };
  return event;
};
