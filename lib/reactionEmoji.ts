import type { ReactionEmoji } from '@/types/database';

const PREVIOUS_REACTION_KEYS: Record<string, ReactionEmoji> = {
  dead: 'dislike',
  goat: 'like',
  love: 'heart',
};

/** Normalize reaction keys written by currently supported and earlier app builds. */
export function normalizeReactionEmoji(value: string): ReactionEmoji | null {
  const mapped = PREVIOUS_REACTION_KEYS[value] ?? value;
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
