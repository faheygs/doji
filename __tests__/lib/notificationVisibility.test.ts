import { isNotificationVisible } from '../../lib/notificationVisibility';
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
