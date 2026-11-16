import { supabase } from './supabase';
import { runMemberRead } from './runMemberRead';
import { readThroughScaleGateway } from './scaleReadGateway';
import { normalizeReactionEmoji } from './reactionEmoji';
import type { Post, ReactionEmoji } from '../types/database';

/** Detail uses Everyone totals, never the legacy counters stored on posts. */
export async function attachPostDetailEngagement(
  post: Post,
  signal: AbortSignal,
): Promise<Post | null> {
  const data = await readThroughScaleGateway<unknown>(
    `/v1/posts/${encodeURIComponent(post.id)}/engagement?audience=everyone`,
    async () => {
      const { data } = await runMemberRead(
        supabase.rpc('get_post_engagement_snapshot_v2', {
          p_post_id: post.id,
          p_audience: 'everyone',
        }),
        signal,
      );
      return data;
    },
    signal,
  );
  if (data === null) return null;
  const row = data as Record<string, unknown> | undefined;
  const count = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  if (
    !row ||
    row.post_id !== post.id ||
    !count(row.comment_count) ||
    !count(row.reaction_count) ||
    !row.reaction_breakdown ||
    typeof row.reaction_breakdown !== 'object' ||
    Array.isArray(row.reaction_breakdown) ||
    !Object.values(row.reaction_breakdown).every(count) ||
    !Array.isArray(row.my_reactions) ||
    !row.my_reactions.every((value) => typeof value === 'string')
  ) {
    throw new Error('Invalid post engagement');
  }
  return {
    ...post,
    comment_count: row.comment_count,
    reaction_count: row.reaction_count,
    reaction_breakdown: row.reaction_breakdown as Record<string, number>,
    my_reactions: row.my_reactions
      .map(normalizeReactionEmoji)
      .filter((emoji): emoji is ReactionEmoji => emoji !== null),
  };
}
