import { Platform } from 'react-native';
import type { NotificationAttentionReceipt } from '../types/database';
import type { NotificationCenterItem } from './notificationCenterTypes';

export type NotificationAttentionScope = Pick<
  NotificationAttentionReceipt,
  'scope_kind' | 'scope_id'
>;
type ObservedReceipt = NotificationAttentionReceipt & { observed_through?: string };

/** A notification tap acknowledges its snapshot, never later unseen activity. */
export function attentionReceiptFromPushData(data: unknown, seenAt = new Date().toISOString()): ObservedReceipt | null {
  const scope = attentionScopeFromPushData(data);
  if (!scope) return null;
  if (scope.scope_kind !== 'daily_event') return { ...scope, seen_at: seenAt };
  const through = (data as Record<string, unknown>).notificationObservedThrough;
  if (typeof through !== 'string' || !Number.isFinite(Date.parse(through))) return null;
  return { ...scope, seen_at: seenAt, observed_through: through };
}

export function attentionScopeForItem(
  item: NotificationCenterItem,
): NotificationAttentionScope | null {
  if (item.kind === 'friend_request') {
    return { scope_kind: 'friendship', scope_id: item.friendship.id };
  }
  if (item.kind === 'mention' || item.kind === 'comment_reply' || item.kind === 'comment') {
    return { scope_kind: 'comment', scope_id: item.comment_id };
  }
  if (item.kind === 'friend_activity_group') {
    return { scope_kind: 'daily_event', scope_id: item.daily_event_id };
  }
  if (item.kind === 'suggestion_result') {
    return { scope_kind: 'suggestion', scope_id: item.suggestionId };
  }
  if (item.kind === 'challenge') {
    return { scope_kind: 'daily_event', scope_id: item.userEvent.daily_event_id };
  }
  if (item.kind === 'moderation_notice') {
    return { scope_kind: 'moderation_decision', scope_id: item.decision_id };
  }
  return null;
}

export function attentionReceiptsForItems(
  items: readonly NotificationCenterItem[],
  seenAt = new Date().toISOString(),
): ObservedReceipt[] {
  const unique = new Map<string, ObservedReceipt>();
  for (const item of items) {
    if (item.kind === 'comments_group') {
      for (const source of item.sources) {
        unique.set(`comment:${source.comment_id}`, {
          scope_kind: 'comment', scope_id: source.comment_id, seen_at: seenAt,
        });
      }
      continue;
    }
    const scope = attentionScopeForItem(item);
    if (!scope?.scope_id) continue;
    const key = `${scope.scope_kind}:${scope.scope_id}`;
    if (scope.scope_kind === 'daily_event') {
      if (!Number.isFinite(Date.parse(item.sortAt))) continue;
      const previous = unique.get(key)?.observed_through;
      if (previous && Date.parse(previous) >= Date.parse(item.sortAt)) continue;
      unique.set(key, { ...scope, seen_at: seenAt, observed_through: item.sortAt });
    } else unique.set(key, { ...scope, seen_at: seenAt });
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
      kind === 'suggestion' || kind === 'moderation_decision') &&
    typeof id === 'string' && id.length > 0
  ) {
    return { scope_kind: kind, scope_id: id };
  }
  return null;
}

/** Remove only OS notifications whose exact subject is now visible in Doji. */
export async function dismissPresentedNotificationsForReceipts(
  receipts: readonly ObservedReceipt[],
): Promise<void> {
  if (Platform.OS === 'web' || receipts.length === 0) return;
  const receiptKeys = new Map(
    receipts.map((receipt) => [`${receipt.scope_kind}:${receipt.scope_id}`, receipt]),
  );
  const Notifications = await import('expo-notifications');
  const presented = await Notifications.getPresentedNotificationsAsync();
  const matching = presented.filter((notification) => {
    const data = notification.request.content.data;
    if (!data || typeof data !== 'object') return false;
    const kind = (data as Record<string, unknown>).notificationScopeKind;
    const id = (data as Record<string, unknown>).notificationScopeId;
    if (typeof kind !== 'string' || typeof id !== 'string') return false;
    const receipt = receiptKeys.get(`${kind}:${id}`);
    if (!receipt) return false;
    if (kind !== 'daily_event') return true;
    const through = (data as Record<string, unknown>).notificationObservedThrough;
    return typeof through === 'string' && !!receipt.observed_through &&
      Date.parse(through) <= Date.parse(receipt.observed_through);
  });
  await Promise.allSettled(
    matching.map((notification) =>
      Notifications.dismissNotificationAsync(notification.request.identifier)
    ),
  );
}
