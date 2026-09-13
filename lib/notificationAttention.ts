import { Platform } from 'react-native';
import type { NotificationAttentionReceipt } from '../types/database';
import type { NotificationCenterItem } from './notificationCenterTypes';

export type NotificationAttentionScope = Pick<
  NotificationAttentionReceipt,
  'scope_kind' | 'scope_id'
>;

export function attentionScopeForItem(
  item: NotificationCenterItem,
): NotificationAttentionScope | null {
  if (item.kind === 'friend_request') {
    return { scope_kind: 'friendship', scope_id: item.friendship.id };
  }
  if (item.kind === 'mention' || item.kind === 'comment_reply') {
    return { scope_kind: 'comment', scope_id: item.comment_id };
  }
  if (item.kind === 'suggestion_result') {
    return { scope_kind: 'suggestion', scope_id: item.suggestionId };
  }
  if (item.kind === 'challenge') {
    return { scope_kind: 'daily_event', scope_id: item.userEvent.daily_event_id };
  }
  return null;
}

export function attentionReceiptsForItems(
  items: readonly NotificationCenterItem[],
  seenAt = new Date().toISOString(),
): NotificationAttentionReceipt[] {
  const unique = new Map<string, NotificationAttentionReceipt>();
  for (const item of items) {
    const scope = attentionScopeForItem(item);
    if (!scope?.scope_id) continue;
    unique.set(`${scope.scope_kind}:${scope.scope_id}`, { ...scope, seen_at: seenAt });
  }
  return [...unique.values()];
}

export function attentionScopeFromPushData(data: unknown): NotificationAttentionScope | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const kind = record.notificationScopeKind;
  const id = record.notificationScopeId;
  if (
    (kind === 'daily_event' || kind === 'friendship' || kind === 'comment' ||
      kind === 'suggestion') &&
    typeof id === 'string' && id.length > 0
  ) {
    return { scope_kind: kind, scope_id: id };
  }
  return null;
}

/** Remove only OS notifications whose exact subject is now visible in Doji. */
export async function dismissPresentedNotificationsForReceipts(
  receipts: readonly NotificationAttentionReceipt[],
): Promise<void> {
  if (Platform.OS === 'web' || receipts.length === 0) return;
  const receiptKeys = new Set(
    receipts.map((receipt) => `${receipt.scope_kind}:${receipt.scope_id}`),
  );
  const Notifications = await import('expo-notifications');
  const presented = await Notifications.getPresentedNotificationsAsync();
  const matching = presented.filter((notification) => {
    const data = notification.request.content.data;
    if (!data || typeof data !== 'object') return false;
    const kind = (data as Record<string, unknown>).notificationScopeKind;
    const id = (data as Record<string, unknown>).notificationScopeId;
    return typeof kind === 'string' && typeof id === 'string' &&
      receiptKeys.has(`${kind}:${id}`);
  });
  await Promise.allSettled(
    matching.map((notification) =>
      Notifications.dismissNotificationAsync(notification.request.identifier)
    ),
  );
}
