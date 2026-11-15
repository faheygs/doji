import type { NotificationCenterItem } from './notificationCenterTypes';
import { parseDate } from '../utils/time';

type DismissedNotifications = ReadonlyMap<string, string>;

/** PostgreSQL receipts carry microseconds; Date alone rounds distinct events together. */
export function compareNotificationTimes(a: string, b: string): number {
  const milliseconds = Date.parse(a) - Date.parse(b);
  if (milliseconds !== 0) return milliseconds;
  const fraction = (value: string) => Number((value.match(/\.(\d+)(?:Z|[+-]\d{2}:?\d{2})$/i)?.[1] ?? '').padEnd(6, '0').slice(3, 6));
  return fraction(a) - fraction(b);
}

export function notificationActivityTime(item: NotificationCenterItem): number {
  return parseDate(notificationActivityTimestamp(item)).getTime();
}

/** Preserve the server's sub-millisecond timestamp in durable acknowledgements. */
export function notificationActivityTimestamp(item: NotificationCenterItem): string {
  // Challenge sortAt is the scheduled start (also used by the countdown), not
  // when its current notice was issued. Comparing a pre-live dismissal with
  // that future time makes both Clear and Dismiss appear to do nothing.
  // Keep the display time intact and use the server-owned phase receipt instead.
  // Activation advances the same item's activity time, so clearing pre-live
  // never suppresses the later live notice. Old payloads retain their contract.
  const dailyEvent = item.kind === 'challenge' ? item.userEvent.daily_event : undefined;
  const phaseAt = dailyEvent?.activated_at ?? dailyEvent?.prelive_at;
  const phaseTime = phaseAt ? parseDate(phaseAt).getTime() : NaN;
  return Number.isFinite(phaseTime) ? phaseAt! : item.sortAt;
}

export function newestNotificationTimestamp(items: readonly NotificationCenterItem[]): string | null {
  let newest: string | null = null;
  for (const item of items) {
    const at = notificationActivityTimestamp(item);
    if (Number.isFinite(Date.parse(at)) && (!newest || compareNotificationTimes(at, newest) > 0)) newest = at;
  }
  return newest;
}

export function isNotificationUnread(item: NotificationCenterItem, openedAt: string | null): boolean {
  return compareNotificationTimes(notificationActivityTimestamp(item), openedAt ?? '1970-01-01T00:00:00Z') > 0;
}

export function isNotificationVisible(
  item: NotificationCenterItem,
  clearedAt: string | null,
  dismissed: DismissedNotifications,
): boolean {
  const itemTime = notificationActivityTimestamp(item);
  const dismissedAt = dismissed.get(item.key);
  if (dismissedAt && compareNotificationTimes(itemTime, dismissedAt) <= 0) return false;

  // Pending requests are actionable account state, not disposable history.
  if (item.kind === 'friend_request') return true;
  return !clearedAt || compareNotificationTimes(itemTime, clearedAt) > 0;
}
