import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { Comment } from '../types/database';

const COMMENT_SELECT = '*, profile:profiles(username, display_name, avatar_url)';

export type CommentWithMeta = Comment;

async function fetchCommentsForPost(postId: string, userId: string | undefined): Promise<CommentWithMeta[]> {
  const { data, error } = await supabase
    .from('comments')
    .select(COMMENT_SELECT)
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  const rows = (data ?? []) as CommentWithMeta[];
  const ids = rows.map((r) => r.id);
  if (!userId || ids.length === 0) {
    return rows.map((r) => ({ ...r, my_like: false }));
  }

  const { data: likes, error: likesErr } = await supabase
    .from('comment_likes')
    .select('comment_id')
    .eq('user_id', userId)
    .in('comment_id', ids);

  if (likesErr) throw likesErr;
  const liked = new Set((likes ?? []).map((l: { comment_id: string }) => l.comment_id));
  return rows.map((r) => ({ ...r, my_like: liked.has(r.id) }));
}

export function useComments(postId: string | undefined, options?: { fetchEnabled?: boolean }) {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;
  const fetchEnabled = options?.fetchEnabled !== false;

  return useQuery({
    queryKey: ['comments', postId, userId],
    queryFn: () => fetchCommentsForPost(postId!, userId),
    enabled: !!postId && !!userId && fetchEnabled,
    staleTime: 5000,
  });
}

type AddCommentVars = {
  postId: string;
  body: string;
  parentId?: string | null;
};

export function useAddComment() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);

  return useMutation({
    mutationFn: async ({ postId, body, parentId }: AddCommentVars) => {
      const uid = session?.user?.id;
      if (!uid) throw new Error('Not authenticated');
      const trimmed = body.trim();
      if (!trimmed) throw new Error('Comment cannot be empty');

      const { error } = await supabase.from('comments').insert({
        post_id: postId,
        user_id: uid,
        body: trimmed,
        parent_id: parentId ?? null,
      });
      if (error) throw error;
    },
    onSettled: (_data, _err, vars) => {
      if (vars?.postId) {
        void queryClient.invalidateQueries({ queryKey: ['comments', vars.postId] });
        void queryClient.invalidateQueries({ queryKey: ['feed'] });
        void queryClient.invalidateQueries({ queryKey: ['post', vars.postId] });
      }
    },
  });
}

type ToggleCommentLikeVars = {
  postId: string;
  commentId: string;
  liked: boolean;
};

export function useToggleCommentLike() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);

  return useMutation({
    mutationFn: async ({ commentId, liked }: ToggleCommentLikeVars) => {
      const uid = session?.user?.id;
      if (!uid) throw new Error('Not authenticated');

      if (liked) {
        const { error } = await supabase
          .from('comment_likes')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', uid);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('comment_likes').insert({
          comment_id: commentId,
          user_id: uid,
        });
        if (error) throw error;
      }
    },
    onSettled: (_data, _err, vars) => {
      if (vars?.postId) {
        void queryClient.invalidateQueries({ queryKey: ['comments', vars.postId] });
      }
    },
  });
}
