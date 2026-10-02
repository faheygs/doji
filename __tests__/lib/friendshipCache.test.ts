import { QueryClient } from '@tanstack/react-query';
import {
  patchCachedFriendshipStatus,
  optimisticallyRequestFriendship,
  rollbackOptimisticFriendRequest,
  FRIENDSHIP_STATUS_ROOTS,
} from '../../lib/friendshipCache';

test.each([
  null,
  undefined,
  4,
  'literal',
  true,
  { id: 'other', friendship_status: 'none' },
  { id: 'target' },
])('unrelated cache data preserves reference/value: %j', (value) => {
  expect(patchCachedFriendshipStatus(value, 'target', 'pending_out')).toBe(value);
});

test('nested paged rows patch only matching viewer-relative friendships without mutating originals', () => {
  const match = { user_id: 'target', id: 'other', friendship_status: 'none', name: 'Synthetic' };
  const untouched = { user_id: 'other', id: 'target', friendship_status: 'friends' };
  const source = {
    pages: [[match, untouched], [{ id: 'target', friendship_status: 'none' }]],
    pageParams: [null],
  };
  const updated = patchCachedFriendshipStatus(source, 'target', 'pending_out') as typeof source;
  expect(updated).not.toBe(source);
  expect(updated.pages[0][0].friendship_status).toBe('pending_out');
  expect(updated.pages[1][0].friendship_status).toBe('pending_out');
  expect(updated.pages[0][1]).toBe(untouched);
  expect(updated.pageParams).toBe(source.pageParams);
  expect(match.friendship_status).toBe('none');
});

test('unchanged arrays preserve reference for query structural sharing', () => {
  const rows = [{ id: 'other', friendship_status: 'none' }, null];
  expect(patchCachedFriendshipStatus(rows, 'target', 'friends')).toBe(rows);
});

test.each([false, true])(
  'optimistic request patches declared roots and rollback restores exact snapshots (prior=%s)',
  async (hasPrevious) => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    try {
      const key = ['friendship', 'viewer', 'target'];
      const previous = { id: 'old', status: 'pending' };
      if (hasPrevious) client.setQueryData(key, previous);
      const rows = [{ user_id: 'target', friendship_status: 'none' }];
      for (const root of FRIENDSHIP_STATUS_ROOTS) client.setQueryData([root, 'viewer'], rows);
      client.setQueryData(['feed', 'viewer'], rows);
      const context = await optimisticallyRequestFriendship(
        client,
        'viewer',
        'target',
        'command-one',
      );
      expect(context.previous).toEqual(hasPrevious ? previous : undefined);
      expect(client.getQueryData(key)).toMatchObject({
        id: 'optimistic:command-one',
        requester_id: 'viewer',
        addressee_id: 'target',
        status: 'pending',
        accepted_at: null,
      });
      for (const root of FRIENDSHIP_STATUS_ROOTS)
        expect(client.getQueryData([root, 'viewer'])).toEqual([
          { user_id: 'target', friendship_status: 'pending_out' },
        ]);
      expect(client.getQueryData(['feed', 'viewer'])).toEqual(rows);
      rollbackOptimisticFriendRequest(client, context);
      expect(client.getQueryData(key)).toEqual(hasPrevious ? previous : null);
      for (const root of FRIENDSHIP_STATUS_ROOTS)
        expect(client.getQueryData([root, 'viewer'])).toEqual(rows);
      rollbackOptimisticFriendRequest(client, undefined);
      expect(client.getQueryData(key)).toEqual(hasPrevious ? previous : null);
    } finally {
      client.clear();
    }
  },
);
