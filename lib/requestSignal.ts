import { rpcQueryError } from './rpcQueryError';
import { awaitReadSignal } from './awaitReadSignal';
import { beginReadDiagnostics, finishReadDiagnostics } from './memberReadDiagnostics';

export type RequestAbortSource = 'parent' | 'deadline' | 'manual' | null;

export function createRequestSignal(parent?: AbortSignal, timeoutMs = 8_000) {
  const controller = new AbortController();
  let abortSource: RequestAbortSource = null;
  const abort = (source: Exclude<RequestAbortSource, null>, reason?: unknown) => {
    if (controller.signal.aborted) return;
    abortSource = source;
    controller.abort(reason);
  };
  const abortFromParent = () => abort('parent', parent?.reason);

  if (parent?.aborted) abortFromParent();
  else parent?.addEventListener('abort', abortFromParent, { once: true });

  const timer = setTimeout(() => {
    abort('deadline', new Error(`Request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  const cleanup = () => {
    clearTimeout(timer);
    parent?.removeEventListener('abort', abortFromParent);
  };

  return {
    signal: controller.signal,
    get abortSource() { return abortSource; },
    cleanup,
    cancel(reason?: unknown) {
      abort('manual', reason);
      cleanup();
    },
  };
}

type AbortableQuery<T> = {
  abortSignal(signal: AbortSignal): PromiseLike<T>;
  retry?(enabled: boolean): unknown;
};

/**
 * Executes a PostgREST query with both React Query cancellation and a hard
 * request deadline. Screens that unmount or change filters stop consuming a
 * connection instead of allowing obsolete work to finish in the background.
 */
export async function runAbortableQuery<T extends { error: unknown; status?: number }>(
  query: AbortableQuery<T>,
  parent?: AbortSignal,
  timeoutMs = 8_000,
): Promise<T> {
  const request = createRequestSignal(parent, timeoutMs);
  const startedAt = Date.now();
  beginReadDiagnostics(request.signal, 'supabase');
  let status: number | undefined;
  let responseError: unknown;
  try {
    if (request.signal.aborted) throw new Error('Request cancelled');
    // TanStack (or the explicit bootstrap policy) owns retry count and backoff.
    // PostgREST also retries GET/HEAD by default; do not multiply those attempts.
    query.retry?.(false);
    const work = Promise.resolve(query.abortSignal(request.signal)).then(response => {
      status = response.status;
      responseError = response.error;
      if (response.error) throw response.error;
      return response;
    });
    const response = await awaitReadSignal(work, request.signal);
    if (request.signal.aborted) throw new Error('Request aborted');
    return response;
  } catch (error) {
    const failure = status != null && status >= 400 && responseError ? responseError : error;
    const wrapped = Object.assign(rpcQueryError(failure, { status, abortSource: request.abortSource, timeoutMs }), {
      elapsedMs: Math.max(0, Date.now() - startedAt), timeoutMs,
    });
    finishReadDiagnostics(request.signal, wrapped);
    throw wrapped;
  } finally {
    finishReadDiagnostics(request.signal);
    request.cleanup();
  }
}
