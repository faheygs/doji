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

  it('withholds a media post until preparation has completed', async () => {
    let resolvePreparation: ((value: Map<string, Post>) => void) | undefined;
    mockPrepareFeedPostMedia.mockReturnValue(
      new Promise<Map<string, Post>>((resolve) => {
        resolvePreparation = resolve;
      }),
    );
    const { result, unmount } = renderHook(() => usePreparedFeedPosts([post], true));

    expect(result.current.posts).toEqual([]);
    expect(result.current.isPreparing).toBe(true);

    await act(async () => {
      resolvePreparation?.(
        new Map([
          [
            'post-1:private/post-1.jpg::',
            { ...post, photo_url: 'file:///native-cache/post-1.jpg' },
          ],
        ]),
      );
    });

    await waitFor(() => {
      expect(result.current.posts[0]?.photo_url).toBe('file:///native-cache/post-1.jpg');
      expect(result.current.isPreparing).toBe(false);
    });
    unmount();
  });

  it('prepares posts progressively with only two native jobs active', async () => {
    const posts = [post, { ...post, id: 'post-2' }, { ...post, id: 'post-3' }];
    const resolvers = new Map<string, (value: Map<string, Post>) => void>();
    mockPrepareFeedPostMedia.mockImplementation(
      ([item]) =>
        new Promise<Map<string, Post>>((resolve) => {
          resolvers.set(item.id, resolve);
        }),
    );

    const { result, unmount } = renderHook(() => usePreparedFeedPosts(posts, true));
    await waitFor(() => expect(mockPrepareFeedPostMedia).toHaveBeenCalledTimes(2));
    expect(resolvers.has('post-3')).toBe(false);

    await act(async () => {
      const first = posts[0];
      resolvers.get(first.id)?.(
        new Map([[`post-1:private/post-1.jpg::`, { ...first, photo_url: 'file:///one.jpg' }]]),
      );
    });

    await waitFor(() => {
      expect(result.current.posts.map((item) => item.id)).toContain('post-1');
      expect(mockPrepareFeedPostMedia).toHaveBeenCalledTimes(3);
    });
    unmount();
  });
});
