import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { focusManager, onlineManager, QueryClient, QueryClientProvider, useInfiniteQuery } from '@tanstack/react-query';
import type { ViewToken } from 'react-native';
import { useCommentPageLookahead } from '../../hooks/useCommentPageLookahead';
import type { CommentWithMeta } from '../../hooks/useComments';
import type { CommentThreadRow } from '../../lib/commentThread';

const page = (start: number, count = 50) => Array.from({ length: count }, (_, offset) => ({
  id: `comment-${start + offset}`, created_at: `2026-11-09T00:${start + offset}:00Z`,
}) as CommentWithMeta);
const first = page(0), second = page(50), third = page(100, 20);
const token = (comment: CommentWithMeta): ViewToken<CommentThreadRow> => ({
  item: { kind: 'root', comment, replyCount: 0 }, isViewable: true, key: comment.id, index: 0,
});
const options = () => ({
  scope: 'post/viewer/everyone', enabled: true,
  pages: [first] as CommentWithMeta[][] | undefined,
  hasNextPage: true, isFetching: false, isError: false,
  fetchNextPage: jest.fn().mockResolvedValue(undefined),
});
beforeEach(() => { focusManager.setFocused(true); onlineManager.setOnline(true); });
afterEach(() => { focusManager.setFocused(true); onlineManager.setOnline(true); });

it('prepares one page ahead, waits for the viewport, and stops at the 120-comment tail', () => {
  const props = options();
  const { result, rerender } = renderHook(useCommentPageLookahead, { initialProps: props });
  expect(props.fetchNextPage).toHaveBeenCalledTimes(1);
  expect(props.fetchNextPage).toHaveBeenCalledWith({ cancelRefetch: false });
  rerender({ ...props, pages: [first, second] });
  expect(props.fetchNextPage).toHaveBeenCalledTimes(1);
  act(() => result.current.onViewableItemsChanged({ viewableItems: [token(first[49])] }));
  expect(props.fetchNextPage).toHaveBeenCalledTimes(1);
  act(() => result.current.onViewableItemsChanged({ viewableItems: [token(second[0])] }));
  expect(props.fetchNextPage).toHaveBeenCalledTimes(2);
  rerender({ ...props, pages: [first, second, third], hasNextPage: false });
  act(() => {
    result.current.onViewableItemsChanged({ viewableItems: [token(third[19])] });
    result.current.onEndReached();
  });
  expect(props.fetchNextPage).toHaveBeenCalledTimes(2);
});

it('latches a cursor before query flags update, including overlapping edge/visibility callbacks', async () => {
  const props = options();
  props.fetchNextPage.mockRejectedValue(new Error('offline'));
  const { result, rerender } = renderHook(useCommentPageLookahead, { initialProps: props });
  await act(async () => {
    result.current.onEndReached();
    result.current.onEndReached();
  });
  rerender({ ...props, pages: [first.slice()] });
  expect(props.fetchNextPage).toHaveBeenCalledTimes(1);
  rerender({ ...props, isError: true });
  act(() => result.current.onEndReached());
  expect(props.fetchNextPage).toHaveBeenCalledTimes(1);
});

it.each(['closed', 'refetching', 'error', 'empty', 'exhausted'] as const)(
  'does not prefetch or edge-fetch when %s', state => {
    const props = options();
    if (state === 'closed') props.enabled = false;
    if (state === 'refetching') props.isFetching = true;
    if (state === 'error') props.isError = true;
    if (state === 'empty') props.pages = undefined;
    if (state === 'exhausted') props.hasNextPage = false;
    const { result } = renderHook(useCommentPageLookahead, { initialProps: props });
    act(() => {
      result.current.onViewableItemsChanged({ viewableItems: [token(first[0])] });
      result.current.onEndReached();
    });
    expect(props.fetchNextPage).not.toHaveBeenCalled();
  },
);

