import type { AppColors } from '../constants/theme';

/** Reaction emoji strokes keyed to the active app theme (no fixed hex). */
export function reactionEmojiIconColors(colors: AppColors): Record<string, string> {
  return {
    fire: colors.primary,
    like: colors.link,
    laugh: colors.warning,
    wow: colors.accent,
    love: colors.error,
    dislike: colors.textTertiary,
  };
}
