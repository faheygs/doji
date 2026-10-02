import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useProfile,
  usePost,
  useFriendship,
  useFriendshipStatus,
  useFriendCount,
  useSearchUsers,
  useSendFriendRequest,
  useRemoveFriend,
} from '../../hooks/useProfile';
import { cancelScheduledInvalidations } from '../../lib/queryInvalidationBatcher';

const mockRead = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockCommand = jest.fn();
const mockAttach = jest.fn();
let mockUser: string | undefined = 'member';
jest.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));
jest.mock('../../lib/commandGateway', () => ({
  executeCommand: (...args: unknown[]) => mockCommand(...args),
}));
jest.mock('../../lib/postReactions', () => ({
  attachReactionFields: (...args: unknown[]) => mockAttach(...args),
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ session: mockUser ? { user: { id: mockUser } } : null }),
}));
let client: QueryClient;
const originalScale = process.env.EXPO_PUBLIC_SCALE_READ_URL;
function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
function builder() {
  return {
    select: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    retry: jest.fn().mockReturnThis(),
    abortSignal: jest
      .fn()
      .mockImplementation(() => Object.assign(mockRead(), { maybeSingle: () => mockRead() })),
  };
}
let chains: ReturnType<typeof builder>[];
beforeEach(() => {
  notifyManager.setScheduler((cb) => cb());
  jest.clearAllMocks();
  mockUser = 'member';
  delete process.env.EXPO_PUBLIC_SCALE_READ_URL;
  mockRead.mockReset().mockResolvedValue({ data: null, error: null });
  mockCommand.mockReset().mockResolvedValue({ data: null, error: null });
  mockAttach.mockReset().mockImplementation(async (rows) => rows);
  chains = [];
  const next = () => {
    const chain = builder();
    chains.push(chain);
    return chain;
  };
  mockRpc.mockImplementation(next);
  mockFrom.mockImplementation(next);
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
});
afterEach(() => {
  cleanup();
  cancelScheduledInvalidations(client);
  client.clear();
  notifyManager.setScheduler((cb) => setTimeout(cb, 0));
  if (originalScale === undefined) delete process.env.EXPO_PUBLIC_SCALE_READ_URL;
  else process.env.EXPO_PUBLIC_SCALE_READ_URL = originalScale;
});

