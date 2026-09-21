import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Image as ExpoImage } from 'expo-image';
import { usePostMedia } from '../../hooks/usePostMedia';
import { signPostMedia } from '../../lib/postMedia';
import type { Post } from '../../types/database';

jest.mock('expo-image', () => ({
  Image: {
    getCachePathAsync: jest.fn(),
  },
}));

jest.mock('../../lib/postMedia', () => ({
  hasPrivatePostMedia: jest.fn(() => true),
  postMediaCacheKey: jest.fn((value: string | null, variant: string) =>
    value ? `post-media:${variant}:${value}` : undefined,
  ),
  signPostMedia: jest.fn(),
}));

describe('usePostMedia', () => {
  afterEach(() => jest.clearAllMocks());

  it('shows authorized disk-cached bytes while the signed URL refresh is pending', async () => {
    let resolveSigned: ((posts: Post[]) => void) | undefined;
    (signPostMedia as jest.Mock).mockReturnValue(
      new Promise<Post[]>((resolve) => {
        resolveSigned = resolve;
      }),
    );
    (ExpoImage.getCachePathAsync as jest.Mock)
      .mockResolvedValueOnce('/native-cache/main.jpg')
      .mockResolvedValueOnce(null);

    const post = {
      id: 'post-1',
      photo_url: 'private/main.jpg',
      front_photo_url: null,
      video_url: null,
    } as Post;
    const { result } = renderHook(() => usePostMedia(post, true, 'feed'));

    await waitFor(() => {
      expect(result.current.photo_url).toBe('file:///native-cache/main.jpg');
    });

    await act(async () => {
      resolveSigned?.([
        {
          ...post,
          photo_url: 'https://signed.example/main.jpg',
        } as Post,
      ]);
    });

    await waitFor(() => {
      expect(result.current.photo_url).toBe('https://signed.example/main.jpg');
    });
  });
});
