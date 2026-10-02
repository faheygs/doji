import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import {
  InfiniteData,
  notifyManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { useToggleCommentLike, useToggleCommentsDisabled } from '../../hooks/useCommentControls';
import { useTogglePollVoteLike } from '../../hooks/usePollVoteLikes';
import { useModerationStatus, useSubmitModerationAppeal } from '../../hooks/useModerationStatus';
import { usePendingReports, useModerateReport } from '../../hooks/useReports';
import {
  useMySuggestions,
  usePendingSuggestions,
  useReviewSuggestion,
  suggestionKindLabel,
  suggestionStatusColor,
} from '../../hooks/useSuggestions';
import { useBuyInToday } from '../../hooks/useBuyIn';
import { cancelScheduledInvalidations } from '../../lib/queryInvalidationBatcher';
import type { UserEvent } from '../../types/database';

const mockCommand = jest.fn();
const mockRead = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockFetchProfile = jest.fn();
const mockSetProfile = jest.fn();
let mockUser: string | undefined;
let mockProfile: Record<string, unknown> | null;
const mockState = () => ({
  session: mockUser ? { user: { id: mockUser } } : null,
  profile: mockProfile,
  fetchProfile: mockFetchProfile,
  setProfile: mockSetProfile,
});
jest.mock('../../lib/commandGateway', () => ({
  executeCommand: (...args: unknown[]) => mockCommand(...args),
}));
jest.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: Object.assign((select: (state: unknown) => unknown) => select(mockState()), {
    getState: () => mockState(),
  }),
}));
let client: QueryClient;
function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
function builder() {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    retry: jest.fn(),
    abortSignal: (signal: AbortSignal) => mockRead(signal),
  };
}
let chains: ReturnType<typeof builder>[];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  jest.clearAllMocks();
  notifyManager.setScheduler((cb) => cb());
  mockUser = 'member';
  mockProfile = { id: 'member', sparks: 100, is_admin: true };
  mockCommand.mockReset().mockResolvedValue({ data: null, error: null });
  mockRead.mockReset().mockResolvedValue({ data: null, error: null });
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
  jest.restoreAllMocks();
  notifyManager.setScheduler((cb) => setTimeout(cb, 0));
});
type LikeRow = { id?: string; vote_id?: string; my_like?: boolean; like_count?: number };
const commentKey = ['comments', 'post', 'member'];
const voterKey = ['pollVotersDetail', 'poll', 'member'];
const initial = (vote = false, count: number | undefined = 2) => ({
  pages: [
    [
      vote
        ? { vote_id: 'vote', like_count: count, my_like: false }
        : { id: 'comment', like_count: count, my_like: false },
      { id: 'unrelated', vote_id: 'other', like_count: 9 },
    ],
  ],
  pageParams: [null],
});
const first = (key: string[]) => client.getQueryData<InfiniteData<LikeRow[]>>(key)?.pages[0][0];

