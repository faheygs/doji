import type { NotificationCenterItem } from './notificationCenterTypes';
import { parseDate } from '../utils/time';

type DismissedNotifications = ReadonlyMap<string, string>;

export function notificationActivityTime(item: NotificationCenterItem): number {
  // Challenge sortAt is the scheduled start (also used by the countdown), not
  // when its current notice was issued. Comparing a pre-live dismissal with
  // that future time makes both Clear and Dismiss appear to do nothing.
  // Keep the display time intact and use the server-owned phase receipt instead.
  // Activation advances the same item's activity time, so clearing pre-live
  // never suppresses the later live notice. Old payloads retain their contract.
  const dailyEvent = item.kind === 'challenge' ? item.userEvent.daily_event : undefined;
  const phaseAt = dailyEvent?.activated_at ?? dailyEvent?.prelive_at;
  const phaseTime = phaseAt ? parseDate(phaseAt).getTime() : NaN;
  return Number.isFinite(phaseTime) ? phaseTime : parseDate(item.sortAt).getTime();
}

export function isNotificationUnread(item: NotificationCenterItem, openedAt: string | null): boolean {
  return notificationActivityTime(item) > (openedAt ? parseDate(openedAt).getTime() : 0);
}

export function isNotificationVisible(
  item: NotificationCenterItem,
  clearedAt: string | null,
  dismissed: DismissedNotifications,
): boolean {
  const itemTime = notificationActivityTime(item);
  const dismissedAt = dismissed.get(item.key);
  if (dismissedAt && itemTime <= parseDate(dismissedAt).getTime()) return false;

  // Pending requests are actionable account state, not disposable history.
  if (item.kind === 'friend_request') return true;
  return !clearedAt || itemTime > parseDate(clearedAt).getTime();
}
