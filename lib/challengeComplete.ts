import { XP_REWARDS } from '../constants/theme';
import { sparksForXp } from '../constants/sparks';
import { useAuthStore } from '../stores/useAuthStore';
import type { ChallengeType } from '../types/database';

export type XpOverlayPayload = {
  amount: number;
  sparks: number;
  xp: number;
  level: number;
};

export function buildXpOverlayPayload(
  challengeType?: ChallengeType | string | null,
  xpReward?: number | null,
  options?: { fromBuyIn?: boolean },
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

  const baseSparks = sparksForXp(amount);
  const sparks = options?.fromBuyIn ? Math.max(1, Math.floor(baseSparks / 2)) : baseSparks;

  return {
    amount,
    sparks,
    xp: (profile?.xp ?? 0) + amount,
    level: profile?.level ?? 1,
  };
}
