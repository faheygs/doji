import { supabase } from './supabase';
import { createRequestSignal } from './requestSignal';
import { rpcQueryError } from './rpcQueryError';
import { awaitReadSignal } from './awaitReadSignal';
import { beginReadDiagnostics, finishReadDiagnostics, observedMemberFetch } from './memberReadDiagnostics';

const SCALE_READ_TIMEOUT_MS = 8_000;

function scaleReadUrl(): string | null {
  return process.env.EXPO_PUBLIC_SCALE_READ_URL?.trim().replace(/\/$/, '') || null;
}

/**
 * Free mode reads Postgres directly. Scale mode points the same query hooks at
 * an authenticated aggregate cache without changing screens or query keys.
 * In scale mode failures stay failures; silently falling back would recreate a
 * database stampede exactly when the gateway is protecting Postgres.
 */
export async function readThroughScaleGateway<T>(
  path: string,
  directRead: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const baseUrl = scaleReadUrl();
  if (!baseUrl) return directRead();
  const request = createRequestSignal(signal, SCALE_READ_TIMEOUT_MS);
  const startedAt = Date.now();
  beginReadDiagnostics(request.signal, 'scale_gateway');
  let response: Response;
  try {
    if (request.signal.aborted) throw new Error('Request cancelled');
    const { data: { session }, error } = await awaitReadSignal(supabase.auth.getSession(), request.signal);
    if (error || !session?.access_token) throw new Error('Authentication required');
    const read = (token: string) => {
      if (request.signal.aborted) throw new Error('Request aborted');
      return awaitReadSignal(observedMemberFetch(`${baseUrl}${path}`, {
        signal: request.signal,
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
        },
      }), request.signal);
    };
    response = await read(session.access_token);
    if (response.status === 401 && !request.signal.aborted) {
      const { data, error } = await awaitReadSignal(supabase.auth.refreshSession(), request.signal);
      const refreshedToken = data.session?.access_token;
      if (!error && refreshedToken) response = await read(refreshedToken);
    }
    if (!response.ok) throw Object.assign(new Error(`Scale read failed (${response.status})`), { status: response.status });
    // Keep the deadline/cancellation attached until the body is consumed too.
    const data = await awaitReadSignal(response.json(), request.signal) as T;
    if (request.signal.aborted) throw new Error('Request aborted');
    return data;
  } catch (error) {
    // React Native's AbortController does not provide signal.reason. Preserve
    // first-abort provenance even if the parent aborts after our deadline.
    const wrapped = Object.assign(rpcQueryError(error, {
      abortSource: request.abortSource, timeoutMs: SCALE_READ_TIMEOUT_MS,
    }), { elapsedMs: Math.max(0, Date.now() - startedAt), timeoutMs: SCALE_READ_TIMEOUT_MS });
    finishReadDiagnostics(request.signal, wrapped);
    throw wrapped;
  } finally {
    finishReadDiagnostics(request.signal);
    request.cleanup();
  }
}
