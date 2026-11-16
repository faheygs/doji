import {
  attentionReceiptsForItems,
  attentionScopeForItem,
  attentionScopeFromPushData,
  attentionReceiptFromPushData,
} from '../../lib/notificationAttention';
import type { NotificationCenterItem } from '../../lib/notificationCenterTypes';

describe('notification attention receipts', () => {
  it('marks every displayed grouped comment seen, not only its leading actor or latest comment', () => {
    const group: NotificationCenterItem = { key: 'comments_post:p', kind: 'comments_group', post_id: 'p',
      comment_id: 'c3', actors: [], count: 2, sortAt: '2026-11-16T01:00:00Z',
      sources: ['c1', 'c2', 'c3'].map(id => ({ key: `comment:${id}`, comment_id: id, sortAt: '2026-11-16T01:00:00Z' })) };
    expect(attentionReceiptsForItems([group, group], '2026-11-16T01:01:00Z')).toEqual(
      ['c1', 'c2', 'c3'].map(id => ({ scope_kind: 'comment', scope_id: id, seen_at: '2026-11-16T01:01:00Z' })),
    );
    expect(attentionScopeForItem(group)).toBeNull(); // No guessed single subject for a multi-source row.
  });
  it('acknowledges the displayed daily snapshot instead of newer unseen activity', () => {
    const through = '2026-11-15T12:00:00Z';
    const now = '2026-11-15T12:02:00Z';
    const data = { notificationScopeKind: 'daily_event', notificationScopeId: 'day', notificationObservedThrough: through };
    expect(attentionReceiptFromPushData(data, now)).toEqual({ scope_kind: 'daily_event', scope_id: 'day', seen_at: now, observed_through: through });
    expect(attentionReceiptFromPushData({ ...data, notificationObservedThrough: undefined }, now)).toBeNull();
    expect(attentionReceiptFromPushData({ ...data, notificationObservedThrough: 'invalid' }, now)).toBeNull();
    expect(attentionReceiptFromPushData(null, now)).toBeNull();
    expect(attentionReceiptFromPushData({ notificationScopeKind: 'comment', notificationScopeId: 'comment' }, now))
      .toEqual({ scope_kind: 'comment', scope_id: 'comment', seen_at: now });
  });
  it('coalesces only the newest visible friend-activity snapshot', () => {
    const make = (sortAt: string) => ({ key: sortAt, kind: 'friend_activity_group', daily_event_id: 'day', count: 1, actors: [], sortAt }) as NotificationCenterItem;
    expect(attentionReceiptsForItems([make('invalid'), make('2026-11-15T12:01:00Z'), make('2026-11-15T12:00:00Z')], '2026-11-15T12:02:00Z'))
      .toEqual([{ scope_kind: 'daily_event', scope_id: 'day', seen_at: '2026-11-15T12:02:00Z', observed_through: '2026-11-15T12:01:00Z' }]);
  });
  it('records only phone-alert subjects that were actually visible', () => {
    const items = [
      {
        key: 'mention:1', kind: 'mention', post_id: 'post-1',
        comment_id: 'comment-1', actor: null, sortAt: '2026-09-09T12:00:00Z',
      },
      {
        key: 'reaction:1', kind: 'reactions_group', post_id: 'post-1',
        count: 1, emojis: ['heart'], actors: [], sortAt: '2026-09-09T12:00:00Z',
      },
    ] as NotificationCenterItem[];

    expect(attentionReceiptsForItems(items, '2026-09-09T12:01:00Z')).toEqual([{
      scope_kind: 'comment',
      scope_id: 'comment-1',
      seen_at: '2026-09-09T12:01:00Z',
    }]);
  });

  it('maps a challenge to its daily event', () => {
    const item = {
      kind: 'challenge',
      userEvent: { daily_event_id: 'daily-1' },
    } as NotificationCenterItem;
    expect(attentionScopeForItem(item)).toEqual({
      scope_kind: 'daily_event',
      scope_id: 'daily-1',
    });
  });

  it('maps a moderation notice to its private decision', () => {
    const item = {
      kind: 'moderation_notice',
      decision_id: 'decision-1',
    } as NotificationCenterItem;
    expect(attentionScopeForItem(item)).toEqual({
      scope_kind: 'moderation_decision',
      scope_id: 'decision-1',
    });
  });

  it('reads the exact subject from a push response', () => {
    expect(attentionScopeFromPushData({
      notificationScopeKind: 'friendship',
      notificationScopeId: 'friendship-1',
    })).toEqual({ scope_kind: 'friendship', scope_id: 'friendship-1' });
    expect(attentionScopeFromPushData({
      notificationScopeKind: 'post',
      notificationScopeId: 'post-1',
    })).toBeNull();
    expect(attentionScopeFromPushData({
      notificationScopeKind: 'moderation_decision',
      notificationScopeId: 'decision-1',
    })).toEqual({ scope_kind: 'moderation_decision', scope_id: 'decision-1' });
  });
});
