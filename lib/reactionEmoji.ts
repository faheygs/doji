import type { ReactionEmoji } from '@/types/database';

const LEGACY_MAP: Record<string, ReactionEmoji> = {
  dead: 'dislike',
  goat: 'like',
  love: 'heart',
};

/** Map legacy DB/UI keys to the current reaction set. */
export function normalizeReactionEmoji(value: string): ReactionEmoji | null {
  const mapped = LEGACY_MAP[value] ?? value;
  if (
    mapped === 'fire' ||
    mapped === 'like' ||
    mapped === 'dislike' ||
    mapped === 'laugh' ||
    mapped === 'wow' ||
    mapped === 'heart'
  ) {
    return mapped;
  }
  return null;
}
