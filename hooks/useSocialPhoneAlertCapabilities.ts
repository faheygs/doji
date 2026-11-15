import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { runMemberRead } from '../lib/runMemberRead';
import { captureProfileAccount, useAuthStore } from '../stores/useAuthStore';

/** Settings-only capability read; no background polling or new app-start dependency. */
export function useSocialPhoneAlertCapabilities() {
  const viewerId = useAuthStore((state) => state.session?.user.id);
  return useQuery({
    queryKey: ['socialPhoneAlertCapabilities', viewerId],
    enabled: !!viewerId,
    queryFn: async ({ signal }) => {
      const account = captureProfileAccount();
      if (account.userId !== viewerId || !account.isCurrent()) throw new Error('Not authenticated');
      try {
        const { data } = await runMemberRead(supabase.rpc('get_social_phone_alert_capabilities_v1'), signal);
        if (!account.isCurrent()) throw new Error('Account changed');
        if (typeof data?.enabled !== 'boolean') throw new Error('Invalid notification capabilities');
        return data.enabled;
      } catch (error) {
        if (!account.isCurrent()) throw new Error('Account changed');
        // An absent additive contract is different from a failed authorized read.
        if (error && typeof error === 'object' && 'code' in error && error.code === 'PGRST202') return false;
        throw error;
      }
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnMount: 'always',
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
  });
}
