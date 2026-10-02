/** Stop observing a read even while the SDK is waiting for auth or a response body.
 * The underlying operation must receive the same signal. This does not cancel
 * auth itself, revoke a session, or imply that a server-side write was rolled back.
 */
export function awaitReadSignal<T>(work: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => { cleanup(); reject(new Error('Read aborted')); };
    // Attach both handlers even on pre-abort so a late rejection is consumed.
    Promise.resolve(work).then(
      value => { cleanup(); resolve(value); },
      error => { cleanup(); reject(error); },
    );
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}
