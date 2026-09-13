import { useQuery } from '@tanstack/react-query';
import { Platform } from 'react-native';
import type { MobilePlatform, MobileReleasePolicy } from '../lib/appUpdate';
import { createRequestSignal } from '../lib/requestSignal';
import { supabase } from '../lib/supabase';

const SIX_HOURS_MS = 6 * 60 * 60 * 1_000;

function nativePlatform(): MobilePlatform | null {
  if (Platform.OS === 'ios' || Platform.OS === 'android') return Platform.OS;
  return null;
}

export function useAppUpdatePolicy(enabled: boolean) {
  const platform = nativePlatform();
  return useQuery({
    queryKey: ['mobileReleasePolicy', platform] as const,
    queryFn: async ({ signal }): Promise<MobileReleasePolicy | null> => {
      if (!platform) return null;
      const request = createRequestSignal(signal, 6_000);
      try {
        const { data, error } = await supabase
          .rpc('get_mobile_release_policy', { p_platform: platform })
          .abortSignal(request.signal);
        if (error) throw error;
        return data?.[0] ?? null;
      } finally {
        request.cleanup();
      }
    },
    enabled: enabled && platform !== null,
    staleTime: SIX_HOURS_MS,
    gcTime: 24 * 60 * 60 * 1_000,
    refetchOnMount: 'always',
  });
}
