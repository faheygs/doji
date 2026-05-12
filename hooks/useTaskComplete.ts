import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';

type TaskArgs = {
  userEventId: string;
  photoUrl?: string | null;
  caption?: string;
};

export function useTaskComplete() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);

  return useMutation({
    mutationFn: async ({ userEventId, photoUrl, caption }: TaskArgs) => {
      if (!userId) throw new Error('Not authenticated');

      const { error: postErr } = await supabase.from('posts').insert({
        user_event_id: userEventId,
        user_id: userId,
        type: 'task_complete',
        photo_url: photoUrl ?? null,
        caption: caption ?? null,
        is_late: false,
        visibility: 'public',
      });
      if (postErr) throw postErr;

      const { error: ueErr } = await supabase
        .from('user_events')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', userEventId);
      if (ueErr) throw ueErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['userEvent'] });
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
    },
  });
}
