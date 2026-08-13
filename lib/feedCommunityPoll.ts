import { supabase } from './supabase';
import type { FeedAudience } from './feedAudience';
import type { Post } from '../types/database';

function mapCommunityPosts(rows: Record<string, unknown>[]): Post[] {
  return rows.map((p) => ({
    ...p,
    challenge: (p.daily_event as { challenge?: unknown } | undefined)?.challenge ?? null,
  })) as Post[];
}

/**
 * Community poll cards for the feed.
 * Everyone: all of today's poll cards.
 * Friends: only when a friend (or you) has voted.
 */
export async function fetchCommunityPollPostsForFeed(
  dailyEventIds: string[],
  audience: FeedAudience,
  friendIds?: string[],
  signal?: AbortSignal,
): Promise<Post[]> {
  if (dailyEventIds.length === 0) return [];

  let communityQuery = supabase
    .from('posts')
    .select(`*, daily_event:daily_events!inner(*, challenge:challenges(*))`)
    .eq('is_community_poll', true)
    .in('daily_event_id', dailyEventIds)
    .order('created_at', { ascending: false });
  if (signal) communityQuery = communityQuery.abortSignal(signal);
  const { data: comm, error: commErr } = await communityQuery;

  if (commErr) throw commErr;

  const mapped = mapCommunityPosts(comm ?? []);

  if (audience === 'everyone' || !friendIds?.length) {
    return mapped;
  }

  const challengeIds = mapped
    .map((p) => p.challenge?.id)
    .filter((id): id is string => Boolean(id));

  if (challengeIds.length === 0) return [];

  let votesQuery = supabase
    .from('poll_votes')
    .select('user_event:user_events!inner(daily_event_id)')
    .in('challenge_id', challengeIds)
    .in('user_event.daily_event_id', dailyEventIds)
    .in('user_id', friendIds);
  if (signal) votesQuery = votesQuery.abortSignal(signal);
  const { data: votes, error: voteErr } = await votesQuery;

  if (voteErr) throw voteErr;

  const withNetworkVotes = new Set(
    (votes ?? []).flatMap((vote) => {
      const relation = vote.user_event as { daily_event_id?: string } | { daily_event_id?: string }[];
      const row = Array.isArray(relation) ? relation[0] : relation;
      return row?.daily_event_id ? [row.daily_event_id] : [];
    }),
  );
  return mapped.filter((post) => post.daily_event_id && withNetworkVotes.has(post.daily_event_id));
}
