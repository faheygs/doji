import type { UserEvent, UserEventStatus } from '../types/database';
import { isExpired } from '../utils/time';
import { SPARKS_BUY_IN_COST } from '../constants/sparks';

/** User completed this Doji, including a paid late completion. */
export function hasUnlockedFeed(userEvent: UserEvent | null | undefined): boolean {
  return userEvent?.status === 'completed' || userEvent?.status === 'late';
}

export function isSignupDayGrace(userEvent: UserEvent | null | undefined): boolean {
  return userEvent?.signup_day_grace === true;
}

/** Pending window elapsed without completing (includes cron-normalized missed). */
export function isMissedOrExpiredPending(userEvent: UserEvent | null | undefined): boolean {
  if (!userEvent) return false;
  if (userEvent.status === 'missed') return true;
  if (userEvent.status === 'pending' && isExpired(userEvent.expires_at)) {
    return true;
  }
  return false;
}

/** User can still submit in the normal window or after a successful paid buy-in. */
export function canSubmitChallenge(userEvent: UserEvent | null | undefined): boolean {
  if (!userEvent) return false;
  if (userEvent.status === 'completed' || userEvent.status === 'missed') return false;
  if (userEvent.status === 'buy_in_open') return true;
  if (isExpired(userEvent.expires_at)) return false;
  if (userEvent.status === 'pending') {
    return true;
  }
  return false;
}

export function canBuyIn(userEvent: UserEvent | null | undefined): boolean {
  if (!userEvent || userEvent.buy_in_at != null) return false;
  if (isSignupDayGrace(userEvent)) return false;
  return isMissedOrExpiredPending(userEvent);
}

/** Signup-day participants retain their server-authorized free exception. */
export function showSignupDayGraceBanner(
  userEvent: UserEvent | null | undefined,
): boolean {
  if (!userEvent || !isSignupDayGrace(userEvent)) return false;
  return userEvent.status === 'pending' && !isExpired(userEvent.expires_at);
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
