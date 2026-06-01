import type { UserEvent, UserEventStatus } from '../types/database';
import { isExpired } from '../utils/time';

/** User completed today's challenge within the window — feed and posts are unlocked. */
export function hasUnlockedFeed(userEvent: UserEvent | null | undefined): boolean {
  return userEvent?.status === 'completed';
}

/** User can still submit (window open, not yet completed or missed). */
export function canSubmitChallenge(userEvent: UserEvent | null | undefined): boolean {
  if (!userEvent) return false;
  if (userEvent.status === 'completed' || userEvent.status === 'missed') return false;
  if (isExpired(userEvent.expires_at)) return false;
  return userEvent.status === 'pending';
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
    case 'pending':
      return 'Pending';
    default:
      return 'Unknown';
  }
}