test.each([false, true])(
  'comment like applies optimism and reconciles the authoritative count (liked=%s)',
  async (liked) => {
    client.setQueryData(commentKey, initial());
    client.setQueryData(['comments', 'other', 'member'], initial());
    const request = deferred<{ data: { active: boolean; count: number }; error: null }>();
    mockCommand.mockReturnValue(request.promise);
    const { result } = renderHook(useToggleCommentLike, { wrapper: Wrapper });
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.mutateAsync({ postId: 'post', commentId: 'comment', liked });
    });
    await waitFor(() => expect(mockCommand).toHaveBeenCalledTimes(1));
    expect(first(commentKey)).toMatchObject({ my_like: !liked, like_count: liked ? 1 : 3 });
    expect(first(['comments', 'other', 'member'])?.like_count).toBe(2);
    await act(async () => {
      request.resolve({ data: { active: !liked, count: 12 }, error: null });
      await pending;
    });
    expect(first(commentKey)).toMatchObject({ my_like: !liked, like_count: 12 });
    expect(mockCommand).toHaveBeenCalledWith('set_comment_like', {
      p_comment_id: 'comment',
      p_active: !liked,
      p_idempotency_key: expect.stringMatching(/^comment-like:/),
    });
  },
);
test('comment like rollback restores all audience variants and reuses its ID for a retry', async () => {
  const snapshot = initial();
  client.setQueryData(commentKey, snapshot);
  client.setQueryData([...commentKey, 'friends'], snapshot);
  const failure = new Error('denied');
  mockCommand.mockResolvedValueOnce({ error: failure });
  const { result } = renderHook(useToggleCommentLike, { wrapper: Wrapper });
  const input = { postId: 'post', commentId: 'comment', liked: false };
  await act(async () => {
    await expect(result.current.mutateAsync(input)).rejects.toBe(failure);
  });
  expect(client.getQueryData(commentKey)).toEqual(snapshot);
  expect(client.getQueryData([...commentKey, 'friends'])).toEqual(snapshot);
  await act(async () => {
    await result.current.mutateAsync(input);
  }); // A null legacy response retains optimism until reconciliation.
  expect(mockCommand.mock.calls[1][1].p_idempotency_key).toBe(
    mockCommand.mock.calls[0][1].p_idempotency_key,
  );
  expect(first(commentKey)?.my_like).toBe(true);
});
test('signed-out comment liking performs no command and restores the cache', async () => {
  mockUser = undefined;
  client.setQueryData(commentKey, initial());
  const { result } = renderHook(useToggleCommentLike, { wrapper: Wrapper });
  await act(async () => {
    await expect(
      result.current.mutateAsync({ postId: 'post', commentId: 'comment', liked: false }),
    ).rejects.toThrow('Not authenticated');
  });
  expect(mockCommand).not.toHaveBeenCalled();
  expect(first(commentKey)?.my_like).toBe(false);
});

test.each([false, true])(
  'comments-disabled updates the exact post in feed/detail caches (%s)',
  async (disabled) => {
    const post = { id: 'post', comments_disabled: !disabled };
    client.setQueryData(['feed', 'event'], {
      pages: [[post, { id: 'other', comments_disabled: !disabled }]],
      pageParams: [null],
    });
    client.setQueryData(['post', 'post'], post);
    client.setQueryData(['post', 'post', 'missing'], null);
    client.setQueryData(['post', 'other'], { id: 'other' });
    const request = deferred<{ error: null }>();
    mockCommand.mockReturnValue(request.promise);
    const { result } = renderHook(useToggleCommentsDisabled, { wrapper: Wrapper });
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.mutateAsync({ postId: 'post', disabled, commandId: 'stable' });
    });
    await waitFor(() => expect(mockCommand).toHaveBeenCalledTimes(1));
    expect(client.getQueryData(['post', 'post'])).toMatchObject({ comments_disabled: disabled });
    expect(client.getQueryData(['post', 'post', 'missing'])).toBeNull();
    expect(client.getQueryData(['feed', 'event'])).toMatchObject({
      pages: [
        [
          { id: 'post', comments_disabled: disabled },
          { id: 'other', comments_disabled: !disabled },
        ],
      ],
    });
    await act(async () => {
      request.resolve({ error: null });
      await pending;
    });
    expect(mockCommand).toHaveBeenCalledWith('set_post_comments_disabled', {
      p_post_id: 'post',
      p_disabled: disabled,
      p_idempotency_key: 'stable',
    });
  },
);
test.each([false, true])(
  'comments-disabled failure rolls back without duplicate writes (signedOut=%s)',
  async (signedOut) => {
    if (signedOut) mockUser = undefined;
    const post = { id: 'post', comments_disabled: false };
    const feed = { pages: [[post]], pageParams: [null] };
    client.setQueryData(['feed'], feed);
    client.setQueryData(['post', 'post'], post);
    mockCommand.mockResolvedValue({ error: new Error('denied') });
    const { result } = renderHook(useToggleCommentsDisabled, { wrapper: Wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ postId: 'post', disabled: true })).rejects.toThrow(
        signedOut ? 'Not authenticated' : 'denied',
      );
    });
    expect(client.getQueryData(['feed'])).toEqual(feed);
    expect(client.getQueryData(['post', 'post'])).toEqual(post);
    expect(mockCommand).toHaveBeenCalledTimes(signedOut ? 0 : 1);
  },
);

