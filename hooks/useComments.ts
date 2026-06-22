import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import { useDemoStore } from '../stores/useDemoStore';
import { DEMO_COMMENTS_BY_POST } from '../constants/demoData';
import { fetchMentionableUserIds } from '../lib/mentionNetwork';
import { getFriendIdsIncludingSelf } from '../lib/friendGraph';
import { filterCommentsForAudience, type FeedAudience } from '../lib/feedAudience';
import type { Comment, Profile } from '../types/database';

const COMMENT_SELECT = '*, profile:profiles(username, display_name, avatar_url, equipped_border_key)';

export type CommentWithMeta = Comment;

const MENTION_REGEX = /@([a-zA-Z0-9_]{2,30})/g;

export function parseMentionUsernames(body: string): string[] {
  const matches = [...body.matchAll(MENTION_REGEX)];
  return [...new Set(matches.map((m) => m[1].toLowerCase()))];
}

async function insertCommentMentions(commentId: string, body: string, viewerId: string) {
  const usernames = parseMentionUsernames(body);
  if (usernames.length === 0) return;

  const mentionableIds = await fetchMentionableUserIds(viewerId);
  if (mentionableIds.length === 0) return;

  const { data: profiles, error: profileErr } = await supabase
    .from('profiles')
    .select('id, username')
    .in('username', usernames)
    .in('id', mentionableIds);

  if (profileErr) throw profileErr;
  if (!profiles?.length) return;

  const rows = profiles.map((p: { id: string }) => ({
    comment_id: commentId,
    mentioned_user_id: p.id,
  }));

  const { error } = await supabase.from('comment_mentions').insert(rows);
  if (error) throw error;
}

async function fetchCommentsForPost(
  postId: string,
  userId: string | undefined,
  audience: FeedAudience,
): Promise<CommentWithMeta[]> {
  const { data, error } = await supabase
    .from('comments')
    .select(COMMENT_SELECT)
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  const rows = (data ?? []) as CommentWithMeta[];
  const ids = rows.map((r) => r.id);
  let withLikes: CommentWithMeta[];
  if (!userId || ids.length === 0) {
    withLikes = rows.map((r) => ({ ...r, my_like: false }));
  } else {
    const { data: likes, error: likesErr } = await supabase
      .from('comment_likes')
      .select('comment_id')
      .eq('user_id', userId)
      .in('comment_id', ids);

    if (likesErr) throw likesErr;
    const liked = new Set((likes ?? []).map((l: { comment_id: string }) => l.comment_id));
    withLikes = rows.map((r) => ({ ...r, my_like: liked.has(r.id) }));
  }

  if (audience === 'everyone' || !userId) return withLikes;
  const friendIds = await getFriendIdsIncludingSelf(userId);
  return filterCommentsForAudience(withLikes, audience, friendIds);
}

export function useComments(
  postId: string | undefined,
  options?: { fetchEnabled?: boolean; feedAudience?: FeedAudience },
) {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  const fetchEnabled = options?.fetchEnabled !== false;
  const feedAudience = options?.feedAudience ?? 'everyone';

  return useQuery({
    queryKey: isDemoMode
      ? ['comments', postId, 'demo']
      : ['comments', postId, userId, feedAudience],
    queryFn: (): Promise<CommentWithMeta[]> | CommentWithMeta[] => {
      if (isDemoMode) return (DEMO_COMMENTS_BY_POST[postId ?? ''] ?? []) as CommentWithMeta[];
      return fetchCommentsForPost(postId!, userId, feedAudience);
    },
    enabled: isDemoMode ? !!postId : (!!postId && !!userId && fetchEnabled),
    staleTime: isDemoMode ? Infinity : 20_000,
  });
}

export function useMentionSearch(query: string, options?: { enabled?: boolean }) {
  const session = useAuthStore((s) => s.session);
  const viewerId = session?.user?.id;
  const enabled = options?.enabled !== false && !!viewerId;

  return useQuery({
    queryKey: ['mentionSearch', viewerId, query],
    queryFn: async (): Promise<Profile[]> => {
      if (!viewerId) return [];
      const mentionableIds = await fetchMentionableUserIds(viewerId);
      if (mentionableIds.length === 0) return [];

      const trimmed = query.trim();
      let builder = supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', mentionableIds)
        .limit(8);

      if (trimmed) {
        builder = builder.ilike('username', `${trimmed}%`);
      } else {
        builder = builder.order('username', { ascending: true });
      }

      const { data, error } = await builder;
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
    enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
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
      // In demo mode: skip DB writes
      if (useDemoStore.getState().isDemoMode) return;

      const { data: inserted, error } = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          user_id: uid,
          body: trimmed,
          parent_id: parentId ?? null,
        })
        .select('id')
        .single();

      if (error) throw error;
      // Mention insertion is best-effort — the comment is already saved.
      // A failure here should not surface an error to the user.
      try {
        await insertCommentMentions(inserted.id, trimmed, uid);
      } catch {
        if (__DEV__) console.warn('[useAddComment] mention insertion failed');
      }
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

type EditCommentVars = {
  postId: string;
  commentId: string;
  body: string;
};

export function useEditComment() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);

  return useMutation({
    mutationFn: async ({ commentId, body }: EditCommentVars) => {
      const uid = session?.user?.id;
      if (!uid) throw new Error('Not authenticated');
      const trimmed = body.trim();
      if (!trimmed) throw new Error('Comment cannot be empty');
      if (useDemoStore.getState().isDemoMode) return;

      const { error } = await supabase
        .from('comments')
        .update({
          body: trimmed,
          body_edited: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', commentId)
        .eq('user_id', uid);

      if (error) throw error;

      // Best-effort mention refresh — edit is already saved if this fails.
      try {
        await supabase.from('comment_mentions').delete().eq('comment_id', commentId);
        await insertCommentMentions(commentId, trimmed, uid);
      } catch {
        if (__DEV__) console.warn('[useEditComment] mention refresh failed');
      }
    },
    onSettled: (_data, _err, vars) => {
      if (vars?.postId) {
        void queryClient.invalidateQueries({ queryKey: ['comments', vars.postId] });
      }
    },
  });
}

type DeleteCommentVars = {
  postId: string;
  commentId: string;
};

export function useDeleteComment() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);

  return useMutation({
    mutationFn: async ({ commentId }: DeleteCommentVars) => {
      const uid = session?.user?.id;
      if (!uid) throw new Error('Not authenticated');
      if (useDemoStore.getState().isDemoMode) return;

      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', uid);

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
      if (useDemoStore.getState().isDemoMode) return;

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

type ToggleCommentsDisabledVars = {
  postId: string;
  disabled: boolean;
};

export function useToggleCommentsDisabled() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);

  return useMutation({
    mutationFn: async ({ postId, disabled }: ToggleCommentsDisabledVars) => {
      const uid = session?.user?.id;
      if (!uid) throw new Error('Not authenticated');
      if (useDemoStore.getState().isDemoMode) return;

      const { error } = await supabase
        .from('posts')
        .update({ comments_disabled: disabled })
        .eq('id', postId)
        .eq('user_id', uid);

      if (error) throw error;
    },
    onSettled: (_data, _err, vars) => {
      if (vars?.postId) {
        void queryClient.invalidateQueries({ queryKey: ['feed'] });
        void queryClient.invalidateQueries({ queryKey: ['post', vars.postId] });
      }
    },
  });
}
