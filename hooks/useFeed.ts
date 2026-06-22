import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { todayFiresAtWindow, isChallengeLive } from '../lib/challengeDay';
import { parseDate } from '../utils/time';
import { fetchCommunityPollPostsForFeed } from '../lib/feedCommunityPoll';
import { filterPostsForAudience, type FeedAudience } from '../lib/feedAudience';
import { getFriendIdsIncludingSelf } from '../lib/friendGraph';
import { attachReactionFields } from '../lib/postReactions';
import { useAuthStore } from '../stores/useAuthStore';
import { useDemoStore } from '../stores/useDemoStore';
import { DEMO_FEED_POSTS } from '../constants/demoData';
import type { Post, Reaction, ReactionEmoji } from '../types/database';

export type { FeedAudience };

const PAGE_SIZE = 20;

/** Today: only daily_events in the current calendar day that have already fired. */
async function liveDailyEventIdsForToday(): Promise<string[]> {
  const { start, end } = todayFiresAtWindow();
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

type FetchContext = {
  userId: string;
  dailyEventIds: string[];
  audience: FeedAudience;
  friendIds?: string[];
};

async function fetchFeedPostsPage(
  ctx: FetchContext,
  offset: number,
): Promise<Post[]> {
  const { userId, dailyEventIds, audience, friendIds } = ctx;
  if (dailyEventIds.length === 0) return [];

  const communityMapped =
    offset === 0
      ? await fetchCommunityPollPostsForFeed(dailyEventIds, audience, friendIds)
      : [];

  let userEventIds: string[] | undefined;
  if (audience === 'friends' && friendIds) {
    const { data: userEvents, error: userEventsErr } = await supabase
      .from('user_events')
      .select('id')
      .in('daily_event_id', dailyEventIds)
      .in('user_id', friendIds);

    if (userEventsErr) throw userEventsErr;
    userEventIds = (userEvents ?? []).map((row: { id: string }) => row.id);

    if (userEventIds.length === 0) {
      return attachReactionFields(communityMapped, userId, friendIds);
    }
  }

  let query = supabase
    .from('posts')
    .select(
      `*, profile:profiles(*), user_event:user_events!inner(*, daily_event:daily_events(*, challenge:challenges(*)))`,
    )
    .eq('is_community_poll', false)
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (userEventIds) {
    query = query.in('user_event_id', userEventIds);
  } else {
    query = query.in('user_event.daily_event_id', dailyEventIds);
  }

  const { data, error } = await query;

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
          (a, b) => parseDate(b.created_at).getTime() - parseDate(a.created_at).getTime(),
        )
      : userMapped;

  const filtered =
    audience === 'friends' && friendIds
      ? filterPostsForAudience(merged, audience, friendIds)
      : merged;

  const reactionScope = audience === 'friends' ? friendIds : undefined;

  return attachReactionFields(filtered, userId, reactionScope);
}

/**
 * Today's live feed for the selected audience.
 * Friends: posts from mutual friends (+ self), poll results scoped to that network.
 * Everyone: all eligible posts from today's completers and full poll results.
 */
export function useFeed(audience: FeedAudience = 'friends') {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;
  const isDemoMode = useDemoStore((s) => s.isDemoMode);

  return useInfiniteQuery<
    Post[],
    Error,
    InfiniteData<Post[], number>,
    ['feed', FeedAudience, string | undefined],
    number
  >({
    queryKey: isDemoMode
      ? (['feed', 'friends', 'demo'] as unknown as ['feed', FeedAudience, string | undefined])
      : ['feed', audience, userId],
    queryFn: async ({ pageParam }): Promise<Post[]> => {
      if (isDemoMode) return DEMO_FEED_POSTS;
      if (!userId) return [];

      const [dailyEventIds, friendIds] = await Promise.all([
        liveDailyEventIdsForToday(),
        audience === 'friends' ? getFriendIdsIncludingSelf(userId) : Promise.resolve(undefined),
      ]);
      const offset = pageParam ?? 0;
      return fetchFeedPostsPage({ userId, dailyEventIds, audience, friendIds }, offset);
    },
    getNextPageParam: isDemoMode ? () => undefined : (lastPage, _allPages, lastPageParam) => {
      const offset = lastPageParam ?? 0;
      const userPostsOnPage = lastPage.filter((p) => !p.is_community_poll).length;
      if (userPostsOnPage < PAGE_SIZE) return undefined;
      return offset + PAGE_SIZE;
    },
    initialPageParam: 0,
    enabled: isDemoMode || !!userId,
    staleTime: isDemoMode ? Infinity : 60_000,
  });
}

export function usePostReactions(postId: string, scopeUserIds?: string[]) {
  const session = useAuthStore((s) => s.session);
  const scopeKey = scopeUserIds?.slice().sort().join(',') ?? 'all';

  return useInfiniteQuery({
    queryKey: ['reactions', postId, scopeKey],
    queryFn: async ({ pageParam = 0 }): Promise<Reaction[]> => {
      let query = supabase
        .from('reactions')
        .select('*, profile:profiles(username, avatar_url, equipped_border_key)')
        .eq('post_id', postId)
        .order('created_at', { ascending: false })
        .range(pageParam * 50, (pageParam + 1) * 50 - 1);

      if (scopeUserIds && scopeUserIds.length > 0) {
        query = query.in('user_id', scopeUserIds);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Reaction[];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === 50 ? allPages.length : undefined,
    initialPageParam: 0,
    enabled: !!session?.user?.id && !!postId,
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
      // In demo mode: skip DB — the optimistic update in onMutate is the full effect
      if (useDemoStore.getState().isDemoMode) return;

      if (active) {
        const { error } = await supabase
          .from('reactions')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', uid);
        if (error) throw error;
      } else {
        const { error: delError } = await supabase.from('reactions').delete().eq('post_id', postId).eq('user_id', uid);
        if (delError) throw delError;
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
      // In demo mode: the optimistic update is permanent — don't invalidate or it reverts
      if (useDemoStore.getState().isDemoMode) return;
      const uid = session?.user?.id;
      if (uid) {
        void queryClient.invalidateQueries({ queryKey: ['reactionsGiven', uid] });
      }
      if (vars?.postId) {
        void queryClient.invalidateQueries({ queryKey: ['reactions', vars.postId] });
        void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'feed' });
        void queryClient.invalidateQueries({ queryKey: ['post', vars.postId] });
      }
    },
  });
}
