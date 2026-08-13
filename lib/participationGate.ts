import type { Profile, UserEvent, UserEventStatus } from '../types/database';
import { isExpired } from '../utils/time';
import { SPARKS_BUY_IN_COST } from '../constants/sparks';
import { localDateKeyFromIso, localDateKeyFromDate } from './challengeDay';

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
    return !isSignupDayGrace(userEvent);
  }
  return false;
}

/** User can still submit (window open, buy-in open, or signup-day grace until EOD). */
export function canSubmitChallenge(userEvent: UserEvent | null | undefined): boolean {
  if (!userEvent) return false;
  if (userEvent.status === 'completed' || userEvent.status === 'missed') return false;
  if (isExpired(userEvent.expires_at)) return false;
  if (userEvent.status === 'buy_in_open') return true;
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

/** True when signup-day user can still complete for free until EOD. */
export function showSignupDayGraceBanner(
  userEvent: UserEvent | null | undefined,
  profile: Profile | null | undefined,
): boolean {
  if (!userEvent || !profile) return false;
  if (!isSignupDayGrace(userEvent)) return false;
  if (userEvent.status !== 'pending' && userEvent.status !== 'buy_in_open') return false;
  if (isExpired(userEvent.expires_at)) return false;
  const createdDay = localDateKeyFromIso(profile.created_at);
  const today = localDateKeyFromDate(new Date());
  return createdDay === today;
}
