jest.mock('expo-image', () => ({
  Image: {
    loadAsync: jest.fn(),
    writeToCacheAsync: jest.fn(),
    getCachePathAsync: jest.fn(),
  },
}));

const mockDownloadFileAsync = jest.fn();
const mockDeleteTemporaryFile = jest.fn();
const mockTemporaryFile = {
  uri: 'file:///cache/doji-feed-preparation.img',
  exists: true,
  delete: mockDeleteTemporaryFile,
};

jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache/' },
  File: class MockFile {
    static downloadFileAsync(...args: unknown[]) {
      return mockDownloadFileAsync(...args);
    }
    uri = mockTemporaryFile.uri;
    exists = mockTemporaryFile.exists;
    delete = mockDeleteTemporaryFile;
  },
}));

jest.mock('../../lib/postMedia', () => ({
  signPostMedia: jest.fn(),
  postMediaCacheKey: jest.fn(),
}));

import {
  feedPostPreparationKey,
  prepareFeedPostMedia,
} from '../../lib/feedPostPreparation';
import { Image as ExpoImage } from 'expo-image';
import { postMediaCacheKey, signPostMedia } from '../../lib/postMedia';
import type { Post } from '../../types/database';

const mockLoadAsync = ExpoImage.loadAsync as jest.MockedFunction<typeof ExpoImage.loadAsync>;
const mockWriteToCacheAsync = ExpoImage.writeToCacheAsync as jest.MockedFunction<
  typeof ExpoImage.writeToCacheAsync
>;
const mockGetCachePathAsync = ExpoImage.getCachePathAsync as jest.MockedFunction<
  typeof ExpoImage.getCachePathAsync
>;
const mockSignPostMedia = signPostMedia as jest.MockedFunction<typeof signPostMedia>;
const mockPostMediaCacheKey = postMediaCacheKey as jest.MockedFunction<
  typeof postMediaCacheKey
>;

function photoPost(id = 'post-1'): Post {
  return {
    id,
    photo_url: `private/${id}.jpg`,
    front_photo_url: null,
    video_url: null,
  } as Post;
}

describe('feed post media preparation', () => {
  const release = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockPostMediaCacheKey.mockImplementation((value: string | null) =>
      value ? `feed:${value}` : undefined,
    );
    mockLoadAsync.mockResolvedValue({ nativeRef: 'decoded', release } as never);
    mockDownloadFileAsync.mockResolvedValue(mockTemporaryFile);
    mockWriteToCacheAsync.mockResolvedValue(true);
    mockGetCachePathAsync.mockResolvedValue('/native-cache/post.jpg');
  });

  it('returns a post only after its image is downloaded, decoded, and cached', async () => {
    const post = photoPost();
    mockSignPostMedia.mockResolvedValue([
      { ...post, photo_url: 'https://signed.test/post.jpg' },
    ]);

    const result = await prepareFeedPostMedia([post]);

    expect(mockDownloadFileAsync).toHaveBeenCalledWith(
      'https://signed.test/post.jpg',
      expect.objectContaining({ uri: 'file:///cache/doji-feed-preparation.img' }),
      { idempotent: true },
    );
    expect(mockLoadAsync).toHaveBeenCalledWith(
      'file:///cache/doji-feed-preparation.img',
      { maxWidth: 1440, maxHeight: 1920 },
    );
    expect(mockWriteToCacheAsync).toHaveBeenCalledWith(
      'file:///cache/doji-feed-preparation.img',
      'feed:private/post-1.jpg',
    );
    expect(result.get(feedPostPreparationKey(post))?.photo_url).toBe(
      'file:///native-cache/post.jpg',
    );
    expect(release).toHaveBeenCalledTimes(1);
    expect(mockDeleteTemporaryFile).toHaveBeenCalledTimes(1);
  });

  it('does not mark a post ready when its image cannot be decoded', async () => {
    const post = photoPost('broken');
    mockSignPostMedia.mockResolvedValue([
      { ...post, photo_url: 'https://signed.test/broken.jpg' },
    ]);
    mockLoadAsync.mockRejectedValueOnce(new Error('decode failed'));

    const result = await prepareFeedPostMedia([post]);

    expect(result.has(feedPostPreparationKey(post))).toBe(false);
    expect(mockDeleteTemporaryFile).toHaveBeenCalledTimes(1);
  });
});
