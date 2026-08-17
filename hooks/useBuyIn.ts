import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { UserEvent } from '../types/database';
import { canBuyIn } from '../lib/participationGate';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';

export function useBuyInToday(userEvent: UserEvent | null | undefined) {
  const eligible = canBuyIn(userEvent);
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('buy_in_today');
      if (error) throw error;
      return data as { user_event_id: string; sparks: number; expires_at: string | null };
    },
    onSuccess: (data) => {
      if (!userId) return;

      const key = ['userEvent', 'today', userId] as const;
      queryClient.setQueryData<UserEvent | null>(key, (current) => current ? {
        ...current,
        status: 'buy_in_open',
        buy_in_at: new Date().toISOString(),
      } : current);

      const { profile, setProfile } = useAuthStore.getState();
      if (profile) setProfile({ ...profile, sparks: data.sparks });

      scheduleQueryInvalidation(queryClient, ['userEvent', 'profile', 'leaderboard']);
      void fetchProfile(userId);
    },
  });

  return { eligible, buyIn: mutation.mutateAsync, isPending: mutation.isPending };
}
