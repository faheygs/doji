import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { syncServerClock } from '../lib/serverClock';
import { useAuthStore } from '../stores/useAuthStore';
import { createRequestSignal } from '../lib/requestSignal';

export type UpcomingDojiState = {
  server_now: string;
  daily_event_id: string;
  prelive_at: string;
  fires_at: string;
};

/** Safe pre-live state. The challenge itself remains private until activation. */
export function useUpcomingDoji() {
  const userId = useAuthStore((state) => state.session?.user.id);

  return useQuery({
    queryKey: ['upcomingDoji', userId] as const,
    queryFn: async ({ signal }): Promise<UpcomingDojiState | null> => {
      const request = createRequestSignal(signal, 6_000);
      try {
        const { data, error } = await supabase
          .rpc('get_upcoming_doji_state')
          .abortSignal(request.signal);
        if (error) throw error;
        if (!data) return null;
        syncServerClock(data.server_now);
        return data;
      } finally {
        request.cleanup();
      }
    },
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}
