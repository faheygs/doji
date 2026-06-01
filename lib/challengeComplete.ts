import { XP_REWARDS } from '../constants/theme';
import { useAuthStore } from '../stores/useAuthStore';
import type { ChallengeType } from '../types/database';

export type XpOverlayPayload = {
  amount: number;
  xp: number;
  level: number;
};

export function buildXpOverlayPayload(
  challengeType?: ChallengeType | string | null,
  xpReward?: number | null,
): XpOverlayPayload {
  const profile = useAuthStore.getState().profile;
  const amount =
    xpReward ??
    (challengeType === 'photo'
      ? XP_REWARDS.photo
      : challengeType === 'task'
        ? XP_REWARDS.task
        : challengeType === 'format'
          ? XP_REWARDS.format
          : XP_REWARDS.poll);

  return {
    amount,
    xp: (profile?.xp ?? 0) + amount,
    level: profile?.level ?? 1,
  };
}
