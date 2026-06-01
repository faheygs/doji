import type { UserEvent, UserEventStatus } from '../types/database';
import { isExpired } from '../utils/time';
import { SPARKS_BUY_IN_COST } from '../constants/sparks';

/** User completed today's challenge within the window — feed and posts are unlocked. */
export function hasUnlockedFeed(userEvent: UserEvent | null | undefined): boolean {
  return userEvent?.status === 'completed';
}

/** User can still submit (window open, not yet completed or missed). */
export function canSubmitChallenge(userEvent: UserEvent | null | undefined): boolean {
  if (!userEvent) return false;
  if (userEvent.status === 'completed' || userEvent.status === 'missed') return false;
  if (isExpired(userEvent.expires_at)) return false;
  return userEvent.status === 'pending' || userEvent.status === 'buy_in_open';
}

export function canBuyIn(userEvent: UserEvent | null | undefined): boolean {
  if (!userEvent) return false;
  return userEvent.status === 'missed' && userEvent.buy_in_at == null;
}

export function canAffordBuyIn(sparks: number): boolean {
  return sparks >= SPARKS_BUY_IN_COST;
}

export function isParticipationLocked(userEvent: UserEvent | null | undefined): boolean {
  if (!userEvent) return true;
  return !hasUnlockedFeed(userEvent);
}

export function userEventStatusLabel(status: UserEventStatus | undefined): string {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'missed':
      return 'Missed';
    case 'late':
      return 'Late';
    case 'buy_in_open':
      return 'Buy-in open';
    case 'pending':
      return 'Pending';
    default:
      return 'Unknown';
  }
}
