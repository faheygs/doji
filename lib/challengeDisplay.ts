import type { Challenge, ChallengeType } from '../types/database';

const BASE: Record<ChallengeType, string> = {
  photo: 'Photo',
  poll: 'Poll',
  task: 'Task',
  format: 'Format',
};

/** Shown where a username would be on feed cards (e.g. "Poll", "Would you rather"). */
export function challengeKindLabel(
  challenge: Pick<Challenge, 'type' | 'title'> | null | undefined,
  fallbackType: ChallengeType = 'photo',
): string {
  const type = challenge?.type ?? fallbackType;
  if (challenge?.type === 'poll') {
    const t = challenge.title.toLowerCase();
    if (t.includes('would you rather')) return 'Would you rather';
  }
  return BASE[type];
}
