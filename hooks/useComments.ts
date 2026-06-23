import { useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import { useDemoStore } from '../stores/useDemoStore';
import { DEMO_COMMENTS_BY_POST } from '../constants/demoData';
import { mapInfinitePosts } from './useFeed';
import { type CommentLikeRow } from './useCommentLikes';
import { DEMO_COMMENT_LIKES_BY_COMMENT } from '../constants/demoData';
import { fetchMentionableUserIds } from '../lib/mentionNetwork';
import { getFriendIdsIncludingSelf } from '../lib/friendGraph';
import { filterCommentsForAudience, type FeedAudience } from '../lib/feedAudience';
import type { Comment, Profile, Post } from '../types/database';

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
      if (isDemoMode) {
        const store = useDemoStore.getState();
        const staticComments = (DEMO_COMMENTS_BY_POST[postId ?? ''] ?? []) as CommentWithMeta[];
        const myComments = (store.demoMyCommentsByPost[postId ?? ''] ?? []) as CommentWithMeta[];
        const liked = new Set(store.demoLikedCommentIds);
        return [...staticComments, ...myComments]
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          .map((c) => ({
            ...c,
            my_like: liked.has(c.id),
            like_count: liked.has(c.id) ? c.like_count + 1 : c.like_count,
          }));
      }
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
      try {
        await insertCommentMentions(inserted.id, trimmed, uid);
      } catch {
        if (__DEV__) console.warn('[useAddComment] mention insertion failed');
      }
    },
    onMutate: ({ postId, body, parentId }) => {
      if (!useDemoStore.getState().isDemoMode) return;
      const uid = session?.user?.id;
      const profile = useAuthStore.getState().profile as Profile;
      if (!uid || !profile) return;
      const newComment: Comment = {
        id: `demo-comment-mine-${Date.now()}`,
        post_id: postId,
        user_id: uid,
        parent_id: parentId ?? null,
        body: body.trim(),
        like_count: 0,
        created_at: new Date().toISOString(),
        updated_at: null,
        body_edited: false,
        my_like: false,
        profile,
      };
      useDemoStore.getState().addDemoMyComment(postId, newComment);
      queryClient.setQueryData<CommentWithMeta[]>(
        ['comments', postId, 'demo'],
        (old) => [...(old ?? []), newComment],
      );
      queryClient.setQueriesData<InfiniteData<Post[]>>(
        { predicate: (q) => q.queryKey[0] === 'feed' },
        (old) => mapInfinitePosts(old, postId, (p) => ({ ...p, comment_count: p.comment_count + 1 })),
      );
    },
    onSettled: (_data, _err, vars) => {
      if (!vars?.postId) return;
      if (useDemoStore.getState().isDemoMode) return;
      void queryClient.invalidateQueries({ queryKey: ['comments', vars.postId] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({ queryKey: ['post', vars.postId] });
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
        .update({ body: trimmed, body_edited: true, updated_at: new Date().toISOString() })
        .eq('id', commentId)
        .eq('user_id', uid);

      if (error) throw error;

      try {
        await supabase.from('comment_mentions').delete().eq('comment_id', commentId);
        await insertCommentMentions(commentId, trimmed, uid);
      } catch {
        if (__DEV__) console.warn('[useEditComment] mention refresh failed');
      }
    },
    onMutate: ({ postId, commentId, body }) => {
      if (!useDemoStore.getState().isDemoMode) return;
      const trimmed = body.trim();
      useDemoStore.getState().editDemoMyComment(postId, commentId, trimmed);
      queryClient.setQueryData<CommentWithMeta[]>(
        ['comments', postId, 'demo'],
        (old) => (old ?? []).map((c) => c.id === commentId ? { ...c, body: trimmed, body_edited: true } : c),
      );
    },
    onSettled: (_data, _err, vars) => {
      if (!vars?.postId) return;
      if (useDemoStore.getState().isDemoMode) return;
      void queryClient.invalidateQueries({ queryKey: ['comments', vars.postId] });
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
    onMutate: ({ postId, commentId }) => {
      if (!useDemoStore.getState().isDemoMode) return;
      useDemoStore.getState().deleteDemoMyComment(postId, commentId);
      queryClient.setQueryData<CommentWithMeta[]>(
        ['comments', postId, 'demo'],
        (old) => (old ?? []).filter((c) => c.id !== commentId),
      );
      queryClient.setQueriesData<InfiniteData<Post[]>>(
        { predicate: (q) => q.queryKey[0] === 'feed' },
        (old) => mapInfinitePosts(old, postId, (p) => ({ ...p, comment_count: Math.max(0, p.comment_count - 1) })),
      );
    },
    onSettled: (_data, _err, vars) => {
      if (!vars?.postId) return;
      if (useDemoStore.getState().isDemoMode) return;
      void queryClient.invalidateQueries({ queryKey: ['comments', vars.postId] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({ queryKey: ['post', vars.postId] });
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
    onMutate: ({ postId, commentId, liked }) => {
      if (!useDemoStore.getState().isDemoMode) return;
      useDemoStore.getState().toggleDemoCommentLike(commentId);
      // Update comment like count in thread
      queryClient.setQueryData<CommentWithMeta[]>(
        ['comments', postId, 'demo'],
        (old) => (old ?? []).map((c) =>
          c.id === commentId
            ? { ...c, my_like: !liked, like_count: liked ? c.like_count - 1 : c.like_count + 1 }
            : c,
        ),
      );
      // Update the "who liked" viewer cache
      const profile = useAuthStore.getState().profile;
      const uid = useAuthStore.getState().session?.user?.id ?? 'demo-me';
      queryClient.setQueryData<InfiniteData<CommentLikeRow[]>>(
        ['commentLikes', commentId, 'demo'],
        (old) => {
          // Seed with static likers if the cache hasn't been loaded yet
          const staticLikers = (DEMO_COMMENT_LIKES_BY_COMMENT[commentId] ?? []) as CommentLikeRow[];
          const existing = old ?? { pages: [staticLikers], pageParams: [0] };
          if (liked) {
            return { ...existing, pages: existing.pages.map((p) => p.filter((r) => r.user_id !== uid)) };
          }
          const entry: CommentLikeRow = {
            id: `demo-like-${commentId}`,
            user_id: uid,
            created_at: new Date().toISOString(),
            profile: profile ? {
              username: profile.username,
              display_name: profile.display_name,
              avatar_url: profile.avatar_url,
              equipped_border_key: profile.equipped_border_key,
            } : null,
          };
          return { ...existing, pages: [[entry, ...(existing.pages[0] ?? [])], ...existing.pages.slice(1)] };
        },
      );
    },
    onSettled: (_data, _err, vars) => {
      if (!vars?.postId) return;
      if (useDemoStore.getState().isDemoMode) return;
      void queryClient.invalidateQueries({ queryKey: ['comments', vars.postId] });
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
