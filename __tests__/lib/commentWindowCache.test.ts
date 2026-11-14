import { QueryClient } from '@tanstack/react-query';
import { commentScopeKey, type CommentWindow } from '../../lib/commentWindow';
import {
  patchWindowHearts,
  restoreWindowHearts,
  settleCommentWindow,
} from '../../lib/commentWindowCache';
import { scope, row, windowData } from '../fixtures/commentWindow';

let client: QueryClient;
const key = commentScopeKey(scope);
const current = () => client.getQueryData<CommentWindow>(key)!;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  client.setQueryData(key, windowData());
});
afterEach(() => client.clear());

test('heart rollback changes only its fields, preserving concurrent edits and other identities', () => {
  const untouched = current().pages[0].items[1];
  const before = patchWindowHearts(client, 'me', 'post', 'one', (item) => ({
    ...item,
    my_like: true,
    like_count: 1,
  }));
  expect(current().pages[0].items[1]).toBe(untouched);
  settleCommentWindow(client, 'me', 'post', { kind: 'edit', id: 'one', body: 'edited' });
  restoreWindowHearts(client, 'one', before);
  expect(current().pages[0].items[0]).toMatchObject({
    body: 'edited',
    my_like: false,
    like_count: 0,
  });
});

test('heart changes include reply parent headers, but not another account/post', () => {
  const replyKey = commentScopeKey({ ...scope, parentId: 'one' });
  client.setQueryData(replyKey, {
    ...windowData(['reply'], { ...scope, parentId: 'one' }),
    parentRow: row('one'),
  });
  const otherKey = commentScopeKey({ ...scope, viewerId: 'other' });
  client.setQueryData(otherKey, windowData());
  const before = patchWindowHearts(client, 'me', 'post', 'one', (item) => ({
    ...item,
    my_like: true,
    like_count: 1,
  }));
  expect(client.getQueryData<CommentWindow>(replyKey)?.parentRow?.my_like).toBe(true);
  expect(client.getQueryData<CommentWindow>(otherKey)?.pages[0].items[0].my_like).toBe(false);
  expect(patchWindowHearts(client, 'me', 'different', 'one', (item) => item)).toEqual([]);
  restoreWindowHearts(client, 'one', before);
  expect(client.getQueryData<CommentWindow>(replyKey)?.parentRow?.my_like).toBe(false);
});

test('rollback never resurrects deleted/evicted identities or a previous window lifetime', () => {
  const before = patchWindowHearts(client, 'me', undefined, 'one', (item) => ({
    ...item,
    my_like: true,
  }));
  settleCommentWindow(client, 'me', 'post', { kind: 'delete', id: 'one' });
  restoreWindowHearts(client, 'one', before);
  expect(current().pages[0].items.map((item) => item.id)).toEqual(['two']);
  client.setQueryData(key, windowData(['replacement']));
  restoreWindowHearts(client, 'one', before);
  expect(current().pages[0].items[0].id).toBe('replacement');
  client.removeQueries({ queryKey: key });
  restoreWindowHearts(client, 'one', before);
  expect(client.getQueryData(key)).toBeUndefined();
});

test('confirmed additions announce new content without splicing a scrolled list', () => {
  const before = current().pages[0].items;
  settleCommentWindow(client, 'me', 'post', { kind: 'add', parentId: null });
  expect(current().pages[0].items).toEqual(before);
  expect(current().headChanged).toBe(true);
  settleCommentWindow(client, 'me', 'post', { kind: 'add', parentId: 'one' });
  expect(current().pages[0].items[0].has_replies).toBe(true);
});

test('parent edits update the reply header and parent deletion removes the entire reply pane', () => {
  const replyKey = commentScopeKey({ ...scope, parentId: 'one' });
  client.setQueryData(replyKey, {
    ...windowData(['reply'], { ...scope, parentId: 'one' }),
    parentRow: row('one'),
  });
  settleCommentWindow(client, 'me', 'post', { kind: 'edit', id: 'one', body: 'new parent' });
  expect(client.getQueryData<CommentWindow>(replyKey)?.parentRow?.body).toBe('new parent');
  settleCommentWindow(client, 'me', 'post', { kind: 'delete', id: 'one' });
  expect(client.getQueryData<CommentWindow>(replyKey)).toMatchObject({
    pages: [],
    parentRow: undefined,
  });
});
