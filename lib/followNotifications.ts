import type { Follow } from '../types/database';

/** True when a pending follow request was accepted (requester should be notified). */
export function isFollowAcceptNotification(follow: Pick<Follow, 'created_at' | 'accepted_at'>): boolean {
  if (!follow.accepted_at) return false;
  return new Date(follow.accepted_at).getTime() > new Date(follow.created_at).getTime() + 1000;
}

/** True when someone instantly followed a public account (followed user should be notified). */
export function isNewFollowerNotification(follow: Pick<Follow, 'status' | 'accepted_at'>): boolean {
  return follow.status === 'accepted' && follow.accepted_at == null;
}
