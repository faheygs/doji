import { supabase } from './supabase';
import type { ReactionEmoji } from '../types/database';

export type ReactionBreakdown = Record<string, number>;

export async function attachReactionFields<T extends { id: string }>(
  rows: T[],
  userId: string | undefined,
): Promise<
  (T & { my_reactions: ReactionEmoji[]; reaction_breakdown: ReactionBreakdown })[]
> {
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);

  const { data, error } = await supabase
    .from('reactions')
    .select('post_id, emoji, user_id')
    .in('post_id', ids);

  if (error) throw error;

  const breakdown = new Map<string, ReactionBreakdown>();
  const myMap = new Map<string, ReactionEmoji[]>();

  for (const id of ids) {
    breakdown.set(id, {});
    myMap.set(id, []);
  }

  for (const row of data ?? []) {
    const pid = row.post_id as string;
    const emoji = row.emoji as ReactionEmoji;
    const uid = row.user_id as string;
    const b = { ...(breakdown.get(pid) ?? {}) };
    b[emoji] = (b[emoji] ?? 0) + 1;
    breakdown.set(pid, b);
    if (userId && uid === userId) {
      const arr = myMap.get(pid) ?? [];
      if (!arr.includes(emoji)) arr.push(emoji);
      myMap.set(pid, arr);
    }
  }

  return rows.map((r) => ({
    ...r,
    reaction_breakdown: breakdown.get(r.id) ?? {},
    my_reactions: userId ? (myMap.get(r.id) ?? []) : [],
  }));
}
