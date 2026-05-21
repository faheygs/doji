import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { todayFiresAtWindow, isChallengeLive } from '../lib/challengeDay';
import { attachReactionFields } from '../lib/postReactions';
import { useAuthStore } from '../stores/useAuthStore';
import type { Post, Reaction, ReactionEmoji } from '../types/database';

const PAGE_SIZE = 20;

async function liveDailyEventIdsForToday(): Promise<string[]> {
  const { start, end } = todayFiresAtWindow();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('daily_events')
    .select('id, fires_at')
    .gte('fires_at', start)
    .lt('fires_at', end);

  if (error) throw error;
  return (data ?? [])
    .filter((e: { fires_at: string }) => isChallengeLive(e.fires_at))
    .map((e: { id: string }) => e.id);
}

/** Global feed: everyone’s posts for today’s live challenge only (no friend-only slice). */
export function useFeed() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;

  return useInfiniteQuery<
    Post[],
    Error,
    InfiniteData<Post[], number>,
    ['feed', string | undefined],
    number
  >({
    queryKey: ['feed', userId],
    queryFn: async ({ pageParam }): Promise<Post[]> => {
      if (!userId) return [];

      const dailyEventIds = await liveDailyEventIdsForToday();
      if (dailyEventIds.length === 0) return [];

      const offset = pageParam ?? 0;

      let communityMapped: Post[] = [];
      if (offset === 0) {
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

      const { data, error } = await supabase
        .from('posts')
        .select(
          `*, profile:profiles(*), user_event:user_events!inner(*, daily_event:daily_events(*, challenge:challenges(*)))`,
        )
        .eq('is_community_poll', false)
        .in('user_event.daily_event_id', dailyEventIds)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;

      const userMapped = (data ?? []).map((p: Record<string, unknown>) => ({
        ...p,
        challenge:
          (p.user_event as { daily_event?: { challenge?: unknown } } | undefined)?.daily_event
            ?.challenge ?? null,
      })) as Post[];

      const merged =
        offset === 0
          ? [...communityMapped, ...userMapped].sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
            )
          : userMapped;

      return attachReactionFields(merged, userId);
    },
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      const offset = lastPageParam ?? 0;
      const userPostsOnPage = lastPage.filter((p) => !p.is_community_poll).length;
      if (userPostsOnPage < PAGE_SIZE) return undefined;
      return offset + PAGE_SIZE;
    },
    initialPageParam: 0,
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
  const prevMy = (post.my_reactions ?? [])[0] as ReactionEmoji | undefined;

  if (active) {
    bd[emoji] = Math.max(0, (bd[emoji] ?? 0) - 1);
    if (bd[emoji] <= 0) delete bd[emoji];
    return {
      ...post,
      reaction_count: Math.max(0, post.reaction_count - 1),
      reaction_breakdown: bd,
      my_reactions: [],
    };
  }

  for (const k of Object.keys(bd)) {
    const key = k as ReactionEmoji;
    if (prevMy && key === prevMy && key !== emoji) {
      bd[key] = Math.max(0, (bd[key] ?? 0) - 1);
      if (bd[key] <= 0) delete bd[key];
    }
  }
  bd[emoji] = (bd[emoji] ?? 0) + 1;
  const replacing = Boolean(prevMy && prevMy !== emoji);
  return {
    ...post,
    reaction_count: replacing ? post.reaction_count : post.reaction_count + 1,
    reaction_breakdown: bd,
    my_reactions: [emoji],
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
          .eq('user_id', uid);
        if (error) throw error;
      } else {
        await supabase.from('reactions').delete().eq('post_id', postId).eq('user_id', uid);
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
      if (vars?.postId) {
        void queryClient.invalidateQueries({ queryKey: ['reactions', vars.postId] });
        void queryClient.invalidateQueries({ queryKey: ['feed'] });
        void queryClient.invalidateQueries({ queryKey: ['post', vars.postId] });
      }
    },
  });
}
