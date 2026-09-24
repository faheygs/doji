import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { Post } from '../../types/database';

jest.mock('../../lib/feedPostPreparation', () => ({
  FEED_POST_PREPARATION_TIMEOUT_MS: 8_000,
  feedPostPreparationKey: (post: Post) =>
    `${post.id}:${post.photo_url ?? ''}:${post.front_photo_url ?? ''}:${post.video_url ?? ''}`,
  feedPostNeedsPreparation: (post: Post) =>
    Boolean(post.photo_url || post.front_photo_url || post.video_url),
  prepareFeedPostMedia: jest.fn(),
}));

import { usePreparedFeedPosts } from '../../hooks/usePreparedFeedPosts';
import { useStableFeedPresentation } from '../../hooks/useStableFeedPresentation';
import { prepareFeedPostMedia } from '../../lib/feedPostPreparation';

const mockPrepareFeedPostMedia = prepareFeedPostMedia as jest.MockedFunction<
  typeof prepareFeedPostMedia
>;

const post = {
  id: 'post-1',
  photo_url: 'private/post-1.jpg',
  front_photo_url: null,
  video_url: null,
} as Post;

describe('usePreparedFeedPosts', () => {
  afterEach(() => jest.clearAllMocks());

  it('renders the existing feed immediately without preloading the page', async () => {
    const { result, unmount } = renderHook(() =>
      usePreparedFeedPosts([post], 'event:everyone', true, true),
    );

    expect(result.current).toEqual([post]);
    await waitFor(() => expect(mockPrepareFeedPostMedia).not.toHaveBeenCalled());
    unmount();
  });

  it('keeps a stable list reference when the downstream feed updates its own state', async () => {
    const existingPosts = [post];
    const scrollToTop = jest.fn();
    const { result, rerender, unmount } = renderHook(() => {
      const readyPosts = usePreparedFeedPosts(
        existingPosts,
        'event:everyone',
        true,
        true,
      );
      return {
        readyPosts,
        stableFeed: useStableFeedPresentation(
          readyPosts,
          'event:everyone',
          scrollToTop,
        ),
      };
    });

    await waitFor(() => expect(result.current.stableFeed.posts).toEqual(existingPosts));
    const firstReadyReference = result.current.readyPosts;
    rerender({});
    expect(result.current.readyPosts).toBe(firstReadyReference);
    expect(mockPrepareFeedPostMedia).not.toHaveBeenCalled();
    unmount();
  });

  it('withholds only a new head post until that post is ready', async () => {
    let resolvePreparation: ((value: Map<string, Post>) => void) | undefined;
    mockPrepareFeedPostMedia.mockReturnValue(
      new Promise<Map<string, Post>>((resolve) => {
        resolvePreparation = resolve;
      }),
    );
    const { result, rerender, unmount } = renderHook(
      ({ posts }: { posts: Post[] }) =>
        usePreparedFeedPosts(posts, 'event:everyone', true, true),
      { initialProps: { posts: [post] } },
    );
    await waitFor(() => expect(result.current.map((item) => item.id)).toEqual(['post-1']));

    const incoming = { ...post, id: 'post-2', photo_url: 'private/post-2.jpg' };
    rerender({ posts: [incoming, post] });
    await waitFor(() => expect(mockPrepareFeedPostMedia).toHaveBeenCalledTimes(1));
    expect(result.current.map((item) => item.id)).toEqual(['post-1']);

    await act(async () => {
      resolvePreparation?.(
        new Map([
          [
            'post-2:private/post-2.jpg::',
            { ...incoming, photo_url: 'file:///native-cache/post-2.jpg' },
          ],
        ]),
      );
    });
    await waitFor(() => {
      expect(result.current.map((item) => item.id)).toEqual(['post-2', 'post-1']);
      expect(result.current[0]?.photo_url).toBe('file:///native-cache/post-2.jpg');
    });
    unmount();
  });

  it('admits pagination appended after a known row without preparation', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ posts }: { posts: Post[] }) =>
        usePreparedFeedPosts(posts, 'event:everyone', true, true),
      { initialProps: { posts: [post] } },
    );
    await waitFor(() => expect(result.current).toHaveLength(1));

    const older = { ...post, id: 'post-old', photo_url: 'private/old.jpg' };
    rerender({ posts: [post, older] });
    await waitFor(() => expect(result.current.map((item) => item.id)).toEqual(['post-1', 'post-old']));
    expect(mockPrepareFeedPostMedia).not.toHaveBeenCalled();
    unmount();
  });

  it('withholds a prepared head insert while scrolled and reveals it on demand', async () => {
    const scrollToTop = jest.fn();
    const incoming = { ...post, id: 'post-2', photo_url: null };
    const { result, rerender, unmount } = renderHook(
      ({ posts }: { posts: Post[] }) =>
        useStableFeedPresentation(posts, 'event:everyone', scrollToTop),
      { initialProps: { posts: [post] } },
    );

    await waitFor(() => expect(result.current.posts.map((item) => item.id)).toEqual(['post-1']));
    act(() => {
      result.current.onScroll({
        nativeEvent: { contentOffset: { x: 0, y: 240 } },
      } as never);
    });
    rerender({ posts: [incoming, post] });

    await waitFor(() => {
      expect(result.current.posts.map((item) => item.id)).toEqual(['post-1']);
      expect(result.current.pendingNewPostCount).toBe(1);
    });

    act(() => result.current.revealNewPosts());
    expect(result.current.posts.map((item) => item.id)).toEqual(['post-2', 'post-1']);
    expect(result.current.pendingNewPostCount).toBe(0);
    expect(scrollToTop).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('limits simultaneous incoming-post preparation to two', async () => {
    const resolvers = new Map<string, (value: Map<string, Post>) => void>();
    mockPrepareFeedPostMedia.mockImplementation(
      ([item]) =>
        new Promise<Map<string, Post>>((resolve) => {
          resolvers.set(item.id, resolve);
        }),
    );
    const { rerender, unmount } = renderHook(
      ({ posts }: { posts: Post[] }) =>
        usePreparedFeedPosts(posts, 'event:everyone', true, true),
      { initialProps: { posts: [post] } },
    );
    await act(async () => undefined);

    const incoming = ['post-2', 'post-3', 'post-4'].map((id) => ({
      ...post,
      id,
      photo_url: `private/${id}.jpg`,
    }));
    rerender({ posts: [...incoming, post] });
    await waitFor(() => expect(mockPrepareFeedPostMedia).toHaveBeenCalledTimes(2));
    expect(resolvers.has('post-4')).toBe(false);

    await act(async () => {
      const first = incoming[0];
      resolvers.get(first.id)?.(
        new Map([[
          `${first.id}:${first.photo_url}::`,
          { ...first, photo_url: 'file:///native-cache/first.jpg' },
        ]]),
      );
    });
    await waitFor(() => expect(mockPrepareFeedPostMedia).toHaveBeenCalledTimes(3));
    unmount();
  });
});
