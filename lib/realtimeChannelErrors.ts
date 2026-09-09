type ErrorLike = {
  code?: unknown;
  cause?: unknown;
  errorReason?: unknown;
  message?: unknown;
  reason?: unknown;
  statusCode?: unknown;
};

function nestedRealtimeErrors(error: unknown): unknown[] {
  const pending: unknown[] = [error];
  const found: unknown[] = [];
  const seen = new Set<unknown>();

  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    found.push(current);

    if (typeof current !== 'object') continue;
    const nested = current as ErrorLike;
    pending.push(nested.cause, nested.errorReason, nested.reason);
  }

  return found;
}

/** Detect the provider's exact-channel capability rejection through wrapped errors. */
export function isRealtimeCapabilityDenied(error: unknown): boolean {
  for (const current of nestedRealtimeErrors(error)) {
    const message =
      current instanceof Error
        ? current.message
        : typeof current === 'object' && typeof (current as ErrorLike).message === 'string'
          ? String((current as ErrorLike).message)
          : '';
    const normalized = message.toLowerCase();
    if (normalized.includes('denied access based on given capability')) return true;
  }

  return false;
}

/**
 * Mobile radios regularly disappear or change networks. Those failures are
 * recoverable transport state, not application incidents; resilient subscriptions
 * and foreground reconciliation restore the authoritative Postgres-backed reads.
 */
export function isRealtimeTransportUnavailable(error: unknown): boolean {
  const transientMessages = [
    'connection to server unavailable',
    'connection to server temporarily unavailable',
    'network unreachable',
    'no more fallback hosts to try',
  ];

  return nestedRealtimeErrors(error).some((current) => {
    const value = typeof current === 'object' ? (current as ErrorLike) : undefined;
    const code = typeof value?.code === 'number' ? value.code : undefined;
    if (code === 80001 || code === 80002 || code === 80003) return true;

    const message =
      current instanceof Error
        ? current.message
        : typeof value?.message === 'string'
          ? value.message
          : typeof current === 'string'
            ? current
            : '';
    const normalized = message.toLowerCase();
    return transientMessages.some((fragment) => normalized.includes(fragment));
  });
}
