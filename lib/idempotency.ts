let commandSequence = 0;
const inFlightCommands = new Map<string, Promise<unknown>>();

// A command ID is a uniqueness key, not a credential. Keep generation in pure
// JavaScript so adding idempotent mutations never requires rebuilding the native
// app. Timestamp + per-runtime entropy + a monotonic counter prevents collisions
// across devices, sessions, and multiple commands in the same millisecond.
const runtimeEntropy = [
  Date.now().toString(36),
  Math.random().toString(36).slice(2),
  Math.random().toString(36).slice(2),
].join('-');

export function newCommandId(prefix: string): string {
  commandSequence = (commandSequence + 1) % Number.MAX_SAFE_INTEGER;
  const timestamp = Date.now().toString(36);
  const random = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${runtimeEntropy}:${timestamp}:${commandSequence.toString(36)}:${random}`;
}

/**
 * A Doji occurrence is itself the idempotency boundary. Retrying the same
 * occurrence must reuse one logical command instead of creating a new command.
 */
export function occurrenceCommandId(prefix: string, userEventId: string): string {
  return `${prefix}:occurrence:${userEventId}`;
}

/** Share one network operation across duplicate taps/renders for a command. */
export function runSingleFlight<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const existing = inFlightCommands.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  let current: Promise<T>;
  current = Promise.resolve()
    .then(operation)
    .finally(() => {
      if (inFlightCommands.get(key) === current) inFlightCommands.delete(key);
    });
  inFlightCommands.set(key, current);
  return current;
}