it.each(['background', 'offline'] as const)('pauses %s and resumes a cancelled lookahead only when available', state => {
  const manager = state === 'background' ? focusManager : onlineManager;
  const set = (value: boolean) => manager === focusManager
    ? focusManager.setFocused(value) : onlineManager.setOnline(value);
  set(false);
  const props = options();
  const { result } = renderHook(useCommentPageLookahead, { initialProps: props });
  act(() => result.current.onEndReached());
  expect(props.fetchNextPage).not.toHaveBeenCalled();
  act(() => set(true));
  expect(props.fetchNextPage).toHaveBeenCalledTimes(1);
  act(() => set(false));
  act(() => result.current.onEndReached());
  expect(props.fetchNextPage).toHaveBeenCalledTimes(1);
  act(() => set(true));
  expect(props.fetchNextPage).toHaveBeenCalledTimes(2);
});

it('does not inherit the previous viewer/post/audience viewport or cursor latch', () => {
  const props = { ...options(), pages: [first, second] };
  const { result, rerender } = renderHook(useCommentPageLookahead, { initialProps: props });
  act(() => result.current.onViewableItemsChanged({ viewableItems: [token(second[0])] }));
  expect(props.fetchNextPage).toHaveBeenCalledTimes(1);
  rerender({ ...props, scope: 'other/viewer/friends' });
  expect(props.fetchNextPage).toHaveBeenCalledTimes(1);
  act(() => result.current.onViewableItemsChanged({ viewableItems: [token(second[0])] }));
  expect(props.fetchNextPage).toHaveBeenCalledTimes(2);
});

it('maps reply toggles to their parent page and ignores non-visible or stale tokens', () => {
  const props = { ...options(), pages: [first, second] };
  const { result } = renderHook(useCommentPageLookahead, { initialProps: props });
  act(() => result.current.onViewableItemsChanged({ viewableItems: [
    { ...token(second[0]), isViewable: false }, token(third[0]),
  ] }));
  expect(props.fetchNextPage).not.toHaveBeenCalled();
  act(() => result.current.onViewableItemsChanged({ viewableItems: [{
    ...token(second[0]), item: { kind: 'toggle', parentId: second[0].id, replyCount: 2, expanded: false },
  }] }));
  expect(props.fetchNextPage).toHaveBeenCalledTimes(1);
});

it('retains a guarded edge fallback for pages whose replies have no visible root yet', () => {
  const props = { ...options(), pages: [first, second] };
  const { result, rerender } = renderHook(useCommentPageLookahead, { initialProps: props });
  expect(props.fetchNextPage).not.toHaveBeenCalled();
  act(() => result.current.onEndReached());
  expect(props.fetchNextPage).toHaveBeenCalledTimes(1);
  rerender({ ...props, isFetching: true });
  act(() => result.current.onEndReached());
  expect(props.fetchNextPage).toHaveBeenCalledTimes(1);
});

it('uses a real infinite query without draining pages or refetching the loaded prefix', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const source = [first, second, third];
  const read = jest.fn(async (index: number) => source[index]);
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result, unmount } = renderHook(() => {
    const query = useInfiniteQuery({
      queryKey: ['synthetic-comment-pages'], initialPageParam: 0,
      queryFn: ({ pageParam }) => read(pageParam),
      getNextPageParam: (last, all) => last.length === 50 ? all.length : undefined,
    });
    const lookahead = useCommentPageLookahead({
      scope: 'synthetic/viewer/everyone', enabled: true, pages: query.data?.pages,
      hasNextPage: query.hasNextPage, isFetching: query.isFetching,
      isError: query.isError, fetchNextPage: query.fetchNextPage,
    });
    return { query, lookahead };
  }, { wrapper });
  try {
    await waitFor(() => expect(result.current.query.data?.pages).toHaveLength(2));
    expect(read.mock.calls).toEqual([[0], [1]]);
    act(() => result.current.lookahead.onViewableItemsChanged({ viewableItems: [token(second[0])] }));
    await waitFor(() => expect(result.current.query.data?.pages).toHaveLength(3));
    expect(result.current.query.data?.pages.flat()).toHaveLength(120);
    act(() => result.current.lookahead.onEndReached());
    expect(read.mock.calls).toEqual([[0], [1], [2]]);
  } finally {
    unmount();
    client.clear();
  }
});