test.each([
  [false, 2, 3],
  [true, 0, 0],
  [false, undefined, 1],
] as const)('poll vote optimism handles liked=%s count=%s', async (liked, count, expected) => {
  const snapshot: InfiniteData<LikeRow[]> = initial(true);
  snapshot.pages[0][0].like_count = count;
  client.setQueryData(voterKey, snapshot);
  // Existing empty query is a legitimate cache state while the initial request is pending.
  client.getQueryCache().build(client, { queryKey: ['pollVotersDetail', 'empty'] });
  const request = deferred<{
    data: { poll_vote_id: string; active: boolean; count: number };
    error: null;
  }>();
  mockCommand.mockReturnValue(request.promise);
  const { result } = renderHook(useTogglePollVoteLike, { wrapper: Wrapper });
  let pending!: Promise<unknown>;
  act(() => {
    pending = result.current.mutateAsync({ pollVoteId: 'vote', liked, commandId: 'stable' });
  });
  await waitFor(() => expect(mockCommand).toHaveBeenCalledTimes(1));
  expect(first(voterKey)).toMatchObject({ my_like: !liked, like_count: expected });
  await act(async () => {
    request.resolve({ data: { poll_vote_id: 'vote', active: !liked, count: 5 }, error: null });
    await pending;
  });
  expect(first(voterKey)).toMatchObject({ like_count: 5, my_like: !liked });
  expect(client.getQueryData<InfiniteData<LikeRow[]>>(voterKey)?.pages[0][1].like_count).toBe(9);
  expect(mockCommand).toHaveBeenCalledWith('set_poll_vote_like', {
    p_poll_vote_id: 'vote',
    p_active: !liked,
    p_idempotency_key: 'stable',
  });
});
test.each([false, true])(
  'failed poll vote liking restores snapshots (signedOut=%s)',
  async (signedOut) => {
    if (signedOut) mockUser = undefined;
    const snapshot = initial(true);
    client.setQueryData(voterKey, snapshot);
    mockCommand.mockResolvedValue({ error: new Error('denied') });
    const { result } = renderHook(useTogglePollVoteLike, { wrapper: Wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ pollVoteId: 'vote', liked: false }),
      ).rejects.toThrow(signedOut ? 'Not authenticated' : 'denied');
    });
    expect(client.getQueryData(voterKey)).toEqual(snapshot);
    expect(mockCommand).toHaveBeenCalledTimes(signedOut ? 0 : 1);
  },
);

test.each([null, { account_access: 'active', notices: [{ id: 'notice' }], decisions: [] }])(
  'moderation status retains its server shape and empty fallback (%j)',
  async (data) => {
    mockRead.mockResolvedValue({ data, error: null });
    const { result } = renderHook(useModerationStatus, { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(
      data ?? { account_access: null, notices: [], decisions: [] },
    );
    expect(mockRpc).toHaveBeenCalledWith('get_my_moderation_status');
  },
);
test.each([false, true])(
  'moderation appeal invalidates only the member status after success (failure=%s)',
  async (failure) => {
    mockCommand.mockResolvedValue({
      data: { id: 'appeal' },
      error: failure ? new Error('denied') : null,
    });
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(useSubmitModerationAppeal, { wrapper: Wrapper });
    await act(async () => {
      const pending = result.current.mutateAsync({
        decisionId: 'decision',
        statement: 'Please review',
      });
      if (failure) await expect(pending).rejects.toThrow('denied');
      else expect(await pending).toEqual({ id: 'appeal' });
    });
    expect(mockCommand).toHaveBeenCalledWith('submit_moderation_appeal', {
      p_decision_id: 'decision',
      p_statement: 'Please review',
      p_idempotency_key: expect.stringMatching(/^moderation-appeal:/),
    });
    expect(invalidate).toHaveBeenCalledTimes(failure ? 0 : 1);
    if (!failure)
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['moderationStatus', 'member'] });
  },
);

