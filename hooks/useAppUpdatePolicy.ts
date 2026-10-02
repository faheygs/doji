import { useQuery } from '@tanstack/react-query';
import { Platform } from 'react-native';
import type { MobilePlatform, MobileReleasePolicy } from '../lib/appUpdate';
import { runMemberRead } from '../lib/runMemberRead';
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
      const { data } = await runMemberRead(
        supabase.rpc('get_mobile_release_policy', { p_platform: platform }), signal, 6_000,
      );
      return data?.[0] ?? null;
    },
    enabled: enabled && platform !== null,
    staleTime: SIX_HOURS_MS,
    gcTime: 24 * 60 * 60 * 1_000,
    refetchOnMount: 'always',
  });
}
