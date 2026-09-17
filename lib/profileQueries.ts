import { readThroughScaleGateway } from './scaleReadGateway';
import { runAbortableQuery } from './requestSignal';
import { supabase } from './supabase';

export async function fetchPublicProfileView(
  normalizedUsername: string,
  signal?: AbortSignal,
): Promise<unknown> {
  return readThroughScaleGateway<unknown>(
    `/v1/profiles/${encodeURIComponent(normalizedUsername)}`,
    async () => {
      const { data, error } = await runAbortableQuery(
        supabase.rpc('get_public_profile_view', { p_username: normalizedUsername }),
        signal,
      );
      if (error) {
        if (__DEV__) console.warn('[useProfile]', error.message);
        throw error;
      }
      return data;
    },
    signal,
  );
}
