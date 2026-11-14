import { act, renderHook } from '@testing-library/react-native';
import type { Post } from '../../types/database';
import { usePreparedFeedPosts } from '../../hooks/usePreparedFeedPosts';
import { prepareFeedPostMedia, feedPostPreparationKey } from '../../lib/feedPostPreparation';

jest.mock('../../lib/feedPostPreparation', () => ({
  FEED_POST_PREPARATION_TIMEOUT_MS: 8_000,
  feedPostPreparationKey: (post: Post) => `${post.id}:${post.photo_url}`,
  feedPostNeedsPreparation: (post: Post) => Boolean(post.photo_url),
  prepareFeedPostMedia: jest.fn(),
}));
const prepare = jest.mocked(prepareFeedPostMedia);
const post = (id: string) =>
  ({ id, photo_url: `${id}.jpg`, front_photo_url: null, video_url: null }) as Post;
const baseline = post('baseline');
const ready = (item: Post) =>
  new Map([[feedPostPreparationKey(item), { ...item, photo_url: `file:///${item.id}` }]]);
const resolvers = new Map<string, (value: Map<string, Post>) => void>();
function setup() {
  return renderHook(
    ({ posts, identity, enabled }: { posts: Post[]; identity: string; enabled: boolean }) =>
      usePreparedFeedPosts(posts, identity, enabled, true),
    { initialProps: { posts: [baseline], identity: 'member:event:everyone', enabled: true } },
  );
}
beforeEach(() => {
  jest.useFakeTimers();
  prepare.mockReset();
  resolvers.clear();
  prepare.mockImplementation(
    ([item]) =>
      new Promise((resolve) => {
        resolvers.set(item.id, resolve);
      }),
  );
});
afterEach(() => jest.useRealTimers());

test('cold/unready and disabled feeds never start page-wide preparation', () => {
  const posts = [baseline];
  const { result, rerender, unmount } = renderHook(
    ({ enabled, ready }: { enabled: boolean; ready: boolean }) =>
      usePreparedFeedPosts(posts, 'member:event:everyone', enabled, ready),
    { initialProps: { enabled: true, ready: false } },
  );
  expect(result.current).toBe(posts);
  rerender({ enabled: true, ready: true });
  rerender({ enabled: false, ready: true });
  rerender({ enabled: true, ready: true });
  expect(result.current).toEqual(posts);
  expect(prepare).not.toHaveBeenCalled();
  unmount();
});

test('non-media inserts are immediate and changed/removed media cannot reuse a prepared file', async () => {
  const { result, rerender, unmount } = setup();
  const incoming = post('one'),
    textOnly = { ...post('text'), photo_url: null };
  rerender({
    posts: [textOnly, incoming, baseline],
    identity: 'member:event:everyone',
    enabled: true,
  });
  expect(result.current.map((item) => item.id)).toEqual(['text', 'baseline']);
  await act(async () => resolvers.get('one')?.(ready(incoming)));
  expect(result.current[1].photo_url).toBe('file:///one');
  const replacement = { ...incoming, photo_url: 'changed.jpg' };
  rerender({ posts: [replacement, baseline], identity: 'member:event:everyone', enabled: true });
  expect(result.current[0].photo_url).toBe('changed.jpg');
  rerender({ posts: [baseline], identity: 'member:event:everyone', enabled: true });
  expect(result.current).toEqual([baseline]);
  unmount();
});

test('every queued head row reaches fallback even if both native preparations never settle', async () => {
  const { result, rerender, unmount } = setup();
  const posts = [post('one'), post('two'), post('three'), baseline];
  rerender({ posts, identity: 'member:event:everyone', enabled: true });
  expect(prepare).toHaveBeenCalledTimes(2);
  await act(async () => jest.advanceTimersByTimeAsync(8_000));
  expect(result.current.map((item) => item.id)).toEqual(posts.map((item) => item.id));
  // Falling back must not multiply native operations that cannot be cancelled.
  expect(prepare).toHaveBeenCalledTimes(2);
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});

test('the two-operation limit survives another realtime batch', async () => {
  const { rerender, unmount } = setup();
  const posts = [post('one'), post('two'), baseline];
  rerender({ posts, identity: 'member:event:everyone', enabled: true });
  rerender({ posts: [post('three'), ...posts], identity: 'member:event:everyone', enabled: true });
  expect(prepare).toHaveBeenCalledTimes(2);
  await act(async () => resolvers.get('one')?.(ready(posts[0])));
  expect(prepare).toHaveBeenCalledTimes(3);
  expect(prepare.mock.calls[2][0][0].id).toBe('three');
  unmount();
});

test('late native results cannot patch a replacement account or an identity round trip', async () => {
  const { result, rerender, unmount } = setup();
  const incoming = post('shared-id');
  rerender({ posts: [incoming, baseline], identity: 'member:event:everyone', enabled: true });
  const old = resolvers.get(incoming.id);
  rerender({ posts: [incoming, baseline], identity: 'other:event:everyone', enabled: true });
  rerender({ posts: [incoming, baseline], identity: 'member:event:everyone', enabled: true });
  await act(async () => old?.(ready(incoming)));
  await act(async () => jest.advanceTimersByTimeAsync(0));
  expect(result.current[0].photo_url).toBe(incoming.photo_url);
  expect(jest.getTimerCount()).toBe(0);
  unmount();
});

test('removed queued rows never start work and removed running rows cannot return', async () => {
  const { result, rerender, unmount } = setup();
  const one = post('one'),
    two = post('two');
  rerender({
    posts: [one, two, post('removed'), baseline],
    identity: 'member:event:everyone',
    enabled: true,
  });
  rerender({ posts: [baseline], identity: 'member:event:everyone', enabled: true });
  await act(async () => resolvers.get('one')?.(ready(one)));
  await act(async () => jest.advanceTimersByTimeAsync(0));
  expect(prepare).toHaveBeenCalledTimes(2);
  expect(result.current).toEqual([baseline]);
  expect(jest.getTimerCount()).toBe(0);
  unmount();
});

test('disabling or unmounting discards work without launching queued native requests', async () => {
  const { rerender, unmount } = setup();
  const one = post('one');
  const posts = [one, post('two'), post('three'), baseline];
  rerender({ posts, identity: 'member:event:everyone', enabled: true });
  rerender({ posts, identity: 'member:event:everyone', enabled: false });
  unmount();
  await act(async () => resolvers.get('one')?.(ready(one)));
  await act(async () => jest.advanceTimersByTimeAsync(0));
  expect(prepare).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
});
