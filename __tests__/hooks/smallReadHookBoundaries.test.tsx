import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Platform } from 'react-native';
import { useReactionsGivenCount } from '../../hooks/useReactionsGivenCount';
import { useAppUpdatePolicy } from '../../hooks/useAppUpdatePolicy';
import { usePollVotesCount } from '../../hooks/usePollVotesCount';
import { useCurrentProfilePost } from '../../hooks/useCurrentProfilePost';
import {
  useBadgeDefinitions,
  useBadgeCategories,
  useBadgeTiers,
  useUserBadges,
  useUserBadgeProgress,
} from '../../hooks/useBadges';

const mockRead = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockAttach = jest.fn();
let mockMember: string | undefined = 'viewer';
jest.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (select: (s: { session: { user: { id: string } } | null }) => unknown) =>
    select({ session: mockMember ? { user: { id: mockMember } } : null }),
}));
jest.mock('../../lib/postReactions', () => ({
  attachReactionFields: (...args: unknown[]) => mockAttach(...args),
}));

let client: QueryClient;
let chains: ReturnType<typeof builder>[];
const originalPlatform = Platform.OS;
function builder() {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    retry: jest.fn().mockReturnThis(),
    abortSignal: jest.fn((signal: AbortSignal) => mockRead(signal)),
  };
}
function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  notifyManager.setScheduler((callback) => callback());
  jest.clearAllMocks();
  mockRead.mockReset().mockResolvedValue({ data: null, count: null, error: null, status: 200 });
  mockAttach.mockReset().mockImplementation(async (rows) => rows);
  mockMember = 'viewer';
  chains = [];
  const next = () => {
    const chain = builder();
    chains.push(chain);
    return chain;
  };
  mockRpc.mockImplementation(next);
  mockFrom.mockImplementation(next);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(() => {
  cleanup();
  client.clear();
  Platform.OS = originalPlatform;
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});

const guarded = [
  ['reactions', () => useReactionsGivenCount(undefined), 0],
  ['poll count', () => usePollVotesCount(undefined), 0],
  ['profile post', () => useCurrentProfilePost(undefined), null],
  ['user badges', () => useUserBadges(undefined), []],
  ['badge progress', () => useUserBadgeProgress(undefined), []],
] as const;
test.each(guarded)(
  '%s stays disabled without an identity, including explicit refresh',
  async (_name, hook, empty) => {
    const { result } = renderHook(() => hook(), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    await act(async () => {
      expect((await result.current.refetch()).data).toEqual(empty);
    });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  },
);

test.each([5, 0, null, '5'])(
  'reaction count accepts only numeric server results (%j)',
  async (data) => {
    mockRead.mockResolvedValue({ data, error: null, status: 200 });
    const { result } = renderHook(() => useReactionsGivenCount('member'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(typeof data === 'number' ? data : 0);
    expect(mockRpc).toHaveBeenCalledWith('get_reactions_given_count', { p_user_id: 'member' });
    expect(chains[0].abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  },
);

test.each([7, null])(
  'poll count reads a head-only exact count with member filtering (%j)',
  async (count) => {
    mockRead.mockResolvedValue({ count, error: null, status: 200 });
    const { result } = renderHook(() => usePollVotesCount('member'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toBe(count ?? 0));
    expect(mockFrom).toHaveBeenCalledWith('poll_votes');
    expect(chains[0].select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(chains[0].eq).toHaveBeenCalledWith('user_id', 'member');
  },
);

for (const platform of ['ios', 'android', 'web'] as const) {
  for (const enabled of [false, true]) {
    test(`release policy respects ${platform} platform and enabled=${enabled}`, async () => {
      Platform.OS = platform;
      const policy = { platform, minimum_build: 23 };
      mockRead.mockResolvedValue({ data: [policy], error: null });
      const { result } = renderHook(() => useAppUpdatePolicy(enabled), { wrapper: Wrapper });
      if (platform === 'web' || !enabled) {
        expect(result.current.fetchStatus).toBe('idle');
        expect(mockRpc).not.toHaveBeenCalled();
        if (platform === 'web')
          await act(async () => {
            expect((await result.current.refetch()).data).toBeNull();
          });
      } else {
        await waitFor(() => expect(result.current.data).toEqual(policy));
        expect(mockRpc).toHaveBeenCalledWith('get_mobile_release_policy', { p_platform: platform });
      }
    });
  }
}
test.each([null, []])('missing native release policy is a successful null (%j)', async (data) => {
  Platform.OS = 'android';
  mockRead.mockResolvedValue({ data, error: null });
  const { result } = renderHook(() => useAppUpdatePolicy(true), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toBeNull();
});

test.each([null, { id: 'post' }])(
  'current profile post handles %j with viewer-scoped enrichment',
  async (data) => {
    mockRead.mockResolvedValue({ data, error: null });
    const { result } = renderHook(() => useCurrentProfilePost('owner'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(data);
    expect(mockRpc).toHaveBeenCalledWith('get_current_profile_post', { p_user_id: 'owner' });
    if (data) expect(mockAttach).toHaveBeenCalledWith([data], 'viewer', expect.any(AbortSignal));
    else expect(mockAttach).not.toHaveBeenCalled();
  },
);
test('profile enrichment returning no post produces null', async () => {
  mockRead.mockResolvedValue({ data: { id: 'removed' }, error: null });
  mockAttach.mockResolvedValue([]);
  const { result } = renderHook(() => useCurrentProfilePost('owner'), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toBeNull();
});
test('profile query stays disabled for a signed-out viewer', () => {
  mockMember = undefined;
  const { result } = renderHook(() => useCurrentProfilePost('owner'), { wrapper: Wrapper });
  expect(result.current.fetchStatus).toBe('idle');
  expect(mockRpc).not.toHaveBeenCalled();
});

const badges = [
  ['badges', useBadgeDefinitions],
  ['badge_categories', useBadgeCategories],
  ['badge_tiers', useBadgeTiers],
  ['user_badges', () => useUserBadges('member')],
  ['user_badge_progress', () => useUserBadgeProgress('member')],
] as const;
for (const [table, hook] of badges) {
  test.each([null, [{ id: 'synthetic-row' }]])(
    `${table} is bounded and handles missing results (%j)`,
    async (data) => {
      mockRead.mockResolvedValue({ data, error: null });
      const { result } = renderHook(() => hook(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(data ?? []);
      expect(mockFrom).toHaveBeenCalledWith(table);
      expect(chains[0].limit).toHaveBeenCalledWith(100);
      if (table.startsWith('user_')) expect(chains[0].eq).toHaveBeenCalledWith('user_id', 'member');
      if (table === 'badge_categories' || table === 'badge_tiers')
        expect(chains[0].order).toHaveBeenCalledWith('sort_order', { ascending: true });
    },
  );
}

test('unmount cancels a pending count request instead of caching a late success', async () => {
  let signal: AbortSignal | undefined;
  let finish: ((value: unknown) => void) | undefined;
  mockRead.mockImplementation((s) => {
    signal = s;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const { unmount } = renderHook(() => useReactionsGivenCount('member'), { wrapper: Wrapper });
  await waitFor(() => expect(signal).toBeDefined());
  unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    finish?.({ data: 99, error: null });
  });
  expect(client.getQueryData(['reactionsGiven', 'member'])).toBeUndefined();
});
