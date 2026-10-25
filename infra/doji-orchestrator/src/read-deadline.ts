/** A read budget covers promise settlement as well as fetch cancellation. */
export function readDeadline(timeoutMs: number) {
  const controller = new AbortController();
  const failure = new Error('Read deadline exceeded');
  failure.name = 'TimeoutError';
  let expired = false;
  let rejectDeadline!: (error: Error) => void;
  const deadline = new Promise<never>((_resolve, reject) => { rejectDeadline = reject; });
  // A caller may finish before it starts another wait.
  void deadline.catch(() => undefined);
  const timer = setTimeout(() => {
    expired = true;
    rejectDeadline(failure);
    controller.abort(failure);
  }, timeoutMs);
  return {
    signal: controller.signal,
    get expired() { return expired; },
    wait<T>(work: PromiseLike<T>): Promise<T> {
      return Promise.race([work, deadline]);
    },
    cleanup() { clearTimeout(timer); },
  };
}
