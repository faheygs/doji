import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import {
  todayFiresAtWindow,
  isChallengeLive,
  calendarDayWindow,
  pastSevenDaysRange,
  localDateKeyFromIso,
  localDateKeyFromDate,
} from '../lib/challengeDay';
import { attachReactionFields } from '../lib/postReactions';
import { useAuthStore } from '../stores/useAuthStore';
import type { Post, Reaction, ReactionEmoji } from '../types/database';

const PAGE_SIZE = 20;

export type FeedHistoryRange = 'today' | 'yesterday' | 'week';

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

/** Any daily_events whose `fires_at` falls in [start, end). */
async function dailyEventIdsInWindow(start: string, end: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('daily_events')
    .select('id')
    .gte('fires_at', start)
    .lt('fires_at', end);

  if (error) throw error;
  return (data ?? []).map((e: { id: string }) => e.id);
}

/** Only `daily_event_id`s the user has a `user_events` row for (required to view that day's feed). */
async function filterDailyEventsUserJoined(
  userId: string,
  candidateIds: string[],
): Promise<string[]> {
  if (candidateIds.length === 0) return [];
  const { data, error } = await supabase
    .from('user_events')
    .select('daily_event_id')
    .eq('user_id', userId)
    .in('daily_event_id', candidateIds);

  if (error) throw error;
  return [...new Set((data ?? []).map((r: { daily_event_id: string }) => r.daily_event_id))];
}

type FetchContext = {
  userId: string;
  dailyEventIds: string[];
};

async function fetchFeedPostsPage(
  ctx: FetchContext,
  offset: number,
): Promise<Post[]> {
  const { userId, dailyEventIds } = ctx;
  if (dailyEventIds.length === 0) return [];

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
}

/** Resolve which daily_event ids to show for the selected history range (after participation filter). */
async function resolveDailyEventIdsForRange(
  userId: string,
  range: FeedHistoryRange,
): Promise<string[]> {
  if (range === 'today') {
    const raw = await liveDailyEventIdsForToday();
    return filterDailyEventsUserJoined(userId, raw);
  }
  if (range === 'yesterday') {
    const { start, end } = calendarDayWindow(1);
    const raw = await dailyEventIdsInWindow(start, end);
    return filterDailyEventsUserJoined(userId, raw);
  }
  const { start, end } = pastSevenDaysRange();
  const { data: des, error } = await supabase
    .from('daily_events')
    .select('id, fires_at')
    .gte('fires_at', start)
    .lt('fires_at', end);

  if (error) throw error;
  const raw = (des ?? []).map((e: { id: string }) => e.id);
  return filterDailyEventsUserJoined(userId, raw);
}

export type WeekSection = {
  title: string;
  dateKey: string;
  data: Post[];
};

function firesAtFromPost(p: Post): string {
  const ext = p as Post & {
    user_event?: { daily_event?: { fires_at?: string } };
    daily_event?: { fires_at?: string };
  };
  return (
    ext.user_event?.daily_event?.fires_at ??
    ext.daily_event?.fires_at ??
    p.created_at
  );
}

/** Group posts by local calendar day of the challenge drop (`fires_at`). Newest day first. */
export function groupPostsByDayForWeek(posts: Post[]): WeekSection[] {
  const byDay = new Map<string, Post[]>();
  for (const p of posts) {
    const key = localDateKeyFromIso(firesAtFromPost(p));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(p);
  }
  const keys = [...byDay.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  const todayKey = localDateKeyFromDate(new Date());
  const yesterdayD = new Date();
  yesterdayD.setDate(yesterdayD.getDate() - 1);
  const yesterdayKey = localDateKeyFromDate(yesterdayD);

  const labelForKey = (dateKey: string): string => {
    if (dateKey === todayKey) return 'Today';
    if (dateKey === yesterdayKey) return 'Yesterday';
    const [y, m, day] = dateKey.split('-').map(Number);
    const d = new Date(y, (m ?? 1) - 1, day ?? 1);
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  return keys.map((dateKey) => ({
    title: labelForKey(dateKey),
    dateKey,
    data: (byDay.get(dateKey) ?? []).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    ),
  }));
}

/**
 * Global feed for the current user’s selected window.
 * Participation: only `daily_event`s the user has a `user_events` row for can appear.
 */
export function useFeed(range: FeedHistoryRange = 'today') {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;

  return useInfiniteQuery<
    Post[],
    Error,
    InfiniteData<Post[], number>,
    ['feed', FeedHistoryRange, string | undefined],
    number
  >({
    queryKey: ['feed', range, userId],
    queryFn: async ({ pageParam }): Promise<Post[]> => {
      if (!userId) return [];

      const dailyEventIds = await resolveDailyEventIdsForRange(userId, range);
      const offset = pageParam ?? 0;
      return fetchFeedPostsPage({ userId, dailyEventIds }, offset);
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
        void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'feed' });
        void queryClient.invalidateQueries({ queryKey: ['post', vars.postId] });
      }
    },
  });
}
