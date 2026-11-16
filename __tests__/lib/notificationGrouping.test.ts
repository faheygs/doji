import { groupNotificationItems } from '../../lib/notificationGrouping';
import type { NotificationCenterItem } from '../../lib/notificationCenterTypes';

describe('notification grouping', () => {
  const comment = (id: string, username: string | null, sortAt = '2026-11-16T01:44:20.298844Z', post_id = 'post'): NotificationCenterItem => ({
    key: `comment:${id}`, kind: 'comment', post_id, comment_id: id, sortAt,
    actor: username ? { username, display_name: 'Same display name', avatar_url: null, equipped_border_key: null } : null,
  });
  it('groups the three-person burst by post, with unique actors and exact source receipts', () => {
    const source = [comment('1', 'one'), comment('2', 'two'), comment('3', 'three'), comment('4', 'three')];
    const result = groupNotificationItems([...source, source[0]]);
    expect(result).toEqual([expect.objectContaining({ key: 'comments_post:post', kind: 'comments_group',
      count: 3, comment_id: '4', sources: expect.any(Array) })]);
    const group = result[0];
    if (group.kind !== 'comments_group') throw new Error('Expected comment group');
    expect(group.actors.map(actor => actor.username)).toEqual(['three', 'two', 'one']);
    expect(group.sources.map(item => item.key)).toEqual(['comment:4', 'comment:3', 'comment:2', 'comment:1']);
    expect(source.map(item => item.key)).toEqual(['comment:1', 'comment:2', 'comment:3', 'comment:4']);
  });
  it('keeps different posts, mentions, replies and unknown actors separate', () => {
    const other = comment('other', 'one', undefined, 'other-post');
    const mention = { ...comment('mention', 'one'), kind: 'mention' } as NotificationCenterItem;
    const reply = { ...comment('reply', 'one'), kind: 'comment_reply' } as NotificationCenterItem;
    const unknown = comment('unknown', null);
    expect(groupNotificationItems([comment('1', 'one'), comment('2', 'two'), other, mention, reply, unknown]))
      .toEqual(expect.arrayContaining([other, mention, reply, unknown, expect.objectContaining({ kind: 'comments_group', count: 2 })]));
  });
  it('filters acknowledged sources before grouping, including sub-millisecond arrivals and same actors', () => {
    const old = '2026-11-16T01:44:20.298844Z', fresh = '2026-11-16T01:44:20.298845Z';
    const source = [comment('1', 'one', old), comment('2', 'two', old), comment('3', 'one', fresh)];
    const dismissed = new Map([['comment:1', old], ['comment:2', old]]);
    expect(groupNotificationItems(source, null, dismissed)).toEqual([source[2]]);
    expect(groupNotificationItems(source, old)).toEqual([source[2]]);
    expect(groupNotificationItems([source[0], source[2]])).toEqual([expect.objectContaining({ count: 1, comment_id: '3', sortAt: fresh })]);
  });
  it('preserves shared-poll context and does not hide historical activity merely because it was viewed', () => {
    const source = [comment('1', 'one'), comment('2', 'two')].map(item => ({ ...item, is_shared_post: true }));
    expect(groupNotificationItems(source)).toEqual([expect.objectContaining({ is_shared_post: true, count: 2 })]);
    expect(groupNotificationItems([source[0], source[0]])).toEqual([source[0]]);
  });
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
