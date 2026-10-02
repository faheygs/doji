import type { RequestAbortSource } from './requestSignal';
import { inheritReadDiagnostics } from './memberReadDiagnostics';

type RpcError = { message?: unknown; name?: unknown; code?: unknown; status?: unknown; elapsedMs?: unknown; timeoutMs?: unknown };

/** Preserve response status locally; never attach SQL details, hints or request arguments. */
export function rpcQueryError(
  error: unknown,
  context: { status?: number; abortSource?: RequestAbortSource; timeoutMs?: number } = {},
): Error {
  const value = error && typeof error === 'object' ? error as RpcError : {};
  const status = context.status ?? value.status;
  const hasStatus = typeof status === 'number' && Number.isInteger(status) &&
    (status === 0 || (status >= 100 && status <= 599));
  // An actual HTTP rejection is not a lifecycle cancellation just because a
  // signal was also aborted. SDK transport failures typically have status 0.
  const httpFailure = hasStatus && status >= 400;
  const source = httpFailure ? null : context.abortSource;
  const result = new Error(typeof value.message === 'string' ? value.message : 'RPC query failed');
  // An unproven SDK AbortError must not be silently suppressed as user cancellation.
  result.name = typeof value.name === 'string' && value.name !== 'AbortError' ? value.name : 'Error';
  if (source === 'deadline') {
    result.name = 'TimeoutError';
    result.message = context.timeoutMs == null ? 'Request timed out' : `Request timed out after ${context.timeoutMs}ms`;
  } else if (source === 'parent' || source === 'manual') {
    result.name = 'AbortError';
    result.message = 'Request cancelled';
  }
  inheritReadDiagnostics(error, result);
  return Object.assign(result, {
    ...(hasStatus ? { status } : {}),
    ...(typeof value.code === 'string' && source !== 'parent' && source !== 'manual' ? { code: value.code } : {}),
    ...(context.abortSource !== undefined ? { abortSource: context.abortSource ?? 'none' } : {}),
    ...(typeof value.elapsedMs === 'number' && Number.isFinite(value.elapsedMs) && value.elapsedMs >= 0
      ? { elapsedMs: value.elapsedMs } : {}),
    ...(typeof value.timeoutMs === 'number' && Number.isFinite(value.timeoutMs) && value.timeoutMs > 0
      ? { timeoutMs: value.timeoutMs } : {}),
  });
}
