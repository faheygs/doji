import { supabase } from './supabase';
import { normalizeReactionEmoji } from './reactionEmoji';
import { runMemberRead } from './runMemberRead';
import type { ReactionEmoji } from '../types/database';

export type ReactionBreakdown = Record<string, number>;

export async function attachReactionFields<T extends { id: string }>(
  rows: T[],
  userId: string | undefined,
  signal?: AbortSignal,
): Promise<
  (T & { my_reactions: ReactionEmoji[]; reaction_breakdown: ReactionBreakdown })[]
> {
  if (rows.length === 0) return [];

  const ids = rows.slice(0, 50).map((row) => row.id);
  const { data } = await runMemberRead(
    supabase.rpc('get_post_reaction_summaries', { p_post_ids: ids }), signal,
  );
  const summaries = new Map((data ?? []).map((summary) => [summary.post_id, summary]));

  return rows.map((r) => ({
    ...r,
    reaction_breakdown: summaries.get(r.id)?.reaction_breakdown ?? {},
    my_reactions: userId
      ? (summaries.get(r.id)?.my_reactions ?? [])
          .map((emoji) => normalizeReactionEmoji(emoji))
          .filter((emoji): emoji is ReactionEmoji => Boolean(emoji))
      : [],
  }));
}
