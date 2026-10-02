import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useBlockedUsersPaged,
  useBlockedUserCount,
  useIsBlockedByMe,
  useBlockUser,
  useUnblockUser,
} from '../../hooks/useBlockUser';
import {
  useFriendRequests,
  useFriendRequestCount,
  useRespondToFriendRequest,
} from '../../hooks/useFriendRequests';
import { supabase } from '../../lib/supabase';
import { executeCommand } from '../../lib/commandGateway';
import { scheduleQueryInvalidation } from '../../lib/queryInvalidationBatcher';
import { invalidateFriendCountQueries } from '../../hooks/useProfile';

// Real hooks, QueryClient, cancellation, cursor mapping and optimistic caches.
// Only auth state and the transport/invalidation boundaries are synthetic.
let mockSession: { user: { id: string } } | null;
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ session: mockSession }),
}));
jest.mock('../../lib/supabase');
jest.mock('../../lib/commandGateway', () => ({ executeCommand: jest.fn() }));
jest.mock('../../lib/queryInvalidationBatcher', () => ({ scheduleQueryInvalidation: jest.fn() }));
jest.mock('../../hooks/useProfile', () => ({ invalidateFriendCountQueries: jest.fn() }));

const rpc = supabase.rpc as jest.Mock;
const from = supabase.from as jest.Mock;
const command = jest.mocked(executeCommand);
let client: QueryClient;
function setup<T>(hook: () => T) {
  return renderHook(() => hook(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
function response(data: unknown, error: unknown = null, status = 200) {
  return { abortSignal: jest.fn().mockResolvedValue({ data, error, status }), retry: jest.fn() };
}
const row = {
  id: 'request-1',
  requester_id: 'other',
  addressee_id: 'member',
  status: 'pending',
  created_at: '2026-10-01T12:00:00Z',
  accepted_at: null,
  requester_username: 'other_name',
  requester_display_name: 'Other',
  requester_avatar_url: null,
  requester_avatar_gradient: ['#111', '#222'],
  requester_equipped_border_key: 'border_gold',
};
const request = { ...row, requester: { id: 'other', username: 'other_name' } };
const requestsKey = ['friendRequests', 'member', 'paged'];
const friendshipKey = ['friendship', 'member', 'other'];
const feedKey = ['feed', 'member', 'friends'];
const feed = {
  pages: [
    [
      { id: 'mine', user_id: 'member' },
      { id: 'theirs', user_id: 'other' },
    ],
  ],
  pageParams: [null],
};
beforeEach(() => {
  jest.clearAllMocks();
  mockSession = { user: { id: 'member' } };
  notifyManager.setScheduler((callback) => callback());
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  rpc.mockReturnValue(response(null));
  command.mockResolvedValue({ data: null, error: null } as never);
});
afterEach(() => {
  cleanup();
  client.clear();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});

describe.each(['blocked', 'requests'] as const)('%s paged reads', (kind) => {
  const root = kind === 'blocked' ? 'blockedUsers' : 'friendRequests';
  const rpcName = kind === 'blocked' ? 'list_blocked_users_page' : 'list_friend_requests_page';
  const hook: () => ReturnType<typeof useBlockedUsersPaged | typeof useFriendRequests> =
    kind === 'blocked' ? useBlockedUsersPaged : useFriendRequests;
  const makeRow = (index: number) =>
    kind === 'blocked'
      ? {
          id: `person-${index}`,
          block_id: `block-${index}`,
          blocked_at: row.created_at,
          username: 'other',
        }
      : { ...row, id: `request-${index}` };

  test('disabled signed-out reads stay local, even on explicit refetch', async () => {
    mockSession = null;
    const { result } = setup(hook);
    expect(result.current.fetchStatus).toBe('idle');
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.data?.pages).toEqual([[]]);
    expect(rpc).not.toHaveBeenCalled();
  });

  test.each([null, []])('empty response %j is successful and has no next page', async (data) => {
    rpc.mockReturnValue(response(data));
    const { result } = setup(hook);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages).toEqual([[]]);
    expect(result.current.hasNextPage).toBe(false);
    expect(rpc).toHaveBeenCalledWith(rpcName, {
      p_before_created_at: null,
      p_before_id: null,
      p_limit: 50,
    });
  });

  test('fifty rows use the exact stable tail cursor, then stop on a short page', async () => {
    const first = response(Array.from({ length: 50 }, (_, i) => makeRow(i)));
    rpc.mockReturnValueOnce(first).mockReturnValueOnce(response([makeRow(50)]));
    const { result } = setup(hook);
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    expect(first.retry).toHaveBeenCalledWith(false);
    expect(first.abortSignal.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(rpc).toHaveBeenLastCalledWith(rpcName, {
      p_before_created_at: row.created_at,
      p_before_id: kind === 'blocked' ? 'block-49' : 'request-49',
      p_limit: 50,
    });
    expect(result.current.data?.pages.map((page) => page.length)).toEqual([50, 1]);
    expect(result.current.hasNextPage).toBe(false);
    expect(client.getQueryData([root, 'member', 'paged'])).toEqual(result.current.data);
  });

  test.each([403, 504])(
    'status %i is preserved as failure, never an empty success',
    async (status) => {
      rpc.mockReturnValue(response(null, { code: 'TEST', message: 'synthetic failure' }, status));
      const { result } = setup(hook);
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toMatchObject({ status, code: 'TEST' });
      expect(result.current.data).toBeUndefined();
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );

  test('switching accounts reads a separate cache key', async () => {
    rpc.mockReturnValueOnce(response([makeRow(1)])).mockReturnValueOnce(response([]));
    const { result, rerender } = setup(hook);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const previous = result.current.data;
    mockSession = { user: { id: 'second-member' } };
    rerender({});
    await waitFor(() => expect(result.current.data?.pages).toEqual([[]]));
    expect(client.getQueryData([root, 'member', 'paged'])).toEqual(previous);
    expect(client.getQueryData([root, 'second-member', 'paged'])).toEqual(result.current.data);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  test('cancelling the query aborts its transport and does not retry', async () => {
    let signal: AbortSignal | undefined;
    rpc.mockReturnValue({
      abortSignal: (value: AbortSignal) => {
        signal = value;
        return new Promise(() => {});
      },
    });
    const { result } = setup(hook);
    await waitFor(() => expect(signal).toBeDefined());
    await act(async () => {
      await client.cancelQueries({ queryKey: [root, 'member', 'paged'] });
    });
    expect(signal?.aborted).toBe(true);
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

test('friend requester mapping exposes only the explicit safe profile fields', async () => {
  rpc.mockReturnValue(
    response([{ ...row, requester_email: 'private@example.invalid', secret: 'not public' }]),
  );
  const { result } = setup(() => useFriendRequests());
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.pages[0][0]).toEqual({
    id: row.id,
    requester_id: 'other',
    addressee_id: 'member',
    status: 'pending',
    created_at: row.created_at,
    accepted_at: null,
    requester: {
      id: 'other',
      username: 'other_name',
      display_name: 'Other',
      avatar_url: null,
      avatar_gradient: ['#111', '#222'],
      equipped_border_key: 'border_gold',
    },
  });
});

test('explicitly disabled request list and count do not start transport', () => {
  const list = setup(() => useFriendRequests(false));
  const count = setup(() => useFriendRequestCount(false));
  expect(list.result.current.fetchStatus).toBe('idle');
  expect(count.result.current.fetchStatus).toBe('idle');
  expect(rpc).not.toHaveBeenCalled();
});

describe.each(['blocked', 'requests'] as const)('%s count reads', (kind) => {
  const hook = kind === 'blocked' ? useBlockedUserCount : useFriendRequestCount;
  test.each([null, 0, 7])('count %j remains exact with a null fallback', async (count) => {
    rpc.mockReturnValue(response(count));
    const { result } = setup(hook);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(count ?? 0);
    expect(rpc).toHaveBeenCalledWith(
      kind === 'blocked' ? 'blocked_user_count' : 'friend_request_count',
    );
  });
  test('signed-out manual refetch does not call the server', async () => {
    mockSession = null;
    const { result } = setup(hook);
    expect(result.current.data).toBeUndefined();
    await act(async () => {
      expect((await result.current.refetch()).data).toBe(0);
    });
    await waitFor(() => expect(result.current.data).toBe(0));
    expect(rpc).not.toHaveBeenCalled();
  });
  test('count failure cannot claim zero', async () => {
    rpc.mockReturnValue(response(null, { message: 'unavailable' }, 503));
    const { result } = setup(hook);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toMatchObject({ status: 503 });
  });
});

test.each([null, 0, 1])(
  'is-blocked count %j uses an exact, private, head-only read',
  async (count) => {
    const chain = {
      ...response(null),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    };
    chain.abortSignal.mockResolvedValue({ count, error: null, status: 200 });
    from.mockReturnValue(chain);
    const { result } = setup(() => useIsBlockedByMe('other'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe((count ?? 0) > 0);
    expect(from).toHaveBeenCalledWith('blocks');
    expect(chain.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(chain.eq.mock.calls).toEqual([
      ['blocker_id', 'member'],
      ['blocked_id', 'other'],
    ]);
    expect(client.getQueryData(['isBlocked', 'member', 'other'])).toBe(result.current.data);
  },
);

test.each(['session', 'target'])('missing %s disables block-status reads', async (missing) => {
  if (missing === 'session') mockSession = null;
  const { result } = setup(() => useIsBlockedByMe(missing === 'target' ? undefined : 'other'));
  expect(result.current.fetchStatus).toBe('idle');
  await act(async () => {
    await result.current.refetch();
  });
  expect(result.current.data).toBe(false);
  expect(from).not.toHaveBeenCalled();
});

test('block status denial is an error rather than false', async () => {
  from.mockReturnValue({
    ...response(null, { message: 'denied' }, 403),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
  });
  const { result } = setup(() => useIsBlockedByMe('other'));
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data).toBeUndefined();
  expect(result.current.error).toMatchObject({ status: 403 });
});

describe.each(['block', 'unblock'] as const)('%s atomic commands', (kind) => {
  const hook: () => ReturnType<typeof useBlockUser | typeof useUnblockUser> =
    kind === 'block' ? useBlockUser : useUnblockUser;
  test('one command preserves an explicit idempotency key and reconciles only related roots', async () => {
    client.setQueryData(feedKey, feed);
    const { result } = setup(hook);
    await act(async () => {
      await result.current.mutateAsync({ blockedUserId: 'other', commandId: 'same-command' });
    });
    expect(command).toHaveBeenCalledTimes(1);
    expect(command).toHaveBeenCalledWith(`${kind}_user`, {
      p_blocked_user_id: 'other',
      p_idempotency_key: 'same-command',
    });
    expect(scheduleQueryInvalidation).toHaveBeenCalledWith(
      client,
      kind === 'block'
        ? [
            'feed',
            'friendship',
            'friends',
            'friendRequests',
            'notificationCenter',
            'blockedUsers',
            'isBlocked',
            'profile',
            'leaderboard',
          ]
        : ['blockedUsers', 'isBlocked', 'profile', 'leaderboard', 'feed'],
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(client.getQueryData(feedKey)).toEqual(
      kind === 'block' ? { ...feed, pages: [[feed.pages[0][0]]] } : feed,
    );
  });
  test.each(['envelope', 'transport'] as const)(
    '%s failure rolls back and a retry reuses its generated key',
    async (failure) => {
      client.setQueryData(feedKey, feed);
      if (failure === 'envelope')
        command.mockResolvedValueOnce({ data: null, error: new Error('failed') } as never);
      else command.mockRejectedValueOnce(new Error('failed'));
      const variables = { blockedUserId: 'other' };
      const { result } = setup(hook);
      await act(async () => {
        await expect(result.current.mutateAsync(variables)).rejects.toThrow('failed');
      });
      expect(client.getQueryData(feedKey)).toEqual(feed);
      expect(scheduleQueryInvalidation).not.toHaveBeenCalled();
      await act(async () => {
        await result.current.mutateAsync(variables);
      });
      expect(command.mock.calls[0]).toEqual(command.mock.calls[1]);
      expect(command.mock.calls[0][1]).toMatchObject({
        p_idempotency_key: expect.stringMatching(new RegExp(`^${kind}-user:`)),
      });
    },
  );
  test('signed-out action never sends a command or changes the final cache', async () => {
    mockSession = null;
    client.setQueryData(feedKey, feed);
    const { result } = setup(hook);
    await act(async () => {
      await expect(result.current.mutateAsync({ blockedUserId: 'other' })).rejects.toThrow(
        'Not authenticated',
      );
    });
    expect(client.getQueryData(feedKey)).toEqual(feed);
    expect(command).not.toHaveBeenCalled();
    expect(scheduleQueryInvalidation).not.toHaveBeenCalled();
  });
});

describe.each([true, false])('friend response accept=%s', (accept) => {
  test('optimistic request removal preserves other requests; success reconciles related reads', async () => {
    client.setQueryData(requestsKey, {
      pages: [[request, { ...request, id: 'unrelated' }]],
      pageParams: [null],
    });
    client.setQueryData(friendshipKey, request);
    client.setQueryData(
      ['searchUsers', 'member'],
      [{ user_id: 'other', friendship_status: 'pending_in' }],
    );
    let finish!: () => void;
    command.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ data: null, error: null } as never);
        }),
    );
    const { result } = setup(() => useRespondToFriendRequest());
    let pending!: Promise<unknown>;
    await act(async () => {
      pending = result.current.mutateAsync({
        friendshipId: request.id,
        accept,
        commandId: 'response-key',
      });
    });
    expect(client.getQueryData(requestsKey)).toEqual({
      pages: [[{ ...request, id: 'unrelated' }]],
      pageParams: [null],
    });
    expect(client.getQueryData(friendshipKey)).toMatchObject({
      status: accept ? 'accepted' : 'pending',
    });
    expect(client.getQueryData(['searchUsers', 'member'])).toEqual([
      { user_id: 'other', friendship_status: accept ? 'friends' : 'pending_in' },
    ]);
    expect(scheduleQueryInvalidation).not.toHaveBeenCalled();
    await act(async () => {
      finish();
      await pending;
    });
    expect(command).toHaveBeenCalledWith('respond_to_friendship', {
      p_friendship_id: request.id,
      p_accept: accept,
      p_idempotency_key: 'response-key',
    });
    expect(scheduleQueryInvalidation).toHaveBeenCalledWith(client, [
      'friendRequests',
      'friends',
      'feed',
      'friendship',
      'notificationCenter',
      'searchUsers',
      'pollVotersDetail',
      'commentLikes',
      'reactions',
    ]);
    expect(invalidateFriendCountQueries).toHaveBeenCalledWith(client);
  });

  test.each(['missing', 'null', 'existing'] as const)(
    'failure restores the %s previous friendship and every affected cache',
    async (previous) => {
      const requests = { pages: [[request]], pageParams: [null] };
      client.setQueryData(requestsKey, requests);
      if (previous !== 'missing')
        client.setQueryData(friendshipKey, previous === 'null' ? null : request);
      const roots = ['searchUsers', 'pollVotersDetail', 'commentLikes', 'reactions'];
      for (const root of roots)
        client.setQueryData([root, 'member'], [{ id: 'other', friendship_status: 'pending_in' }]);
      command.mockResolvedValueOnce({ data: null, error: new Error('rejected') } as never);
      const { result } = setup(() => useRespondToFriendRequest());
      const variables = { friendshipId: request.id, accept };
      await act(async () => {
        await expect(result.current.mutateAsync(variables)).rejects.toThrow('rejected');
      });
      expect(client.getQueryData(requestsKey)).toEqual(requests);
      expect(client.getQueryData(friendshipKey)).toEqual(
        previous === 'missing' ? undefined : previous === 'null' ? null : request,
      );
      for (const root of roots)
        expect(client.getQueryData([root, 'member'])).toEqual([
          { id: 'other', friendship_status: 'pending_in' },
        ]);
      expect(scheduleQueryInvalidation).not.toHaveBeenCalled();
      expect(invalidateFriendCountQueries).not.toHaveBeenCalled();
      await act(async () => {
        await result.current.mutateAsync(variables);
      });
      expect(command.mock.calls[0]).toEqual(command.mock.calls[1]);
      expect(command.mock.calls[0][1]).toMatchObject({
        p_idempotency_key: expect.stringMatching(/^friend-response:/),
      });
    },
  );

  test('uncached request still uses the server command without inventing a friendship', async () => {
    const { result } = setup(() => useRespondToFriendRequest());
    await act(async () => {
      await result.current.mutateAsync({ friendshipId: 'uncached', accept });
    });
    expect(command).toHaveBeenCalledTimes(1);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});

test('blocking does not fabricate data for an observed feed that has not loaded', async () => {
  const pendingKey = ['feed', 'member', 'unloaded'];
  client.getQueryCache().build(client, { queryKey: pendingKey, queryFn: async () => feed });
  const { result } = setup(() => useBlockUser());
  await act(async () => {
    await result.current.mutateAsync({ blockedUserId: 'other' });
  });
  expect(client.getQueryData(pendingKey)).toBeUndefined();
  expect(command).toHaveBeenCalledTimes(1);
});

test('responding preserves an unloaded request cache and unrelated friendship data', async () => {
  const pendingKey = ['friendRequests', 'member', 'paged', 'unloaded'];
  client.getQueryCache().build(client, {
    queryKey: pendingKey,
    queryFn: async () => ({ pages: [[]], pageParams: [null] }),
  });
  client.setQueryData(['friendship', 'member', 'unrelated'], { ...request, id: 'unrelated' });
  const { result } = setup(() => useRespondToFriendRequest());
  await act(async () => {
    await result.current.mutateAsync({ friendshipId: request.id, accept: true });
  });
  expect(client.getQueryData(pendingKey)).toBeUndefined();
  expect(client.getQueryData(['friendship', 'member', 'unrelated'])).toEqual({
    ...request,
    id: 'unrelated',
  });
});

test('optimistic preparation failure never sends a friendship command or replaces cached rows', async () => {
  const data = { pages: [[request]], pageParams: [null] };
  client.setQueryData(requestsKey, data);
  const cancel = jest
    .spyOn(client, 'cancelQueries')
    .mockRejectedValueOnce(new Error('cancel failed'));
  const { result } = setup(() => useRespondToFriendRequest());
  await act(async () => {
    await expect(
      result.current.mutateAsync({ friendshipId: request.id, accept: true }),
    ).rejects.toThrow('cancel failed');
  });
  expect(client.getQueryData(requestsKey)).toEqual(data);
  expect(command).not.toHaveBeenCalled();
  expect(scheduleQueryInvalidation).not.toHaveBeenCalled();
  cancel.mockRestore();
});