test.each([undefined, ''])(
  'missing username remains disabled and manually refreshes safely (%s)',
  async (username) => {
    const { result } = renderHook(() => useProfile(username), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.data).toBeNull();
    expect(result.current.blockedByUser).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  },
);
test.each([
  [null, null, false],
  [{ status: 'blocked_by_user', profile: { id: 'hidden', username: 'hidden' } }, null, true],
  [{ status: 'not_found' }, null, false],
  [
    {
      status: 'visible',
      profile: { id: 'owner', username: 'owner', avatar_gradient: ['#111', '#222'] },
    },
    'owner',
    false,
  ],
  [
    { status: 'visible', profile: { id: 'owner', username: 'owner', avatar_gradient: null } },
    'owner',
    false,
  ],
] as const)(
  'profile view obeys server visibility rather than rendering unauthorized data (%j)',
  async (data, expectedId, blocked) => {
    mockRead.mockResolvedValue({ data, error: null });
    const { result } = renderHook(() => useProfile('  OWNER  '), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id ?? null).toBe(expectedId);
    expect(result.current.blockedByUser).toBe(blocked);
    expect(mockRpc).toHaveBeenCalledWith('get_public_profile_view', { p_username: 'owner' });
    if (expectedId) expect(result.current.data?.avatar_gradient).toHaveLength(2);
  },
);
test.each([null, { id: 'post', photo_url: 'private-object-reference' }])(
  'post detail retains the authorized object reference (%j)',
  async (data) => {
    mockRead.mockResolvedValue({ data, error: null });
    const { result } = renderHook(() => usePost('post'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(data);
    expect(mockRpc).toHaveBeenCalledWith('get_post_detail', { p_post_id: 'post' });
    expect(mockAttach).toHaveBeenCalledTimes(data ? 1 : 0);
    if (data) expect(mockAttach).toHaveBeenCalledWith([data], 'member', expect.any(AbortSignal));
  },
);
test('missing post id remains empty even on manual refresh', async () => {
  const { result } = renderHook(() => usePost(), { wrapper: Wrapper });
  await act(async () => {
    expect((await result.current.refetch()).data).toBeNull();
  });
  expect(mockRpc).not.toHaveBeenCalled();
});
test.each([
  ['member', undefined],
  [undefined, 'target'],
] as const)('friendship refresh requires both identities (%s/%s)', async (user, target) => {
  mockUser = user;
  const { result } = renderHook(() => useFriendship(target), { wrapper: Wrapper });
  await act(async () => {
    expect((await result.current.refetch()).data).toBeNull();
  });
  expect(mockFrom).not.toHaveBeenCalled();
});
test.each([
  null,
  { id: 'friendship', requester_id: 'member', addressee_id: 'target', status: 'pending' },
])('friendship read restricts both directed pairs (%j)', async (data) => {
  mockRead.mockResolvedValue({ data, error: null });
  const { result } = renderHook(() => useFriendship('target'), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual(data);
  expect(mockFrom).toHaveBeenCalledWith('friendships');
  expect(chains[0].or).toHaveBeenCalledWith(
    'and(requester_id.eq.member,addressee_id.eq.target),and(requester_id.eq.target,addressee_id.eq.member)',
  );
  expect(chains[0].retry).toHaveBeenCalledWith(false);
});
test.each([
  ['pending', 'member', 'pending_out'],
  ['pending', 'target', 'pending_in'],
  ['accepted', 'member', 'friends'],
  ['blocked', 'target', 'blocked'],
])('friendship status derives %s for requester %s', async (status, requester, expected) => {
  mockRead.mockResolvedValue({
    data: { id: 'friendship', requester_id: requester, status },
    error: null,
  });
  const { result } = renderHook(() => useFriendshipStatus('target'), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.data).toBe(expected));
});
test.each([
  [5, 5],
  [2.9, 2],
  [-4, 0],
  ['7.8', 7],
  ['invalid', 0],
  [null, 0],
  [Infinity, 0],
])('friend count safely normalizes %s', async (data, expected) => {
  mockRead.mockResolvedValue({ data, error: null });
  const { result } = renderHook(() => useFriendCount('target'), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toBe(expected);
  expect(mockRpc).toHaveBeenCalledWith('friend_count', { p_user_id: 'target' });
});
test('missing friend-count target cannot invoke a read', async () => {
  const { result } = renderHook(() => useFriendCount(), { wrapper: Wrapper });
  await act(async () => {
    expect((await result.current.refetch()).data).toBe(0);
  });
  expect(mockRpc).not.toHaveBeenCalled();
});
test.each(['', 'a'])('short search %s stays disabled', (term) => {
  const { result } = renderHook(() => useSearchUsers(term), { wrapper: Wrapper });
  expect(result.current.fetchStatus).toBe('idle');
  expect(mockRpc).not.toHaveBeenCalled();
});
test.each([null, [{ id: 'target', username: 'target' }]])(
  'user search results stay bounded and preserve the snapshot (%j)',
  async (data) => {
    mockRead.mockResolvedValue({ data, error: null });
    const { result } = renderHook(() => useSearchUsers('ta'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(data ?? []);
    expect(mockRpc).toHaveBeenCalledWith('search_profiles', { p_query: 'ta', p_limit: 20 });
  },
);
test.each([false, true])(
  'friend request optimism reconciles or rolls back (failure=%s)',
  async (failure) => {
    client.setQueryData(['friendship', 'member', 'target'], null);
    client.setQueryData(['searchUsers', 'ta'], [{ id: 'target', friendship_status: 'none' }]);
    let resolve!: (value: { error: Error | null }) => void;
    mockCommand.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { result } = renderHook(useSendFriendRequest, { wrapper: Wrapper });
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.mutateAsync({ addresseeId: 'target', commandId: 'stable' });
    });
    await waitFor(() => expect(mockCommand).toHaveBeenCalledTimes(1));
    expect(client.getQueryData(['friendship', 'member', 'target'])).toMatchObject({
      id: 'optimistic:stable',
      status: 'pending',
    });
    expect(client.getQueryData(['searchUsers', 'ta'])).toEqual([
      { id: 'target', friendship_status: 'pending_out' },
    ]);
    await act(async () => {
      resolve({ error: failure ? new Error('denied') : null });
      if (failure) await expect(pending).rejects.toThrow('denied');
      else await pending;
    });
    expect(mockCommand).toHaveBeenCalledWith('request_friendship', {
      p_addressee_id: 'target',
      p_idempotency_key: 'stable',
    });
    if (failure) {
      expect(client.getQueryData(['friendship', 'member', 'target'])).toBeNull();
      expect(client.getQueryData(['searchUsers', 'ta'])).toEqual([
        { id: 'target', friendship_status: 'none' },
      ]);
    }
  },
);
test('signed-out friend request performs neither optimism nor a command', async () => {
  mockUser = undefined;
  const { result } = renderHook(useSendFriendRequest, { wrapper: Wrapper });
  await act(async () => {
    await expect(result.current.mutateAsync({ addresseeId: 'target' })).rejects.toThrow(
      'Not authenticated',
    );
  });
  expect(mockCommand).not.toHaveBeenCalled();
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});
test('friend request retry reuses the generated logical command ID', async () => {
  mockCommand
    .mockResolvedValueOnce({ error: new Error('retry') })
    .mockResolvedValue({ error: null });
  const input = { addresseeId: 'target' };
  const { result } = renderHook(useSendFriendRequest, { wrapper: Wrapper });
  await act(async () => {
    await expect(result.current.mutateAsync(input)).rejects.toThrow('retry');
  });
  await act(async () => {
    await result.current.mutateAsync(input);
  });
  expect(mockCommand.mock.calls[1]).toEqual(mockCommand.mock.calls[0]);
});
test('friend removal is one atomic retriable command', async () => {
  mockCommand
    .mockResolvedValueOnce({ error: new Error('retry') })
    .mockResolvedValue({ error: null });
  const input = { friendshipId: 'friendship' };
  const { result } = renderHook(useRemoveFriend, { wrapper: Wrapper });
  await act(async () => {
    await expect(result.current.mutateAsync(input)).rejects.toThrow('retry');
  });
  await act(async () => {
    await result.current.mutateAsync(input);
  });
  expect(mockCommand.mock.calls[0]).toEqual([
    'remove_friendship',
    { p_friendship_id: 'friendship', p_idempotency_key: expect.stringMatching(/^friend-remove:/) },
  ]);
  expect(mockCommand.mock.calls[1]).toEqual(mockCommand.mock.calls[0]);
});
