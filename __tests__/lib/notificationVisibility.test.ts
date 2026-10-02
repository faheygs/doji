import { isNotificationVisible, isNotificationUnread } from '../../lib/notificationVisibility';
import type { NotificationCenterItem } from '../../lib/notificationCenterTypes';

const comment = (sortAt: string): NotificationCenterItem => ({
  key: 'comment:1',
  kind: 'comment',
  post_id: 'post-1',
  comment_id: 'comment-1',
  actor: null,
  sortAt,
});

describe('notification visibility', () => {
  const prelive: NotificationCenterItem = {
    key: 'challenge:event-1',
    kind: 'challenge',
    sortAt: '2026-09-26T18:26:00Z',
    userEvent: {
      id: 'event-1', user_id: 'member-1', daily_event_id: 'daily-1',
      status: 'pending', notified_at: null, completed_at: null,
      expires_at: '2026-09-26T18:36:00Z', buy_in_at: null,
      streak_before_miss: null, created_at: '2026-09-26T18:06:00Z',
      daily_event: {
        id: 'daily-1', challenge_id: 'challenge-1',
        fires_at: '2026-09-26T18:26:00Z', window_minutes: 10,
        push_sent_at: null, created_at: '2026-09-25T18:36:00Z',
        prelive_at: '2026-09-26T18:06:00Z', activated_at: null,
      },
    },
  };
  const clearedAt = '2026-09-26T18:20:00Z';

  it('opening the pre-live notice clears unread until server activation', () => {
    expect(isNotificationUnread(prelive, null)).toBe(true);
    expect(isNotificationUnread(prelive, '2026-09-26T18:05:00Z')).toBe(true);
    expect(isNotificationUnread(prelive, clearedAt)).toBe(false);
    if (prelive.kind !== 'challenge') throw new Error('Invalid fixture');
    const live: NotificationCenterItem = { ...prelive, userEvent: { ...prelive.userEvent,
      daily_event: { ...prelive.userEvent.daily_event!, activated_at: '2026-09-26T18:26:02Z' } } };
    expect(isNotificationUnread(live, clearedAt)).toBe(true);
    expect(isNotificationUnread(live, '2026-09-26T18:27:00Z')).toBe(false);
  });

  it('keeps the existing pre-live notice until the member clears it', () => {
    expect(isNotificationVisible(prelive, null, new Map())).toBe(true);
    expect(isNotificationVisible(prelive, '2026-09-26T18:05:00Z', new Map())).toBe(true);
  });

  it('clears the pre-live notice even with six minutes remaining', () => {
    expect(isNotificationVisible(prelive, clearedAt, new Map())).toBe(false);
  });

  it('individually dismisses the pre-live notice with a persisted receipt', () => {
    const dismissed = new Map([[prelive.key, clearedAt]]);
    expect(isNotificationVisible(prelive, null, dismissed)).toBe(false);
    const restored = JSON.parse(JSON.stringify(prelive)) as NotificationCenterItem;
    expect(isNotificationVisible(restored, null, new Map(dismissed))).toBe(false);
  });

  it('allows the later server-confirmed live phase after pre-live dismissal or clear', () => {
    if (prelive.kind !== 'challenge') throw new Error('Invalid fixture');
    const live: NotificationCenterItem = {
      ...prelive,
      userEvent: { ...prelive.userEvent, daily_event: {
        ...prelive.userEvent.daily_event!, activated_at: '2026-09-26T18:26:02Z',
      } },
    };
    expect(isNotificationVisible(live, clearedAt, new Map([[live.key, clearedAt]]))).toBe(true);
    // A delayed activation is new activity even if history was cleared after fires_at.
    expect(isNotificationVisible(live, '2026-09-26T18:26:01Z', new Map())).toBe(true);
    const afterActivation = '2026-09-26T18:27:00Z';
    expect(isNotificationVisible(live, afterActivation, new Map())).toBe(false);
    expect(isNotificationVisible(live, null, new Map([[live.key, afterActivation]]))).toBe(false);
    // Display/countdown time remains the scheduled start, not rewritten by dismissal.
    expect(live.sortAt).toBe(prelive.sortAt);
  });

  it('preserves legacy payload behavior when phase timestamps are absent', () => {
    if (prelive.kind !== 'challenge') throw new Error('Invalid fixture');
    const legacy: NotificationCenterItem = {
      ...prelive, userEvent: { ...prelive.userEvent, daily_event: undefined },
    };
    expect(isNotificationVisible(legacy, '2026-09-26T18:27:00Z', new Map())).toBe(false);
    expect(isNotificationVisible(legacy, clearedAt, new Map())).toBe(true);
  });

  it('hides cached history immediately after clear', () => {
    expect(isNotificationVisible(comment('2026-08-12T10:00:00Z'), '2026-08-12T10:01:00Z', new Map())).toBe(false);
  });

  it('keeps notifications created after clear', () => {
    expect(isNotificationVisible(comment('2026-08-12T10:02:00Z'), '2026-08-12T10:01:00Z', new Map())).toBe(true);
  });

  it('keeps pending friend requests when history is cleared', () => {
    const request = {
      key: 'friend-request:1',
      kind: 'friend_request',
      friendship: {},
      sortAt: '2026-08-12T10:00:00Z',
    } as NotificationCenterItem;
    expect(isNotificationVisible(request, '2026-08-12T10:01:00Z', new Map())).toBe(true);
  });

  it('hides individually dismissed items', () => {
    const dismissed = new Map([['comment:1', '2026-08-12T10:01:00Z']]);
    expect(isNotificationVisible(comment('2026-08-12T10:00:00Z'), null, dismissed)).toBe(false);
  });
});
