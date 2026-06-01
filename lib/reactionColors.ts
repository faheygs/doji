import type { AppColors } from '../constants/theme';

/** Reaction icon fill colors keyed to the active app theme. */
export function reactionEmojiIconColors(colors: AppColors): Record<string, string> {
  return {
    fire: colors.primary,
    like: colors.success,
    dislike: colors.textTertiary,
    laugh: colors.warning,
    wow: colors.accent,
    heart: colors.error,
  };
}
