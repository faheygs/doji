import { observedMemberFetch } from './memberReadDiagnostics';

const SUPABASE_REQUEST_TIMEOUT_MS = 15_000;

/** Reads supply a deadline spanning auth, transport and body consumption.
 * Pass that signal through unchanged: detaching it at response headers used to
 * leave PostgREST's subsequent body read disconnected from cancellation.
 * Requests without a caller signal keep the existing transport timeout.
 */
export async function boundedSupabaseFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  if (init.signal) {
    // Supabase obtains the token before invoking custom fetch. A read may have
    // already expired while waiting; never dispatch it after the lock releases.
    if (init.signal.aborted) throw Object.assign(new Error('Request cancelled'), { name: 'AbortError' });
    return observedMemberFetch(input, init);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
