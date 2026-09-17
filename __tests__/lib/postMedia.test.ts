const mockCreateSignedUrls = jest.fn();
const mockCreateSignedUrl = jest.fn();

jest.mock('../../lib/supabase', () => ({
  supabase: {
    storage: {
      from: jest.fn(() => ({
        createSignedUrl: mockCreateSignedUrl,
        createSignedUrls: mockCreateSignedUrls,
      })),
    },
  },
}));

import { postMediaCacheKey, signPostMedia } from '../../lib/postMedia';
import type { Post } from '../../types/database';

function post(id: string, path: string): Post {
  return {
    id,
    photo_url: `https://example.supabase.co/storage/v1/object/authenticated/post-media/${path}`,
    front_photo_url: null,
    video_url: null,
  } as Post;
}

describe('post media signing', () => {
  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED;
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockCreateSignedUrls.mockImplementation(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}` })),
      error: null,
    }));
    mockCreateSignedUrl.mockImplementation(async (path: string) => ({
      data: { signedUrl: `https://signed.test/${path}` },
      error: null,
    }));
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED;
    jest.useRealTimers();
  });

  it('coalesces concurrently mounted cards into one storage request', async () => {
    const first = signPostMedia([post('one', 'one.jpg')]);
    const second = signPostMedia([post('two', 'two.jpg')]);
    jest.advanceTimersByTime(24);
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(mockCreateSignedUrls).toHaveBeenCalledTimes(1);
    expect(mockCreateSignedUrls).toHaveBeenCalledWith(['one.jpg', 'two.jpg'], 15 * 60);
    expect(firstResult[0].photo_url).toBe('https://signed.test/one.jpg');
    expect(secondResult[0].photo_url).toBe('https://signed.test/two.jpg');
  });

  it('leaves the social record usable when storage signing throws', async () => {
    mockCreateSignedUrls.mockRejectedValueOnce(new Error('storage offline'));
    const pending = signPostMedia([post('three', 'three.jpg')]);
    jest.advanceTimersByTime(24);
    const [result] = await pending;
    expect(result.photo_url).toBeNull();
  });

  it('signs the paid feed variant and falls back to the original when transforms fail', async () => {
    process.env.EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED = 'true';
    mockCreateSignedUrl
      .mockResolvedValueOnce({ data: null, error: new Error('transform unavailable') })
      .mockResolvedValueOnce({
        data: { signedUrl: 'https://signed.test/fallback.jpg' },
        error: null,
      });
    const pending = signPostMedia([post('fallback', 'fallback.jpg')], 'feed');
    jest.advanceTimersByTime(24);
    const [result] = await pending;

    expect(mockCreateSignedUrl).toHaveBeenNthCalledWith(1, 'fallback.jpg', 15 * 60, {
      transform: { height: 1920, quality: 90, resize: 'cover', width: 1440 },
    });
    expect(mockCreateSignedUrl).toHaveBeenNthCalledWith(2, 'fallback.jpg', 15 * 60);
    expect(result.photo_url).toBe('https://signed.test/fallback.jpg');
  });

  it('uses the immutable object path as the cache key across signed URL rotations', () => {
    const first =
      'https://example.supabase.co/storage/v1/object/sign/post-media/users/one/photo.jpg?token=first';
    const second =
      'https://example.supabase.co/storage/v1/object/sign/post-media/users/one/photo.jpg?token=second';

    expect(postMediaCacheKey(first)).toBe('post-media:users/one/photo.jpg');
    expect(postMediaCacheKey(second)).toBe(postMediaCacheKey(first));
    expect(postMediaCacheKey(first, 'feed')).toBe('post-media:feed:v2:users/one/photo.jpg');
    expect(postMediaCacheKey(first, 'thumbnail')).toBe(
      'post-media:thumbnail:v2:users/one/photo.jpg',
    );
    expect(postMediaCacheKey('https://cdn.example.com/public.jpg')).toBeUndefined();
  });
});
