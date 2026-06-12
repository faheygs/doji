import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { UserEvent } from '../types/database';
import { canBuyIn } from '../lib/participationGate';

export function useBuyInToday(userEvent: UserEvent | null | undefined) {
  const eligible = canBuyIn(userEvent);
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('buy_in_today');
      if (error) throw error;
      return data as { user_event_id: string; sparks: number; expires_at: string };
    },
    onSuccess: async () => {
      if (userId) {
        await fetchProfile(userId);
        await queryClient.invalidateQueries({ queryKey: ['userEvent'] });
      }
    },
  });

  return { eligible, buyIn: mutation.mutateAsync, isPending: mutation.isPending };
}
