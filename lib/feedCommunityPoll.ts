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
 * Friends: only when someone you follow (or you) has voted.
 */
export async function fetchCommunityPollPostsForFeed(
  dailyEventIds: string[],
  audience: FeedAudience,
  followingIds?: string[],
): Promise<Post[]> {
  if (dailyEventIds.length === 0) return [];

  const { data: comm, error: commErr } = await supabase
    .from('posts')
    .select(`*, daily_event:daily_events!inner(*, challenge:challenges(*))`)
    .eq('is_community_poll', true)
    .in('daily_event_id', dailyEventIds)
    .order('created_at', { ascending: false });

  if (commErr) throw commErr;

  const mapped = mapCommunityPosts(comm ?? []);

  if (audience === 'everyone' || !followingIds?.length) {
    return mapped;
  }

  const challengeIds = mapped
    .map((p) => p.challenge?.id)
    .filter((id): id is string => Boolean(id));

  if (challengeIds.length === 0) return [];

  const { data: votes, error: voteErr } = await supabase
    .from('poll_votes')
    .select('challenge_id')
    .in('challenge_id', challengeIds)
    .in('user_id', followingIds);

  if (voteErr) throw voteErr;

  const withNetworkVotes = new Set((votes ?? []).map((v) => v.challenge_id as string));
  return mapped.filter((p) => p.challenge?.id && withNetworkVotes.has(p.challenge.id));
}
