import { buildRows } from '../../components/feed/PostCommentsThread';
import type { CommentWithMeta } from '../../hooks/useComments';

function makeComment(overrides: Partial<CommentWithMeta> & { id: string }): CommentWithMeta {
  return {
    id: overrides.id,
    post_id: 'post-1',
    user_id: 'user-1',
    body: 'test comment',
    parent_id: null,
    like_count: 0,
    body_edited: false,
    created_at: '2026-06-04T10:00:00Z',
    updated_at: null,
    my_like: false,
    profile: undefined,
    ...overrides,
  } as CommentWithMeta;
}

describe('buildRows — collapsible replies', () => {
  it('root comment with no replies produces only a root row', () => {
    const comments = [makeComment({ id: 'c1' })];
    const rows = buildRows(comments, new Set());
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('root');
  });

  it('root comment with replies produces root + toggle row (collapsed by default)', () => {
    const comments = [
      makeComment({ id: 'c1' }),
      makeComment({ id: 'r1', parent_id: 'c1' }),
      makeComment({ id: 'r2', parent_id: 'c1' }),
    ];
    const rows = buildRows(comments, new Set());
    expect(rows).toHaveLength(2);
    expect(rows[0].kind).toBe('root');
    expect(rows[1].kind).toBe('toggle');
    if (rows[1].kind === 'toggle') {
      expect(rows[1].replyCount).toBe(2);
      expect(rows[1].expanded).toBe(false);
      expect(rows[1].parentId).toBe('c1');
    }
  });

  it('replies are NOT included when collapsed', () => {
    const comments = [
      makeComment({ id: 'c1' }),
      makeComment({ id: 'r1', parent_id: 'c1' }),
    ];
    const rows = buildRows(comments, new Set());
    const replyRows = rows.filter((r) => r.kind === 'reply');
    expect(replyRows).toHaveLength(0);
  });

  it('replies ARE included when expanded', () => {
    const comments = [
      makeComment({ id: 'c1' }),
      makeComment({ id: 'r1', parent_id: 'c1' }),
      makeComment({ id: 'r2', parent_id: 'c1' }),
    ];
    const expanded = new Set(['c1']);
    const rows = buildRows(comments, expanded);

    const replyRows = rows.filter((r) => r.kind === 'reply');
    const toggleRow = rows.find((r) => r.kind === 'toggle');

    expect(replyRows).toHaveLength(2);
    expect(toggleRow?.kind === 'toggle' && toggleRow.expanded).toBe(true);
  });

  it('toggle row shows correct replyCount and expanded state', () => {
    const comments = [
      makeComment({ id: 'c1' }),
      makeComment({ id: 'r1', parent_id: 'c1' }),
      makeComment({ id: 'r2', parent_id: 'c1' }),
      makeComment({ id: 'r3', parent_id: 'c1' }),
    ];
    const rows = buildRows(comments, new Set(['c1']));
    const toggle = rows.find((r) => r.kind === 'toggle');
    expect(toggle?.kind === 'toggle' && toggle.replyCount).toBe(3);
    expect(toggle?.kind === 'toggle' && toggle.expanded).toBe(true);
  });

  it('multiple root comments each have their own toggle', () => {
    const comments = [
      makeComment({ id: 'c1' }),
      makeComment({ id: 'r1', parent_id: 'c1' }),
      makeComment({ id: 'c2' }),
      makeComment({ id: 'r2', parent_id: 'c2' }),
    ];
    const rows = buildRows(comments, new Set());
    const toggleRows = rows.filter((r) => r.kind === 'toggle');
    expect(toggleRows).toHaveLength(2);
  });

  it('expanding one thread does not expand another', () => {
    const comments = [
      makeComment({ id: 'c1' }),
      makeComment({ id: 'r1', parent_id: 'c1' }),
      makeComment({ id: 'c2' }),
      makeComment({ id: 'r2', parent_id: 'c2' }),
    ];
    const rows = buildRows(comments, new Set(['c1'])); // only c1 expanded

    const c1Replies = rows.filter((r) => r.kind === 'reply' && r.comment.parent_id === 'c1');
    const c2Replies = rows.filter((r) => r.kind === 'reply' && r.comment.parent_id === 'c2');

    expect(c1Replies).toHaveLength(1);
    expect(c2Replies).toHaveLength(0);
  });

  it('root comments without replies have no toggle row', () => {
    const comments = [
      makeComment({ id: 'c1' }),
      makeComment({ id: 'c2' }),
    ];
    const rows = buildRows(comments, new Set());
    const toggleRows = rows.filter((r) => r.kind === 'toggle');
    expect(toggleRows).toHaveLength(0);
    expect(rows).toHaveLength(2);
  });
});