test.each([usePendingReports, usePendingSuggestions])(
  'legacy moderation reads are disabled for non-admin accounts and explicit disable',
  async (hook) => {
    mockProfile = { is_admin: false };
    const { result, rerender } = renderHook(({ enabled }: { enabled: boolean }) => hook(enabled), {
      wrapper: Wrapper,
      initialProps: { enabled: true },
    });
    expect(result.current.fetchStatus).toBe('idle');
    mockProfile = { is_admin: true };
    rerender({ enabled: false });
    expect(mockRpc).not.toHaveBeenCalled();
  },
);
test.each([
  ['reports', usePendingReports, 'get_pending_reports_snapshot'],
  ['suggestions', usePendingSuggestions, 'get_pending_suggestions_snapshot'],
] as const)('%s reads retain the bounded server contract', async (_name, hook, rpc) => {
  const { result } = renderHook(() => hook(), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual([]);
  expect(mockRpc).toHaveBeenCalledWith(rpc, { p_limit: 100 });
});
test.each([null, [{ id: 'suggestion', status: 'pending' }]])(
  'my suggestions read is scoped, newest first and bounded (%j)',
  async (data) => {
    mockRead.mockResolvedValue({ data, error: null });
    const { result } = renderHook(() => useMySuggestions('member'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(data ?? []);
    expect(mockFrom).toHaveBeenCalledWith('challenge_suggestions');
    expect(chains[0].eq).toHaveBeenCalledWith('user_id', 'member');
    expect(chains[0].order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(chains[0].limit).toHaveBeenCalledWith(100);
  },
);
test('missing suggestion owner cannot issue a table read even on explicit refresh', async () => {
  const { result } = renderHook(() => useMySuggestions(undefined), { wrapper: Wrapper });
  await act(async () => expect((await result.current.refetch()).data).toEqual([]));
  expect(mockFrom).not.toHaveBeenCalled();
});
test.each(['dismiss', 'remove_content', 'remove_and_ban'] as const)(
  'moderation action %s is one atomic command with stable retry ID',
  async (action) => {
    mockCommand
      .mockResolvedValueOnce({ error: new Error('temporary') })
      .mockResolvedValue({ error: null });
    const { result } = renderHook(useModerateReport, { wrapper: Wrapper });
    const input = { reportId: 'report', action, postId: 'not-a-client-write-target' };
    await act(async () => {
      await expect(result.current.mutateAsync(input)).rejects.toThrow('temporary');
    });
    await act(async () => {
      await result.current.mutateAsync(input);
    });
    expect(mockCommand.mock.calls[0]).toEqual([
      'moderate_report',
      {
        p_report_id: 'report',
        p_action: action,
        p_idempotency_key: expect.stringMatching(/^moderate-report:/),
      },
    ]);
    expect(mockCommand.mock.calls[1]).toEqual(mockCommand.mock.calls[0]);
    expect(mockFrom).not.toHaveBeenCalled();
  },
);
test.each([undefined, null, 'Reviewed'])(
  'suggestion review retains optional note %s and stable command identity',
  async (adminNote) => {
    mockCommand
      .mockResolvedValueOnce({ error: new Error('temporary') })
      .mockResolvedValue({ error: null });
    const { result } = renderHook(useReviewSuggestion, { wrapper: Wrapper });
    const input = { id: 'idea', status: 'approved' as const, adminNote };
    await act(async () => {
      await expect(result.current.mutateAsync(input)).rejects.toThrow('temporary');
    });
    await act(async () => {
      await result.current.mutateAsync(input);
    });
    expect(mockCommand.mock.calls[0]).toEqual([
      'review_challenge_suggestion',
      {
        p_suggestion_id: 'idea',
        p_status: 'approved',
        p_admin_note: adminNote ?? null,
        p_idempotency_key: expect.stringMatching(/^suggestion-review:/),
      },
    ]);
    expect(mockCommand.mock.calls[1]).toEqual(mockCommand.mock.calls[0]);
  },
);
test('signed-out suggestion review is rejected before contacting the server', async () => {
  mockUser = undefined;
  const { result } = renderHook(useReviewSuggestion, { wrapper: Wrapper });
  await act(async () => {
    await expect(result.current.mutateAsync({ id: 'idea', status: 'rejected' })).rejects.toThrow(
      'Not authenticated',
    );
  });
  expect(mockCommand).not.toHaveBeenCalled();
});
test.each([
  ['poll', 'Poll'],
  ['wyr', 'Would you rather'],
  ['question', 'Question'],
  ['format_question', 'Format question'],
  ['photo_idea', 'Photo idea'],
  ['future_kind', 'future kind'],
])('suggestion kind %s has a readable label', (kind, expected) =>
  expect(suggestionKindLabel(kind)).toBe(expected),
);
test.each([
  ['approved', 'green'],
  ['rejected', 'red'],
  ['pending', 'amber'],
] as const)('suggestion status %s uses semantic color', (status, expected) =>
  expect(
    suggestionStatusColor(status, {
      success: 'green',
      error: 'red',
      warning: 'amber',
      textTertiary: 'gray',
    }),
  ).toBe(expected),
);

const event = {
  id: 'occurrence',
  status: 'missed',
  buy_in_at: null,
  expires_at: '2026-01-01T00:00:00Z',
} as UserEvent;
test('buy-in requires an occurrence before issuing a command', async () => {
  const { result } = renderHook(() => useBuyInToday(null), { wrapper: Wrapper });
  expect(result.current.eligible).toBe(false);
  await act(async () => {
    await expect(result.current.buyIn()).rejects.toThrow('No Doji');
  });
  expect(mockCommand).not.toHaveBeenCalled();
});
test.each([false, true])(
  'buy-in applies server Sparks and reconciles the member (cached=%s)',
  async (cached) => {
    if (cached) client.setQueryData(['userEvent', 'today', 'member'], event);
    else mockProfile = null;
    mockCommand.mockResolvedValue({
      data: { user_event_id: 'occurrence', sparks: 25, expires_at: null },
      error: null,
    });
    const { result } = renderHook(() => useBuyInToday(event), { wrapper: Wrapper });
    expect(result.current.eligible).toBe(true);
    await act(async () => {
      await result.current.buyIn();
    });
    expect(mockCommand).toHaveBeenCalledWith('buy_in_today', {
      p_idempotency_key: 'buy-in:occurrence:occurrence',
    });
    if (cached) {
      expect(client.getQueryData(['userEvent', 'today', 'member'])).toMatchObject({
        status: 'buy_in_open',
        buy_in_at: expect.any(String),
      });
      expect(mockSetProfile).toHaveBeenCalledWith(expect.objectContaining({ sparks: 25 }));
    } else {
      expect(client.getQueryData(['userEvent', 'today', 'member'])).toBeUndefined();
      expect(mockSetProfile).not.toHaveBeenCalled();
    }
    expect(mockFetchProfile).toHaveBeenCalledWith('member');
  },
);
test('failed buy-in neither spends locally nor changes participation', async () => {
  client.setQueryData(['userEvent', 'today', 'member'], event);
  mockCommand.mockResolvedValue({ error: new Error('insufficient Sparks') });
  const { result } = renderHook(() => useBuyInToday(event), { wrapper: Wrapper });
  await act(async () => {
    await expect(result.current.buyIn()).rejects.toThrow('insufficient Sparks');
  });
  expect(client.getQueryData(['userEvent', 'today', 'member'])).toEqual(event);
  expect(mockSetProfile).not.toHaveBeenCalled();
  expect(mockFetchProfile).not.toHaveBeenCalled();
});
test('a result with no captured member never patches another account profile', async () => {
  mockUser = undefined;
  mockCommand.mockResolvedValue({ data: { sparks: 25 }, error: null });
  const { result } = renderHook(() => useBuyInToday(event), { wrapper: Wrapper });
  await act(async () => {
    await result.current.buyIn();
  });
  expect(mockSetProfile).not.toHaveBeenCalled();
  expect(mockFetchProfile).not.toHaveBeenCalled();
});
