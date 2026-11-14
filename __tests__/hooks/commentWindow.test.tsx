import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { useCommentWindow } from '../../hooks/useCommentWindow';
import { readCommentWindow } from '../../lib/commentWindowReads';
import { commentScopeKey, type CommentWindow } from '../../lib/commentWindow';
import { deferred, scope, windowData } from '../fixtures/commentWindow';

let mockUser = 'me';
let mockEpoch = 0;
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ session: { user: { id: mockUser } } }),
  captureProfileAccount: () => {
    const userId = mockUser,
      epoch = mockEpoch;
    return { userId, isCurrent: () => userId === mockUser && epoch === mockEpoch };
  },
}));
jest.mock('../../lib/commentWindowReads', () => ({ readCommentWindow: jest.fn() }));
const read = jest.mocked(readCommentWindow);
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(() => {
  jest.clearAllMocks();
  mockUser = 'me';
  mockEpoch = 0;
  focusManager.setFocused(true);
  onlineManager.setOnline(true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  read.mockResolvedValue(windowData());
});
afterEach(() => {
  cleanup();
  client.clear();
  focusManager.setFocused(true);
  onlineManager.setOnline(true);
});

test('disabled and background panes make no reads; visible pane starts one scoped read', async () => {
  const { result, rerender } = renderHook(
    ({ enabled }: { enabled: boolean }) => useCommentWindow(scope, enabled),
    {
      wrapper,
      initialProps: { enabled: false },
    },
  );
  await act(async () => result.current.load('next'));
  expect(read).not.toHaveBeenCalled();
  act(() => focusManager.setFocused(false));
  rerender({ enabled: true });
  expect(read).not.toHaveBeenCalled();
  act(() => focusManager.setFocused(true));
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(read).toHaveBeenCalledTimes(1);
  expect(read.mock.calls[0][0].scope).toEqual(scope);
});

test('manual edge reads are single-flight and refused offline', async () => {
  const { result } = renderHook(() => useCommentWindow(scope, true), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  const pending = deferred<CommentWindow>();
  read.mockReturnValueOnce(pending.promise);
  let work!: Promise<void>;
  act(() => {
    work = result.current.load('next');
    void result.current.load('previous');
  });
  expect(read).toHaveBeenCalledTimes(2);
  expect(read.mock.calls[1][0].intent).toBe('next');
  await act(async () => {
    pending.resolve(windowData());
    await work;
  });
  act(() => onlineManager.setOnline(false));
  await act(async () => result.current.load('latest'));
  expect(read).toHaveBeenCalledTimes(2);
});

test('authorization failure purges retained data and a later network failure cannot restore it', async () => {
  const { result } = renderHook(() => useCommentWindow(scope, true), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  read.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: '42501' }));
  await act(async () => result.current.load('refresh'));
  expect(client.getQueryData<CommentWindow>(commentScopeKey(scope))?.pages).toEqual([]);
  read.mockRejectedValueOnce(new TypeError('Network request failed'));
  await act(async () => result.current.load('refresh'));
  expect(client.getQueryData<CommentWindow>(commentScopeKey(scope))?.pages).toEqual([]);
  expect(read).toHaveBeenCalledTimes(3);
});

test('paging shows progress but a subsequent invalidation refresh stays in the background', async () => {
  const { result } = renderHook(() => useCommentWindow(scope, true), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  const next = deferred<CommentWindow>();
  read.mockReturnValueOnce(next.promise);
  let paging!: Promise<void>;
  act(() => { paging = result.current.load('next'); });
  await waitFor(() => expect(result.current.isPaging).toBe(true));
  await act(async () => { next.resolve(windowData()); await paging; });
  const refresh = deferred<CommentWindow>();
  read.mockReturnValueOnce(refresh.promise);
  let refreshing!: Promise<void>;
  act(() => { refreshing = client.invalidateQueries({ queryKey: commentScopeKey(scope) }); });
  await waitFor(() => expect(result.current.isFetching).toBe(true));
  expect(result.current.isPaging).toBe(false);
  expect(result.current.isLoading).toBe(false);
  expect(result.current.data?.pages[0].items).toHaveLength(2);
  await act(async () => { refresh.resolve(windowData()); await refreshing; });
});

test('transport failures retain authorized rows and require explicit retry', async () => {
  const { result } = renderHook(() => useCommentWindow(scope, true), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  read.mockRejectedValueOnce(new TypeError('Network request failed'));
  await act(async () => result.current.load('next'));
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.lastIntent).toBe('next');
  expect(result.current.data?.pages[0].items).toHaveLength(2);
  expect(read).toHaveBeenCalledTimes(2);
  await act(async () => result.current.load(result.current.lastIntent));
  expect(read.mock.calls[2][0].intent).toBe('next');
});

test('account lifetime predicate invalidates even a sign-out/sign-in to the same identity', async () => {
  const { result } = renderHook(() => useCommentWindow(scope, true), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  const captured = read.mock.calls[0][0];
  expect(captured.isCurrent()).toBe(true);
  mockEpoch++;
  expect(captured.isCurrent()).toBe(false);
});

test('unmounted panes leave no accumulated paging cache', async () => {
  const { result, unmount } = renderHook(() => useCommentWindow(scope, true), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  unmount();
  await waitFor(() => expect(client.getQueryData(commentScopeKey(scope))).toBeUndefined());
});
