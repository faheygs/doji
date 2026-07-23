import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { Report } from '../types/database';

export type { Report };

export function usePendingReports(enabled = true) {
  const isAdmin = useAuthStore((s) => s.profile?.is_admin);

  return useQuery<Report[]>({
    queryKey: ['admin', 'reports', 'pending'],
    queryFn: async (): Promise<Report[]> => {
      const { data, error } = await supabase
        .from('reports')
        .select(
          `*,
          reporter:profiles!reports_reporter_fkey(username, display_name, avatar_url),
          reported_user:profiles!reports_reported_fkey(username, display_name, avatar_url),
          post:posts!reports_post_fkey(caption, photo_url),
          comment:comments!reports_comment_fkey(body),
          poll_vote:poll_votes!reports_poll_vote_id_fkey(custom_text)`,
        )
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as Report[];
    },
    enabled: !!isAdmin && enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export type ModerateAction = 'dismiss' | 'remove_content' | 'remove_and_ban';

export function useModerateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reportId,
      action,
      postId,
      commentId,
      reportedUserId,
    }: {
      reportId: string;
      action: ModerateAction;
      postId?: string | null;
      commentId?: string | null;
      reportedUserId?: string | null;
    }) => {
      if (action === 'remove_content' || action === 'remove_and_ban') {
        const deletePost = postId
          ? supabase.from('posts').delete().eq('id', postId)
          : Promise.resolve({ error: null });

        const deleteComment = commentId
          ? supabase.from('comments').delete().eq('id', commentId)
          : Promise.resolve({ error: null });

        const banUser =
          action === 'remove_and_ban' && reportedUserId
            ? supabase.from('profiles').update({ is_banned: true }).eq('id', reportedUserId)
            : Promise.resolve({ error: null });

        const [postResult, commentResult, banResult] = await Promise.all([deletePost, deleteComment, banUser]);
        if (postResult.error) throw postResult.error;
        if (commentResult.error) throw commentResult.error;
        if (banResult.error) throw banResult.error;
      }

      const { error } = await supabase
        .from('reports')
        .update({ status: action === 'dismiss' ? 'dismissed' : 'actioned' })
        .eq('id', reportId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}
