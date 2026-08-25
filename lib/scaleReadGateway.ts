import { supabase } from './supabase';

const scaleReadUrl = process.env.EXPO_PUBLIC_SCALE_READ_URL?.replace(/\/$/, '');
const SCALE_READ_TIMEOUT_MS = 8_000;

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
  if (!scaleReadUrl) return directRead();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Authentication required');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, SCALE_READ_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${scaleReadUrl}${path}`, {
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${session.access_token}`,
        accept: 'application/json',
      },
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
  if (!response.ok) throw new Error(`Scale read failed (${response.status})`);
  return response.json() as Promise<T>;
}
