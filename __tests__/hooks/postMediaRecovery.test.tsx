import { act, renderHook } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { usePostMedia } from '../../hooks/usePostMedia';
import { signPostMedia } from '../../lib/postMedia';
import type { Post } from '../../types/database';
jest.mock('expo-image', () => ({ Image: { getCachePathAsync: jest.fn() } }));
jest.mock('../../lib/postMedia', () => ({
  hasPrivatePostMedia: (post: Post) =>
    [post.photo_url, post.front_photo_url, post.video_url].some((value) =>
      value?.startsWith('private/'),
    ),
  postMediaCacheKey: (value: string | null) => (value?.startsWith('private/') ? value : undefined),
  signPostMedia: jest.fn(),
}));
const post = (id = 'one') =>
  ({ id, photo_url: `private/${id}`, front_photo_url: null, video_url: null }) as Post;
const sign = jest.mocked(signPostMedia),
  disk = jest.mocked(Image.getCachePathAsync);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  onlineManager.setOnline(true);
  disk.mockReset().mockResolvedValue(null);
  sign
    .mockReset()
    .mockImplementation(async (posts) =>
      posts.map((item) => ({ ...item, photo_url: `https://signed.test/${item.id}` })),
    );
});

test('disabled private media never exposes a bearer-less reference to native image/video loaders', () => {
  const { result } = renderHook(() => usePostMedia(post(), false));
  expect(result.current.photo_url).toBeNull();
  expect(sign).not.toHaveBeenCalled();
  expect(disk).not.toHaveBeenCalled();
});

test('public/local media passes through without signing and disposed callbacks cannot patch a new source', async () => {
  const held = deferred<Post[]>();
  sign.mockReturnValue(held.promise);
  const { result, rerender, unmount } = renderHook(
    ({ item }: { item: Post }) => usePostMedia(item, true),
    {
      initialProps: { item: post() },
    },
  );
  const local = { ...post('local'), photo_url: 'file:///local' };
  rerender({ item: local });
  await act(async () => held.resolve([{ ...post(), photo_url: 'https://signed.test/old' }]));
  expect(result.current.photo_url).toBe('file:///local');
  expect(result.current.error).toBeNull();
  unmount();
  await act(async () => {
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
  });
  expect(sign).toHaveBeenCalledTimes(1);
});

test('one disk-cache failure cannot hide another cached image or reject the hook promise', async () => {
  const held = deferred<Post[]>();
  sign.mockReturnValue(held.promise);
  disk.mockRejectedValueOnce(Error('synthetic disk failure')).mockResolvedValueOnce('/cache/front');
  const item = { ...post(), front_photo_url: 'private/front' };
  const { result } = renderHook(() => usePostMedia(item, true));
  await act(async () => {});
  expect(result.current.front_photo_url).toBe('file:///cache/front');
  await act(async () => held.resolve([{ ...item, photo_url: null, front_photo_url: null }]));
  expect(result.current.photo_url).toBeNull();
  expect(result.current.front_photo_url).toBeNull();
});

test('reconnect retries visible media once without polling or signing disabled cards', async () => {
  sign.mockResolvedValueOnce([{ ...post(), photo_url: null }]);
  const { result, rerender } = renderHook(
    ({ enabled }: { enabled: boolean }) => usePostMedia(post(), enabled),
    {
      initialProps: { enabled: true },
    },
  );
  await act(async () => {});
  expect(result.current.photo_url).toBeNull();
  await act(async () => {
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
  });
  expect(result.current.photo_url).toBe('https://signed.test/one');
  expect(sign).toHaveBeenCalledTimes(2);
  rerender({ enabled: false });
  await act(async () => {
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
  });
  expect(sign).toHaveBeenCalledTimes(2);
  expect(result.current.photo_url).toBeNull();
});

test('an offline mount can read permitted disk bytes but waits for reconnect before signing', async () => {
  onlineManager.setOnline(false);
  disk.mockResolvedValue('/cache/one');
  const { result } = renderHook(() => usePostMedia(post(), true));
  await act(async () => {});
  expect(result.current.photo_url).toBe('file:///cache/one');
  expect(sign).not.toHaveBeenCalled();
  await act(async () => onlineManager.setOnline(true));
  expect(result.current.photo_url).toBe('https://signed.test/one');
});

test('a replacement post never renders the previous post media, even before effects run', async () => {
  const seen: Array<[string, string | null]> = [];
  const { rerender } = renderHook(
    ({ item }: { item: Post }) => {
      const media = usePostMedia(item, true);
      seen.push([item.id, media.photo_url]);
      return media;
    },
    { initialProps: { item: post('one') } },
  );
  await act(async () => {});
  sign.mockReturnValue(new Promise(() => {}));
  rerender({ item: post('two') });
  expect(seen.filter(([id]) => id === 'two').every(([, url]) => url === null)).toBe(true);
});

test('unexpected signing rejection settles privately and cannot become an unhandled promise', async () => {
  sign.mockRejectedValue(Error('synthetic signing rejection'));
  const { result } = renderHook(() => usePostMedia(post(), true));
  await act(async () => {});
  expect(result.current.photo_url).toBeNull();
  expect(result.current.error).toBe('Media could not be loaded.');
  expect(sign).toHaveBeenCalledTimes(1);
  sign.mockResolvedValue([{ ...post(), photo_url: 'https://signed.test/recovered' }]);
  await act(async () => result.current.retry());
  expect(result.current.photo_url).toBe('https://signed.test/recovered');
  expect(result.current.error).toBeNull();
  expect(sign).toHaveBeenCalledTimes(2);
});
