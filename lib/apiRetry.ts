type ErrorLike = {
  code?: string | number;
  status?: string | number;
  message?: string;
};

const TRANSIENT_CODES = new Set([
  '408',
  '425',
  '429',
  '500',
  '502',
  '503',
  '504',
  'PGRST000',
  'PGRST001',
  'PGRST002',
  'PGRST003',
  'PGRST504',
]);

const TRANSIENT_MESSAGE =
  /network request failed|failed to fetch|fetch failed|load failed|connection (?:lost|closed|reset)|timed?\s*out|temporarily unavailable|socket hang up/i;

/**
 * Retry reads only when the failure is plausibly transport/transient. Auth,
 * validation, RLS, uniqueness, and other deterministic failures must surface
 * immediately instead of being replayed.
 */
export function isTransientApiError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as ErrorLike;
  const code = String(candidate.status ?? candidate.code ?? '');
  if (TRANSIENT_CODES.has(code)) return true;
  // PostgreSQL SQLSTATE values (for example 23505) are numeric-looking but
  // are not HTTP status codes. Never classify them by numeric magnitude.
  const httpLike = candidate.status != null || code.length === 3;
  const numeric = httpLike ? Number(code) : Number.NaN;
  if (Number.isFinite(numeric) && (numeric === 408 || numeric === 429 || numeric >= 500)) {
    return true;
  }
  return TRANSIENT_MESSAGE.test(candidate.message ?? '');
}

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && isTransientApiError(error);
}

export function retryDelayWithJitter(attempt: number): number {
  const ceiling = Math.min(4000, 300 * 2 ** attempt);
  return Math.round(ceiling * (0.75 + Math.random() * 0.5));
}
