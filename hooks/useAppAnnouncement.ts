import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';

export type AppAnnouncement = {
  id: string;
  title: string;
  body: string;
  cta_label: string | null;
  cta_url: string | null;
};

export function useAppAnnouncement(enabled: boolean) {
  const userId = useAuthStore((state) => state.session?.user?.id);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['appAnnouncement', userId],
    queryFn: async (): Promise<AppAnnouncement | null> => {
      const { data, error } = await (supabase as any).rpc('claim_active_app_announcement');
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : null) as AppAnnouncement | null;
    },
    enabled: enabled && !!userId,
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
  const action = useMutation({
    mutationFn: async (args: { id: string; action: 'dismissed' | 'cta' }) => {
      const { error } = await (supabase as any).rpc('record_app_announcement_action', {
        p_announcement_id: args.id,
        p_action: args.action,
      });
      if (error) throw error;
    },
    onSuccess: () => client.setQueryData(['appAnnouncement', userId], null),
  });
  return { ...query, recordAction: action.mutateAsync };
}
