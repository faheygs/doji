import { supabase } from './supabase';

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
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Authentication required');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, SCALE_READ_TIMEOUT_MS);
  let response: Response;
  try {
    const read = (token: string) =>
      fetch(`${baseUrl}${path}`, {
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
        },
      });
    response = await read(session.access_token);
    if (response.status === 401 && !controller.signal.aborted) {
      const { data, error } = await supabase.auth.refreshSession();
      const refreshedToken = data.session?.access_token;
      if (!error && refreshedToken) response = await read(refreshedToken);
    }
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
  if (!response.ok) throw new Error(`Scale read failed (${response.status})`);
  return response.json() as Promise<T>;
}
