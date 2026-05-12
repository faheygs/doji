import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { attachReactionFields } from '../lib/postReactions';
import { useAuthStore } from '../stores/useAuthStore';
import type { Post, Reaction, ReactionEmoji } from '../types/database';

const PAGE_SIZE = 20;

export type FeedFilterType = 'friends' | 'everyone';

function todayRange() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function useFeed(filter: FeedFilterType = 'friends') {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  return useInfiniteQuery({
    queryKey: ['feed', userId, filter],
    queryFn: async ({ pageParam = 0 }): Promise<Post[]> => {
      if (!userId) return [];

      const { start, end } = todayRange();

      // Get today's daily event IDs
      const { data: dailyEvents } = await supabase
        .from('daily_events')
        .select('id')
        .gte('fires_at', start)
        .lt('fires_at', end);

      const dailyEventIds = (dailyEvents ?? []).map((e: any) => e.id);
      if (dailyEventIds.length === 0) return [];

      // Get user_event IDs linked to today's daily events
      const { data: userEvents } = await supabase
        .from('user_events')
        .select('id')
        .in('daily_event_id', dailyEventIds);

      const userEventIds = (userEvents ?? []).map((e: any) => e.id);
      if (userEventIds.length === 0) return [];

      let friendIds: string[] | null = null;
      if (filter === 'friends') {
        friendIds = [userId];
        const { data: friendships } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id')
          .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
          .eq('status', 'accepted');

        for (const f of friendships ?? []) {
          const otherId = f.requester_id === userId ? f.addressee_id : f.requester_id;
          if (!friendIds.includes(otherId)) friendIds.push(otherId);
        }
      }

      let query = supabase
        .from('posts')
        .select(
          `*, profile:profiles(*), user_event:user_events(*, daily_event:daily_events(*, challenge:challenges(*)))`,
        )
        .in('user_event_id', userEventIds);

      if (friendIds) {
        query = query.in('user_id', friendIds);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .range(pageParam * PAGE_SIZE, (pageParam + 1) * PAGE_SIZE - 1);

      if (error) throw error;

      const mapped = (data ?? []).map((p: any) => ({
        ...p,
        challenge: p.user_event?.daily_event?.challenge ?? null,
      })) as Post[];

      return attachReactionFields(mapped, userId);
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.length : undefined,
    initialPageParam: 0,
    enabled: !!userId,
    staleTime: 45_000,
  });
}

export function usePostReactions(postId: string) {
  const session = useAuthStore((s) => s.session);

  return useInfiniteQuery({
    queryKey: ['reactions', postId],
    queryFn: async ({ pageParam = 0 }): Promise<Reaction[]> => {
      const { data, error } = await supabase
        .from('reactions')
        .select('*, profile:profiles(username, avatar_url)')
        .eq('post_id', postId)
        .order('created_at', { ascending: false })
        .range(pageParam * 50, (pageParam + 1) * 50 - 1);

      if (error) throw error;
      return data as Reaction[];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === 50 ? allPages.length : undefined,
    initialPageParam: 0,
    enabled: !!session?.user.id,
  });
}

type ToggleReactionVars = {
  postId: string;
  emoji: ReactionEmoji;
  active: boolean;
};

function patchReactionToggle(
  post: Post,
  emoji: ReactionEmoji,
  active: boolean,
): Post {
  const bd: Record<string, number> = { ...(post.reaction_breakdown ?? {}) };
  const myReactions = [...(post.my_reactions ?? [])];

  if (active) {
    // Remove
    bd[emoji] = Math.max(0, (bd[emoji] ?? 0) - 1);
    if (bd[emoji] <= 0) delete bd[emoji];
    const idx = myReactions.indexOf(emoji);
    if (idx >= 0) myReactions.splice(idx, 1);
    return {
      ...post,
      reaction_count: Math.max(0, post.reaction_count - 1),
      reaction_breakdown: bd,
      my_reactions: myReactions,
    };
  } else {
    // Add
    bd[emoji] = (bd[emoji] ?? 0) + 1;
    myReactions.push(emoji);
    return {
      ...post,
      reaction_count: post.reaction_count + 1,
      reaction_breakdown: bd,
      my_reactions: myReactions,
    };
  }
}

function mapInfinitePosts(
  old: InfiniteData<Post[]> | undefined,
  postId: string,
  patch: (p: Post) => Post,
): InfiniteData<Post[]> | undefined {
  if (!old) return old;
  return {
    ...old,
    pages: old.pages.map((page) => page.map((p) => (p.id === postId ? patch(p) : p))),
  };
}

export function useToggleReaction() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);

  return useMutation({
    mutationFn: async ({ postId, emoji, active }: ToggleReactionVars) => {
      const uid = session?.user.id;
      if (!uid) throw new Error('Not authenticated');

      if (active) {
        const { error } = await supabase
          .from('reactions')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', uid)
          .eq('emoji', emoji);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('reactions').insert({
          post_id: postId,
          user_id: uid,
          emoji,
        });
        if (error) throw error;
      }
    },
    onMutate: async (vars) => {
      const uid = session?.user.id;
      if (!uid) return;

      await queryClient.cancelQueries({ predicate: (q) => q.queryKey[0] === 'feed' });

      const previousFeedQueries = queryClient.getQueriesData<InfiniteData<Post[]>>({
        predicate: (q) => q.queryKey[0] === 'feed',
      });

      queryClient.setQueriesData<InfiniteData<Post[]>>(
        { predicate: (q) => q.queryKey[0] === 'feed' },
        (old) => mapInfinitePosts(old, vars.postId, (p) => patchReactionToggle(p, vars.emoji, vars.active)),
      );

      return { previousFeedQueries, uid };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx?.previousFeedQueries) return;
      for (const [queryKey, data] of ctx.previousFeedQueries) {
        queryClient.setQueryData(queryKey, data);
      }
    },
    onSettled: (_data, error, vars) => {
      if (error && vars?.postId) {
        queryClient.invalidateQueries({ queryKey: ['reactions', vars.postId] });
      }
    },
  });
}
