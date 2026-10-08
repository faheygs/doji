/** Cancellation is a local observation, never proof that a remote write rolled back. */
export class PushRegistrationInterrupted extends Error {
  readonly code = 'DOJI_PUSH_INTERRUPTED';
  constructor(readonly reason: 'background' | 'account' | 'superseded') {
    super(`Push registration deferred: ${reason}`);
    this.name = 'AbortError';
  }
}

export function isPushRegistrationInterrupted(error: unknown): boolean {
  return error instanceof PushRegistrationInterrupted ||
    (!!error && typeof error === 'object' && 'code' in error && error.code === 'DOJI_PUSH_INTERRUPTED');
}

// React Native's installed abort-controller polyfill does not retain abort(reason).
// Preserve first-abort reasons without modifying global signals.
const reasons = new WeakMap<AbortSignal, unknown>();
export function abortRegistration(controller: AbortController, reason: unknown): void {
  if (controller.signal.aborted) return;
  reasons.set(controller.signal, reason);
  controller.abort(reason);
}
export function registrationAbortReason(signal: AbortSignal): unknown {
  return reasons.get(signal) ?? signal.reason ?? new PushRegistrationInterrupted('superseded');
}
export function checkRegistrationSignal(signal?: AbortSignal): void {
  if (signal?.aborted) throw registrationAbortReason(signal);
}

/** Observe late native results, but never let them continue an obsolete registration. */
export function awaitRegistration<T>(work: PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return Promise.resolve(work);
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => { cleanup(); reject(registrationAbortReason(signal)); };
    Promise.resolve(work).then(
      value => { cleanup(); resolve(value); },
      error => { cleanup(); reject(error); },
    );
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

export function registrationDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise(resolve => { setTimeout(resolve, ms); });
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(registrationAbortReason(signal)); };
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}
