import type { NotificationCenterItem } from './notificationCenterTypes';
import { parseDate } from '../utils/time';

type DismissedNotifications = ReadonlyMap<string, string>;

export function isNotificationVisible(
  item: NotificationCenterItem,
  clearedAt: string | null,
  dismissed: DismissedNotifications,
): boolean {
  const itemTime = parseDate(item.sortAt).getTime();
  const dismissedAt = dismissed.get(item.key);
  if (dismissedAt && itemTime <= parseDate(dismissedAt).getTime()) return false;

  // Pending requests are actionable account state, not disposable history.
  if (item.kind === 'friend_request') return true;
  return !clearedAt || itemTime > parseDate(clearedAt).getTime();
}
