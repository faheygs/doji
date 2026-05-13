import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { todayFiresAtWindow } from '../lib/challengeDay';
import { attachReactionFields } from '../lib/postReactions';
import { useAuthStore } from '../stores/useAuthStore';
import type { Post, Reaction, ReactionEmoji } from '../types/database';

const PAGE_SIZE = 20;

/** Pagination: friend posts first (self + accepted friends), then everyone else. Community polls only on first chunk. */
type FeedPageParam = { t: 'f'; o: number } | { t: 'e'; o: number };

async function resolveFriendIds(userId: string): Promise<string[]> {
  const ids = new Set<string>([userId]);
  const { data: friendships, error } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .eq('status', 'accepted');
  if (error) throw error;
  for (const f of friendships ?? []) {
    const other = f.requester_id === userId ? f.addressee_id : f.requester_id;
    ids.add(other);
  }
  return [...ids];
}

export function useFeed() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;

  return useInfiniteQuery<
    Post[],
    Error,
    InfiniteData<Post[], FeedPageParam>,
    ['feed', string | undefined],
    FeedPageParam
  >({
    queryKey: ['feed', userId],
    queryFn: async ({ pageParam }): Promise<Post[]> => {
      if (!userId) return [];

      const param: FeedPageParam = pageParam ?? { t: 'f', o: 0 };

      const { start, end } = todayFiresAtWindow();

      const { data: dailyEvents } = await supabase
        .from('daily_events')
        .select('id')
        .gte('fires_at', start)
        .lt('fires_at', end);

      const dailyEventIds = (dailyEvents ?? []).map((e: { id: string }) => e.id);
      if (dailyEventIds.length === 0) return [];

      const friendIds = await resolveFriendIds(userId);

      let communityMapped: Post[] = [];
      if (param.t === 'f' && param.o === 0) {
        const { data: comm, error: commErr } = await supabase
          .from('posts')
          .select(`*, daily_event:daily_events!inner(*, challenge:challenges(*))`)
          .eq('is_community_poll', true)
          .in('daily_event_id', dailyEventIds)
          .order('created_at', { ascending: false });

        if (commErr) throw commErr;
        communityMapped = (comm ?? []).map((p: Record<string, unknown>) => ({
          ...p,
          challenge: (p.daily_event as { challenge?: unknown } | undefined)?.challenge ?? null,
        })) as Post[];
      }

      let userQuery = supabase
        .from('posts')
        .select(
          `*, profile:profiles(*), user_event:user_events!inner(*, daily_event:daily_events(*, challenge:challenges(*)))`,
        )
        .eq('is_community_poll', false)
        .in('user_event.daily_event_id', dailyEventIds);

      if (param.t === 'f') {
        userQuery = userQuery.in('user_id', friendIds);
      } else {
        userQuery = userQuery.not('user_id', 'in', `(${friendIds.join(',')})`);
      }

      const { data, error } = await userQuery
        .order('created_at', { ascending: false })
        .range(param.o, param.o + PAGE_SIZE - 1);

      if (error) throw error;

      const userMapped = (data ?? []).map((p: Record<string, unknown>) => ({
        ...p,
        challenge:
          (p.user_event as { daily_event?: { challenge?: unknown } } | undefined)?.daily_event
            ?.challenge ?? null,
      })) as Post[];

      const merged =
        param.t === 'f' && param.o === 0 ? [...communityMapped, ...userMapped] : userMapped;

      return attachReactionFields(merged, userId);
    },
    getNextPageParam: (lastPage, _allPages, lastPageParam): FeedPageParam | undefined => {
      const param: FeedPageParam = lastPageParam ?? { t: 'f', o: 0 };

      if (param.t === 'f') {
        const userPostsOnPage = lastPage.filter((p) => !p.is_community_poll).length;
        if (userPostsOnPage < PAGE_SIZE) return { t: 'e', o: 0 };
        return { t: 'f', o: param.o + PAGE_SIZE };
      }

      if (param.t === 'e') {
        if (lastPage.length < PAGE_SIZE) return undefined;
        return { t: 'e', o: param.o + PAGE_SIZE };
      }

      return undefined;
    },
    initialPageParam: { t: 'f', o: 0 } satisfies FeedPageParam,
    enabled: !!userId,
    staleTime: 10_000,
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
    enabled: !!session?.user?.id,
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
  }
  bd[emoji] = (bd[emoji] ?? 0) + 1;
  myReactions.push(emoji);
  return {
    ...post,
    reaction_count: post.reaction_count + 1,
    reaction_breakdown: bd,
    my_reactions: myReactions,
  };
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
      const uid = session?.user?.id;
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
      const uid = session?.user?.id;
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
      const uid = session?.user?.id;
      if (uid) {
        void queryClient.invalidateQueries({ queryKey: ['reactionsGiven', uid] });
      }
      if (error && vars?.postId) {
        queryClient.invalidateQueries({ queryKey: ['reactions', vars.postId] });
      }
    },
  });
}
