import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCommentSubmission } from '../../hooks/useCommentSubmission';
import type { useAddComment } from '../../hooks/useAddComment';
import { isPersistedQueryKey } from '../../lib/queryPersistence';
import type { Comment } from '../../types/database';

let mockUser = 'self',
  mockEpoch = 0;
const mockState = () => ({ session: { user: { id: mockUser } }, profile: null });
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: Object.assign(
    (select: (state: ReturnType<typeof mockState>) => unknown) => select(mockState()),
    { getState: () => mockState() },
  ),
  captureProfileAccount: () => {
    const userId = mockUser,
      epoch = mockEpoch;
    return { userId, isCurrent: () => mockUser === userId && mockEpoch === epoch };
  },
}));
let client: QueryClient;
const mutateAsync = jest.fn();
const mutation = { mutateAsync } as unknown as ReturnType<typeof useAddComment>;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const setup = () =>
  renderHook(() => useCommentSubmission('post', 'everyone', mutation), { wrapper });
const receipt = {
  id: 'saved',
  post_id: 'post',
  user_id: 'self',
  parent_id: null,
  body: 'Hello',
} as Comment;
beforeEach(() => {
  mockUser = 'self';
  mockEpoch = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  notifyManager.setScheduler((fn) => fn());
  mutateAsync.mockReset().mockImplementation(() => new Promise(() => {}));
});
afterEach(() => client.clear());

test('publishes pending feedback before transport settles, guards duplicate taps, and does not persist drafts', async () => {
  const { result } = setup();
  act(() => {
    expect(result.current.submit('  Hello  ', null, null)).toEqual(expect.any(String));
    expect(result.current.submit('Duplicate tap', null, null)).toBe(false);
  });
  await waitFor(() => expect(result.current.entries).toHaveLength(1));
  expect(result.current.entries[0]).toMatchObject({
    state: 'sending',
    row: { body: 'Hello', user_id: 'self' },
  });
  expect(Object.isFrozen(mutateAsync.mock.calls[0][0])).toBe(true);
  expect(mutateAsync).toHaveBeenCalledTimes(1);
  expect(isPersistedQueryKey(['commentSubmission', 'self', 'post'])).toBe(false);
});

test('an uncertain reply survives remount and explicit retry reuses the exact payload/key', async () => {
  mutateAsync.mockRejectedValueOnce(new Error('Lost response'));
  const first = setup();
  await act(async () => {
    first.result.current.submit('Hello', 'root', 'child');
  });
  await waitFor(() => expect(first.result.current.entries[0].state).toBe('unconfirmed'));
  const sent = mutateAsync.mock.calls[0][0];
  first.unmount();
  const next = setup();
  expect(next.result.current.entries[0].variables).toBe(sent);
  mutateAsync.mockResolvedValueOnce({ ...receipt, parent_id: 'root' });
  await act(async () => {
    next.result.current.retry(sent.commandId);
  });
  await waitFor(() => expect(next.result.current.entries[0].state).toBe('confirmed'));
  expect(mutateAsync.mock.calls[1][0]).toBe(sent);
  act(() => next.result.current.acknowledge(new Set(['unrelated'])));
  expect(next.result.current.entries).toHaveLength(1);
  act(() => next.result.current.acknowledge(new Set(['saved'])));
  await waitFor(() => expect(next.result.current.entries).toHaveLength(0));
});

test('a missing receipt is uncertain, not confirmation, and cannot be dismissed as rejected', async () => {
  mutateAsync.mockResolvedValueOnce(null);
  const { result } = setup();
  await act(async () => {
    result.current.submit('Hello', null, null);
  });
  await waitFor(() => expect(result.current.entries[0].state).toBe('unconfirmed'));
  act(() => result.current.dismiss(result.current.entries[0].key));
  expect(result.current.entries).toHaveLength(1);
});

test('definite SQL rejection can be dismissed and local invalid text never submits', async () => {
  mutateAsync.mockRejectedValueOnce({ code: '42501' });
  const { result } = setup();
  expect(result.current.submit(' ', null, null)).toBe(false);
  expect(mutateAsync).not.toHaveBeenCalled();
  await act(async () => {
    result.current.submit('Hello', null, null);
  });
  await waitFor(() => expect(result.current.entries[0].state).toBe('rejected'));
  expect(result.current.busy).toBe(false);
  act(() => result.current.dismiss(result.current.entries[0].key));
  await waitFor(() => expect(result.current.entries).toHaveLength(0));
});

test('late acknowledgement cannot reappear after an account lifetime change, including return to self', async () => {
  let finish!: (row: Comment) => void;
  mutateAsync.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result, rerender } = setup();
  act(() => {
    result.current.submit('Hello', null, null);
  });
  mockEpoch += 1;
  rerender({});
  await act(async () => {
    finish(receipt);
  });
  expect(result.current.entries).toHaveLength(0);
  expect(result.current.busy).toBe(false);
});

test('empty sheets and confirmed sends do not accumulate permanent recovery caches', async () => {
  const empty = setup();
  empty.unmount();
  expect(client.getQueryData(['commentSubmission', 'self', 'post'])).toBeUndefined();
  let finish!: (row: Comment) => void;
  mutateAsync.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = setup();
  act(() => { pending.result.current.submit('Hello', null, null); });
  pending.unmount();
  expect(client.getQueryData(['commentSubmission', 'self', 'post'])).toBeDefined();
  await act(async () => { finish(receipt); });
  expect(client.getQueryData(['commentSubmission', 'self', 'post'])).toBeUndefined();
});
