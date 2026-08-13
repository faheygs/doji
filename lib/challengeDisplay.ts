import type { Challenge, ChallengeType } from '../types/database';

const BASE: Record<ChallengeType, string> = {
  photo: 'Photo',
  poll: 'Poll',
  task: 'Task',
  format: 'Format',
};

/** Shown where a username would be on feed cards (e.g. "Poll", "Would you rather"). */
export function challengeKindLabel(
  challenge: Pick<Challenge, 'type' | 'title' | 'poll_kind'> | null | undefined,
  fallbackType: ChallengeType = 'photo',
): string {
  const type = challenge?.type ?? fallbackType;
  if (isWouldYouRatherChallenge(challenge)) return 'Would you rather';
  return BASE[type];
}

/** Explicit metadata wins; title matching only supports records created before poll_kind existed. */
export function isWouldYouRatherChallenge(
  challenge: Pick<Challenge, 'type' | 'title' | 'poll_kind'> | null | undefined,
): boolean {
  if (challenge?.type !== 'poll') return false;
  if (challenge.poll_kind) return challenge.poll_kind === 'wyr';
  return challenge.title.toLowerCase().includes('would you rather');
}
