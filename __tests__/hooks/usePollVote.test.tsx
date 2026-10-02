import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react-native';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePollVote } from '../../hooks/usePollVote';
import { executeCommand } from '../../lib/commandGateway';
import { filterContent } from '../../lib/contentFilter';
import { scheduleQueryInvalidation } from '../../lib/queryInvalidationBatcher';

const mockFetchProfile = jest.fn();
let mockSession: { user: { id: string } } | null;
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ session: mockSession, fetchProfile: mockFetchProfile }),
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
  'optimistically completes %s, then reconciles authoritative reads',
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
    expect(refetch).toHaveBeenCalledWith({ queryKey: key }, { cancelRefetch: false });
    expect(scheduleQueryInvalidation).toHaveBeenCalledWith(client, [
      'pollResults',
      'pollVotersDetail',
      'profile',
      'leaderboard',
      'feed',
    ]);
    expect(mockFetchProfile).toHaveBeenCalledWith('member');
  },
);

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
