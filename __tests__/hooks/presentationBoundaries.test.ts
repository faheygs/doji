import { act, cleanup, renderHook } from '@testing-library/react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useStableFeedPresentation } from '../../hooks/useStableFeedPresentation';
import type { Post } from '../../types/database';

describe('debounced value lifecycle', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  test('keeps the initial value until the entire delay has elapsed', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }: { value: string; delay: number }) => useDebouncedValue(value, delay),
      {
        initialProps: { value: 'first', delay: 200 },
      },
    );
    expect(result.current).toBe('first');
    rerender({ value: 'second', delay: 200 });
    act(() => jest.advanceTimersByTime(199));
    expect(result.current).toBe('first');
    act(() => jest.advanceTimersByTime(1));
    expect(result.current).toBe('second');
  });

  test('replaces an obsolete pending value rather than publishing it', () => {
    const { result, rerender } = renderHook((value) => useDebouncedValue(value, 200), {
      initialProps: 'first',
    });
    rerender('obsolete');
    act(() => jest.advanceTimersByTime(100));
    rerender('latest');
    act(() => jest.advanceTimersByTime(100));
    expect(result.current).toBe('first');
    act(() => jest.advanceTimersByTime(100));
    expect(result.current).toBe('latest');
  });

  test('changing the delay cancels and reschedules pending work', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }: { value: number; delay: number }) => useDebouncedValue(value, delay),
      {
        initialProps: { value: 1, delay: 200 },
      },
    );
    rerender({ value: 2, delay: 200 });
    act(() => jest.advanceTimersByTime(100));
    rerender({ value: 2, delay: 300 });
    act(() => jest.advanceTimersByTime(299));
    expect(result.current).toBe(1);
    act(() => jest.advanceTimersByTime(1));
    expect(result.current).toBe(2);
  });

  test('unmount removes the outstanding timer', () => {
    const { rerender, unmount } = renderHook((value) => useDebouncedValue(value, 200), {
      initialProps: 'first',
    });
    rerender('pending');
    expect(jest.getTimerCount()).toBe(1);
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('preserves object identity after a zero-delay update', () => {
    const original = { term: 'first' };
    const latest = { term: 'second' };
    const { result, rerender } = renderHook((value) => useDebouncedValue(value, 0), {
      initialProps: original,
    });
    rerender(latest);
    expect(result.current).toBe(original);
    act(() => jest.runOnlyPendingTimers());
    expect(result.current).toBe(latest);
  });
});

const post = { id: 'existing', photo_url: null, front_photo_url: null, video_url: null } as Post;
const incoming = { ...post, id: 'incoming' };
function scroll(y: number): NativeSyntheticEvent<NativeScrollEvent> {
  return {
    nativeEvent: {
      contentOffset: { x: 0, y },
      contentInset: { top: 0, bottom: 0, left: 0, right: 0 },
      contentSize: { width: 400, height: 1000 },
      layoutMeasurement: { width: 400, height: 800 },
      zoomScale: 1,
    },
  } as NativeSyntheticEvent<NativeScrollEvent>;
}

describe('stable feed scroll boundaries', () => {
  test.each([0, 48, 49])('handles the exact scroll threshold at %i pixels', (y) => {
    const scrollToTop = jest.fn();
    const { result, rerender } = renderHook(
      (posts: Post[]) => useStableFeedPresentation(posts, 'feed', scrollToTop),
      { initialProps: [post] },
    );
    act(() => result.current.onScroll(scroll(y)));
    act(() => result.current.onScroll(scroll(y)));
    rerender([incoming, post]);
    expect(result.current.posts).toEqual(y > 48 ? [post] : [incoming, post]);
    expect(result.current.pendingNewPostCount).toBe(y > 48 ? 1 : 0);
    expect(scrollToTop).not.toHaveBeenCalled();
  });

  test('returning to the top reveals pending posts exactly once', () => {
    const scrollToTop = jest.fn();
    const { result, rerender } = renderHook(
      (posts: Post[]) => useStableFeedPresentation(posts, 'feed', scrollToTop),
      { initialProps: [post] },
    );
    act(() => result.current.onScroll(scroll(100)));
    rerender([incoming, post]);
    expect(result.current.pendingNewPostCount).toBe(1);
    act(() => result.current.onScroll(scroll(48)));
    expect(result.current.posts).toEqual([incoming, post]);
    expect(result.current.pendingNewPostCount).toBe(0);
    act(() => result.current.onScroll(scroll(0)));
    expect(scrollToTop).toHaveBeenCalledTimes(1);
  });

  test('returning without pending posts does not force a scroll', () => {
    const scrollToTop = jest.fn();
    const posts = [post];
    const { result } = renderHook(() => useStableFeedPresentation(posts, 'feed', scrollToTop));
    act(() => result.current.onScroll(scroll(100)));
    act(() => result.current.onScroll(scroll(0)));
    expect(result.current.posts).toEqual(posts);
    expect(scrollToTop).not.toHaveBeenCalled();
  });

  test('changing the feed identity clears pending rows and the old scroll state', () => {
    const scrollToTop = jest.fn();
    const { result, rerender } = renderHook(
      ({ posts, identity }: { posts: Post[]; identity: string }) =>
        useStableFeedPresentation(posts, identity, scrollToTop),
      { initialProps: { posts: [post], identity: 'everyone' } },
    );
    act(() => result.current.onScroll(scroll(100)));
    rerender({ posts: [incoming, post], identity: 'everyone' });
    expect(result.current.pendingNewPostCount).toBe(1);
    rerender({ posts: [post], identity: 'friends' });
    expect(result.current.posts).toEqual([post]);
    expect(result.current.pendingNewPostCount).toBe(0);
    rerender({ posts: [incoming, post], identity: 'friends' });
    expect(result.current.posts).toEqual([incoming, post]);
    expect(result.current.pendingNewPostCount).toBe(0);
    expect(scrollToTop).not.toHaveBeenCalled();
  });
});
