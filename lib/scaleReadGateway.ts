import { supabase } from './supabase';

const scaleReadUrl = process.env.EXPO_PUBLIC_SCALE_READ_URL?.replace(/\/$/, '');

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
  const response = await fetch(`${scaleReadUrl}${path}`, {
    signal,
    headers: {
      authorization: `Bearer ${session.access_token}`,
      accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`Scale read failed (${response.status})`);
  return response.json() as Promise<T>;
}
