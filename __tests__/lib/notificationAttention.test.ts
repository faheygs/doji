import {
  attentionReceiptsForItems,
  attentionScopeForItem,
  attentionScopeFromPushData,
} from '../../lib/notificationAttention';
import type { NotificationCenterItem } from '../../lib/notificationCenterTypes';

describe('notification attention receipts', () => {
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

  it('reads the exact subject from a push response', () => {
    expect(attentionScopeFromPushData({
      notificationScopeKind: 'friendship',
      notificationScopeId: 'friendship-1',
    })).toEqual({ scope_kind: 'friendship', scope_id: 'friendship-1' });
    expect(attentionScopeFromPushData({
      notificationScopeKind: 'post',
      notificationScopeId: 'post-1',
    })).toBeNull();
  });
});
