export function createRequestSignal(parent?: AbortSignal, timeoutMs = 8_000) {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parent?.reason);

  if (parent?.aborted) abortFromParent();
  else parent?.addEventListener('abort', abortFromParent, { once: true });

  const timer = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  const cleanup = () => {
    clearTimeout(timer);
    parent?.removeEventListener('abort', abortFromParent);
  };

  return {
    signal: controller.signal,
    cleanup,
    cancel(reason?: unknown) {
      controller.abort(reason);
      cleanup();
    },
  };
}

type AbortableQuery<T> = {
  abortSignal(signal: AbortSignal): PromiseLike<T>;
};

/**
 * Executes a PostgREST query with both React Query cancellation and a hard
 * request deadline. Screens that unmount or change filters stop consuming a
 * connection instead of allowing obsolete work to finish in the background.
 */
export async function runAbortableQuery<T>(
  query: AbortableQuery<T>,
  parent?: AbortSignal,
  timeoutMs = 8_000,
): Promise<T> {
  const request = createRequestSignal(parent, timeoutMs);
  try {
    return await query.abortSignal(request.signal);
  } finally {
    request.cleanup();
  }
}
