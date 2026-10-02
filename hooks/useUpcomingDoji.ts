import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { syncServerClock } from '../lib/serverClock';
import { useAuthStore } from '../stores/useAuthStore';
import { runMemberRead } from '../lib/runMemberRead';

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
      const { data } = await runMemberRead(supabase.rpc('get_upcoming_doji_state'), signal, 6_000);
      if (!data) return null;
      syncServerClock(data.server_now);
      return data;
    },
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}
