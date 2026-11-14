import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react-native';
import { notifyManager, QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { usePollVote } from '../../hooks/usePollVote';
import { executeCommand } from '../../lib/commandGateway';
import { filterContent } from '../../lib/contentFilter';
import { scheduleQueryInvalidation } from '../../lib/queryInvalidationBatcher';

const mockFetchProfile = jest.fn();
let mockSession: { user: { id: string } } | null;
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: Object.assign((selector: (state: unknown) => unknown) =>
    selector({ session: mockSession, fetchProfile: mockFetchProfile }), {
      getState: () => ({ session: mockSession }),
    }),
}));
jest.mock('../../lib/commandGateway', () => ({ executeCommand: jest.fn() }));
jest.mock('../../lib/contentFilter', () => ({ filterContent: jest.fn() }));
jest.mock('../../lib/queryInvalidationBatcher', () => ({ scheduleQueryInvalidation: jest.fn() }));

const command = jest.mocked(executeCommand);
const args = { challengeId: 'challenge', optionId: 'option', optionIndex: 0, userEventId: 'event' };
const key = ['userEvent', 'today', 'member'];
let client: QueryClient;
function setup() {
  return renderHook(() => usePollVote(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
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
  command.mockResolvedValue({ data: null, error: null } as never);
  jest.mocked(filterContent).mockReturnValue({ ok: true });
});
afterEach(() => {
  cleanup();
  client.clear();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});

test.each(['open', 'buy_in_open'])(
  'completes %s only after confirmation, then reconciles authoritative reads',
  async (status) => {
    client.setQueryData(key, { id: 'event', status, completed_at: null });
    const refetch = jest.spyOn(client, 'refetchQueries');
    const cancel = jest.spyOn(client, 'cancelQueries');
    const { result } = setup();
    await act(async () => {
      await result.current.mutateAsync(args);
    });
    expect(command).toHaveBeenCalledTimes(1);
    expect(command).toHaveBeenCalledWith('submit_poll_vote', {
      p_user_event_id: 'event',
      p_option_id: 'option',
      p_custom_text: null,
      p_idempotency_key: 'poll-vote:occurrence:event',
    });
    expect(client.getQueryData(key)).toEqual({
      id: 'event',
      status: status === 'buy_in_open' ? 'late' : 'completed',
      completed_at: expect.any(String),
    });
    expect(cancel).toHaveBeenCalledWith({ queryKey: key }, { revert: false, silent: true });
    expect(refetch).toHaveBeenCalledWith({ queryKey: key });
    expect(scheduleQueryInvalidation).toHaveBeenCalledWith(client, [
      'profile',
      'leaderboard',
    ]);
    expect(mockFetchProfile).toHaveBeenCalledWith('member');
  },
);

test('a slow vote never unlocks early and replaces pre-commit reads without waiting for results', async () => {
  const previous = { id: 'event', daily_event_id: 'daily', status: 'pending' };
  client.setQueryData(key, previous);
  let confirm!: (value: never) => void;
  command.mockImplementation(() => new Promise(resolve => { confirm = resolve; }));
  const feedKey = ['feed', 'daily', 'everyone', 'member', 'full'];
  let oldRead!: (value: string[]) => void;
  let newRead!: (value: string[]) => void;
  const read = jest.fn()
    .mockImplementationOnce(() => new Promise(resolve => { oldRead = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { newRead = resolve; }));
  const observer = new QueryObserver(client, { queryKey: feedKey, queryFn: read });
  const unsubscribe = observer.subscribe(() => {});
  const otherKey = ['feed', 'daily', 'everyone', 'another-member', 'full'];
  const summaryKey = ['pollResults', 'daily', 'everyone', 'member'];
  client.setQueryData(otherKey, ['unrelated']);
  client.setQueryData(summaryKey, ['pre-commit']);
  const { result } = setup();
  await act(async () => {
    const vote = result.current.mutateAsync(args);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(client.getQueryData(key)).toEqual(previous);
    confirm({ data: null, error: null } as never);
    await vote;
    expect(read).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(key)).toMatchObject({ status: 'completed' });
    expect(client.getQueryState(summaryKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false);
    oldRead([]);
    await Promise.resolve();
    expect(client.getQueryData(feedKey)).toBeUndefined();
    newRead(['community-poll']);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(client.getQueryData(feedKey)).toEqual(['community-poll']);
  });
  unsubscribe();
});

test('a late vote receipt cannot unlock a different occurrence or a replacement account', async () => {
  client.setQueryData(key, { id: 'next-event', status: 'pending' });
  const { result } = setup();
  await act(async () => { await result.current.mutateAsync(args); });
  expect(client.getQueryData(key)).toEqual({ id: 'next-event', status: 'pending' });
  mockFetchProfile.mockClear();
  command.mockImplementation(async () => {
    mockSession = { user: { id: 'different-member' } };
    return { data: null, error: null } as never;
  });
  await act(async () => { await result.current.mutateAsync(args); });
  expect(mockFetchProfile).not.toHaveBeenCalled();
  expect(client.getQueryData(key)).toEqual({ id: 'next-event', status: 'pending' });
});

test.each(['an answer', '   ', ''])(
  'normalizes custom text %j and preserves explicit command IDs',
  async (customText) => {
    const { result } = setup();
    await act(async () => {
      await result.current.mutateAsync({ ...args, customText, commandId: 'retry-id' });
    });
    expect(command).toHaveBeenCalledWith(
      'submit_poll_vote',
      expect.objectContaining({
        p_custom_text: customText.trim() || null,
        p_idempotency_key: 'retry-id',
      }),
    );
    expect(filterContent).toHaveBeenCalledTimes(customText ? 1 : 0);
    expect(client.getQueryData(key)).toBeUndefined();
  },
);

test('rejects unauthenticated votes without cache changes or commands', async () => {
  mockSession = null;
  const { result } = setup();
  await act(async () => {
    await expect(result.current.mutateAsync(args)).rejects.toThrow('Not authenticated');
  });
  expect(command).not.toHaveBeenCalled();
  expect(mockFetchProfile).not.toHaveBeenCalled();
  expect(scheduleQueryInvalidation).not.toHaveBeenCalled();
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});

test('blocked text restores the previous event and never writes', async () => {
  const previous = { id: 'event', status: 'open', completed_at: null };
  client.setQueryData(key, previous);
  jest.mocked(filterContent).mockReturnValue({ ok: false, reason: 'Content blocked' });
  const { result } = setup();
  await act(async () => {
    await expect(result.current.mutateAsync({ ...args, customText: 'blocked' })).rejects.toThrow(
      'Content blocked',
    );
  });
  expect(client.getQueryData(key)).toEqual(previous);
  expect(command).not.toHaveBeenCalled();
  expect(mockFetchProfile).not.toHaveBeenCalled();
});

test.each([true, false])(
  'server rejection restores cache when present (%s) without fallback writes',
  async (cached) => {
    const previous = { id: 'event', status: 'open' };
    if (cached) client.setQueryData(key, previous);
    command.mockResolvedValue({ data: null, error: new Error('Doji has closed') } as never);
    const { result } = setup();
    await act(async () => {
      await expect(result.current.mutateAsync(args)).rejects.toThrow('Doji has closed');
    });
    expect(client.getQueryData(key)).toEqual(cached ? previous : undefined);
    expect(command).toHaveBeenCalledTimes(1);
    expect(scheduleQueryInvalidation).not.toHaveBeenCalled();
  },
);

test('concurrent duplicate taps share one real single-flight command', async () => {
  let finish!: (value: never) => void;
  command.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = setup();
  await act(async () => {
    const first = result.current.mutateAsync(args);
    const second = result.current.mutateAsync(args);
    // Drain mutation onMutate/single-flight scheduling without a wall-clock delay.
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(command).toHaveBeenCalledTimes(1);
    finish({ data: null, error: null } as never);
    await Promise.all([first, second]);
  });
});

test('retry after transport failure reuses the occurrence key and is not stuck in single flight', async () => {
  command.mockRejectedValueOnce(new Error('offline'));
  const { result } = setup();
  await act(async () => {
    await expect(result.current.mutateAsync(args)).rejects.toThrow('offline');
    await result.current.mutateAsync(args);
  });
  expect(command).toHaveBeenCalledTimes(2);
  expect(command.mock.calls[0]).toEqual(command.mock.calls[1]);
});
