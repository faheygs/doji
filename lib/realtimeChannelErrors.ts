type ErrorLike = {
  cause?: unknown;
  errorReason?: unknown;
  message?: unknown;
  reason?: unknown;
};

/** Detect the provider's exact-channel capability rejection through wrapped errors. */
export function isRealtimeCapabilityDenied(error: unknown): boolean {
  const pending: unknown[] = [error];
  const seen = new Set<unknown>();

  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    const message =
      current instanceof Error
        ? current.message
        : typeof current === 'object' && typeof (current as ErrorLike).message === 'string'
          ? String((current as ErrorLike).message)
          : '';
    const normalized = message.toLowerCase();
    if (normalized.includes('denied access based on given capability')) return true;

    if (typeof current !== 'object') continue;
    const nested = current as ErrorLike;
    pending.push(nested.cause, nested.errorReason, nested.reason);
  }

  return false;
}
