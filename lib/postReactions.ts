import { supabase } from './supabase';
import { normalizeReactionEmoji } from './reactionEmoji';
import type { ReactionEmoji } from '../types/database';

export type ReactionBreakdown = Record<string, number>;

export async function attachReactionFields<T extends { id: string }>(
  rows: T[],
  userId: string | undefined,
  scopeUserIds?: string[],
  signal?: AbortSignal,
): Promise<
  (T & { my_reactions: ReactionEmoji[]; reaction_breakdown: ReactionBreakdown })[]
> {
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const scope =
    scopeUserIds && scopeUserIds.length > 0 ? new Set(scopeUserIds) : null;

  let query = supabase
    .from('reactions')
    .select('post_id, emoji, user_id')
    .in('post_id', ids);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;

  if (error) throw error;

  const breakdown = new Map<string, ReactionBreakdown>();
  const myMap = new Map<string, ReactionEmoji[]>();

  for (const id of ids) {
    breakdown.set(id, {});
    myMap.set(id, []);
  }

  for (const row of data ?? []) {
    const pid = row.post_id as string;
    const emoji = normalizeReactionEmoji(row.emoji as string);
    if (!emoji) continue;
    const uid = row.user_id as string;
    const inScope = !scope || scope.has(uid);

    if (inScope) {
      const b = { ...(breakdown.get(pid) ?? {}) };
      b[emoji] = (b[emoji] ?? 0) + 1;
      breakdown.set(pid, b);
    }

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
