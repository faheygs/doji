import { groupNotificationItems } from '../../lib/notificationGrouping';
import type { NotificationCenterItem } from '../../lib/notificationCenterTypes';

describe('notification grouping', () => {
  it('groups comment likes by comment before visibility and dismissal', () => {
    const items: NotificationCenterItem[] = [
      { key: 'comment_like:1', kind: 'comment_like', post_id: 'p', comment_id: 'c',
        actor: { display_name: 'Kira', username: 'kira', avatar_url: null, equipped_border_key: null },
        sortAt: '2026-08-18T10:00:00Z' },
      { key: 'comment_like:2', kind: 'comment_like', post_id: 'p', comment_id: 'c',
        actor: { display_name: 'Todd', username: 'todd', avatar_url: null, equipped_border_key: null },
        sortAt: '2026-08-18T10:01:00Z' },
    ];
    expect(groupNotificationItems(items)).toEqual([expect.objectContaining({
      key: 'comment_likes:c', kind: 'comment_likes_group', count: 2,
      sortAt: '2026-08-18T10:01:00Z',
    })]);
  });
});
