const mockCreateSignedUrls = jest.fn();

jest.mock('../../lib/supabase', () => ({
  supabase: {
    storage: {
      from: jest.fn(() => ({ createSignedUrls: mockCreateSignedUrls })),
    },
  },
}));

import { signPostMedia } from '../../lib/postMedia';
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
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockCreateSignedUrls.mockImplementation(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}` })),
      error: null,
    }));
  });

  afterEach(() => jest.useRealTimers());

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
});
