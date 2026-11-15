import { groupNotificationItems } from '../../lib/notificationGrouping';
import type { NotificationCenterItem } from '../../lib/notificationCenterTypes';

describe('notification grouping', () => {
  it('filters dismissed comment-like sources before counting new names', () => {
    const like = (name: string, sortAt: string): NotificationCenterItem => ({ key: `comment_like:${name}`,
      kind: 'comment_like', post_id: 'p', comment_id: 'c', sortAt,
      actor: { display_name: name, username: name, avatar_url: null, equipped_border_key: null } });
    const old = '2026-11-15T12:00:00Z', recent = '2026-11-15T12:01:00Z';
    const source = [like('old', old), like('new', recent)];
    for (const [clear, dismissed] of [[null, new Map([['comment_likes:c', old]])], [old, new Map()]] as const) {
      expect(groupNotificationItems(source, clear, dismissed)).toEqual([expect.objectContaining({
        count: 1, actors: [expect.objectContaining({ username: 'new' })], sortAt: recent,
      })]);
    }
  });
  it.each(['friend_activity_group', 'reactions_group'] as const)('rejects a stale %s aggregate until its read reflects dismissal', kind => {
    const through = '2026-11-15T12:00:00Z';
    const stale = { key: 'group', kind, daily_event_id: 'day', post_id: 'post', emojis: [],
      count: 7, actors: [], sortAt: '2026-11-15T12:01:00Z' } as NotificationCenterItem;
    const dismissed = new Map([['group', through]]);
    expect(groupNotificationItems([stale], null, dismissed)).toEqual([]);
    const fresh = { ...stale, historyThrough: through, count: 1 };
    expect(groupNotificationItems([fresh], null, dismissed)).toEqual([fresh]);
    expect(groupNotificationItems([fresh], through)).toEqual([fresh]);
  });
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
