import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  attentionScopeForItem,
  attentionReceiptsForItems,
  attentionScopeFromPushData,
  dismissPresentedNotificationsForReceipts,
} from '../../lib/notificationAttention';
import type { NotificationCenterItem } from '../../lib/notificationCenterTypes';
import type { NotificationAttentionReceipt } from '../../types/database';
jest.mock('expo-notifications', () => ({
  getPresentedNotificationsAsync: jest.fn(),
  dismissNotificationAsync: jest.fn(),
}));
const originalPlatform = Platform.OS;
const receipt: NotificationAttentionReceipt = {
  scope_kind: 'comment',
  scope_id: 'same-id',
  seen_at: '2026-10-01T12:00:00.000Z',
};
beforeEach(() => {
  jest.resetAllMocks();
  Platform.OS = 'ios';
  jest.mocked(Notifications.dismissNotificationAsync).mockResolvedValue();
});
afterEach(() => {
  Platform.OS = originalPlatform;
  jest.useRealTimers();
});

test.each([
  [
    { kind: 'friend_request', friendship: { id: 'friend' } },
    { scope_kind: 'friendship', scope_id: 'friend' },
  ],
  [
    { kind: 'suggestion_result', suggestionId: 'idea' },
    { scope_kind: 'suggestion', scope_id: 'idea' },
  ],
  [
    { kind: 'comment_reply', comment_id: 'reply' },
    { scope_kind: 'comment', scope_id: 'reply' },
  ],
])('maps attention only to the exact notification subject: %j', (item, scope) => {
  // Only the discriminant and subject are consumed; full display data belongs to UI tests.
  expect(attentionScopeForItem(item as NotificationCenterItem)).toEqual(scope);
});
test('visible duplicate subjects produce one timestamped receipt; empty IDs are skipped', () => {
  jest.useFakeTimers().setSystemTime(new Date(receipt.seen_at));
  const items = [
    { kind: 'mention', comment_id: 'same-id' },
    { kind: 'comment_reply', comment_id: 'same-id' },
    { kind: 'comment_reply', comment_id: '' },
    { kind: 'friend_request', friendship: { id: 'same-id' } },
  ] as NotificationCenterItem[];
  expect(attentionReceiptsForItems(items)).toEqual([
    receipt,
    { ...receipt, scope_kind: 'friendship' },
  ]);
});
test.each(['daily_event', 'friendship', 'comment', 'suggestion', 'moderation_decision'])(
  'allows push scope %s with a nonempty string ID',
  (kind) => {
    expect(
      attentionScopeFromPushData({ notificationScopeKind: kind, notificationScopeId: 'exact-id' }),
    ).toEqual({ scope_kind: kind, scope_id: 'exact-id' });
  },
);
test.each([
  null,
  false,
  'comment',
  {},
  [],
  { notificationScopeKind: 'comment', notificationScopeId: '' },
  { notificationScopeKind: 'comment', notificationScopeId: 7 },
  { notificationScopeKind: 'post', notificationScopeId: 'id' },
])('rejects invalid push scope %j', (data) => {
  expect(attentionScopeFromPushData(data)).toBeNull();
});
test('web and empty receipts never inspect native notification trays', async () => {
  await dismissPresentedNotificationsForReceipts([]);
  Platform.OS = 'web';
  await dismissPresentedNotificationsForReceipts([receipt]);
  expect(Notifications.getPresentedNotificationsAsync).not.toHaveBeenCalled();
});
test('dismisses exact scope/ID matches only, even when one OS dismissal fails', async () => {
  const presented = [
    ['match-1', { notificationScopeKind: 'comment', notificationScopeId: 'same-id' }],
    ['match-2', { notificationScopeKind: 'comment', notificationScopeId: 'same-id' }],
    ['other-scope', { notificationScopeKind: 'friendship', notificationScopeId: 'same-id' }],
    ['other-id', { notificationScopeKind: 'comment', notificationScopeId: 'other-id' }],
    ['null', null],
    ['scalar', 'comment'],
    ['invalid', { notificationScopeKind: 4, notificationScopeId: 'same-id' }],
    ['invalid-id', { notificationScopeKind: 'comment', notificationScopeId: 5 }],
  ].map(([identifier, data]) => ({ request: { identifier, content: { data } } }));
  // Synthetic malformed native records exercise the defensive runtime boundary.
  (Notifications.getPresentedNotificationsAsync as jest.Mock).mockResolvedValue(presented);
  jest
    .mocked(Notifications.dismissNotificationAsync)
    .mockRejectedValueOnce(Error('already removed'));
  await expect(dismissPresentedNotificationsForReceipts([receipt])).resolves.toBeUndefined();
  expect(Notifications.dismissNotificationAsync).toHaveBeenCalledTimes(2);
  expect(Notifications.dismissNotificationAsync).toHaveBeenNthCalledWith(1, 'match-1');
  expect(Notifications.dismissNotificationAsync).toHaveBeenNthCalledWith(2, 'match-2');
});
test('tray read failure propagates without attempting a broad dismissal', async () => {
  const error = Error('native tray unavailable');
  jest.mocked(Notifications.getPresentedNotificationsAsync).mockRejectedValueOnce(error);
  await expect(dismissPresentedNotificationsForReceipts([receipt])).rejects.toBe(error);
  expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalled();
});
