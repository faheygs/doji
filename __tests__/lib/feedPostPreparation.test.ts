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
  feedPostNeedsPreparation,
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
const mockPostMediaCacheKey = postMediaCacheKey as jest.MockedFunction<typeof postMediaCacheKey>;

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
    mockTemporaryFile.exists = true;
    mockPostMediaCacheKey.mockImplementation((value) => (value ? `feed:${value}` : undefined));
    mockLoadAsync.mockResolvedValue({ nativeRef: 'decoded', release } as never);
    mockDownloadFileAsync.mockResolvedValue(mockTemporaryFile);
    mockWriteToCacheAsync.mockResolvedValue(undefined);
    mockGetCachePathAsync.mockResolvedValue('/native-cache/post.jpg');
  });

  it('returns a post only after its image is downloaded, decoded, and cached', async () => {
    const post = photoPost();
    mockSignPostMedia.mockResolvedValue([{ ...post, photo_url: 'https://signed.test/post.jpg' }]);

    const result = await prepareFeedPostMedia([post]);

    expect(mockDownloadFileAsync).toHaveBeenCalledWith(
      'https://signed.test/post.jpg',
      expect.objectContaining({ uri: 'file:///cache/doji-feed-preparation.img' }),
      { idempotent: true },
    );
    expect(mockLoadAsync).toHaveBeenCalledWith('file:///cache/doji-feed-preparation.img', {
      maxWidth: 1440,
      maxHeight: 1920,
    });
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
    mockSignPostMedia.mockResolvedValue([{ ...post, photo_url: 'https://signed.test/broken.jpg' }]);
    mockLoadAsync.mockRejectedValueOnce(new Error('decode failed'));

    const result = await prepareFeedPostMedia([post]);

    expect(result.has(feedPostPreparationKey(post))).toBe(false);
    expect(mockDeleteTemporaryFile).toHaveBeenCalledTimes(1);
  });

  it('empty input needs no authorization and media-free records need no native work', async () => {
    expect(await prepareFeedPostMedia([])).toEqual(new Map());
    expect(mockSignPostMedia).not.toHaveBeenCalled();
    const plain = { ...photoPost(), photo_url: null };
    expect(feedPostNeedsPreparation(plain)).toBe(false);
    expect(feedPostNeedsPreparation({ ...plain, video_url: 'video' })).toBe(true);
    expect(feedPostNeedsPreparation({ ...plain, front_photo_url: 'front' })).toBe(true);
    mockSignPostMedia.mockResolvedValue([plain]);
    expect((await prepareFeedPostMedia([plain])).get(feedPostPreparationKey(plain))).toEqual(plain);
    expect(mockLoadAsync).not.toHaveBeenCalled();
  });

  it('missing authorization omits only the affected post without decoding private references', async () => {
    const first = photoPost('first'),
      missing = photoPost('missing');
    mockSignPostMedia.mockResolvedValue([{ ...first, photo_url: null }]);
    expect(await prepareFeedPostMedia([first, missing])).toEqual(new Map());
    expect(mockLoadAsync).not.toHaveBeenCalled();
  });

  it('plain remote images decode without writing a private-object cache entry', async () => {
    const post = photoPost();
    mockPostMediaCacheKey.mockReturnValue(undefined);
    mockSignPostMedia.mockResolvedValue([{ ...post, photo_url: 'https://cdn.test/photo' }]);
    const result = await prepareFeedPostMedia([post]);
    expect(result.get(feedPostPreparationKey(post))?.photo_url).toBe('https://cdn.test/photo');
    expect(mockLoadAsync).toHaveBeenCalledWith('https://cdn.test/photo', {
      maxWidth: 1440,
      maxHeight: 1920,
    });
    expect(release).toHaveBeenCalledTimes(1);
    expect(mockDownloadFileAsync).not.toHaveBeenCalled();
    expect(mockWriteToCacheAsync).not.toHaveBeenCalled();
  });

  it.each([null, 'file:///existing/photo.jpg'])(
    'cache path %p uses fallback URL or keeps its existing scheme',
    async (path) => {
      const post = photoPost();
      mockSignPostMedia.mockResolvedValue([{ ...post, photo_url: 'https://signed.test/photo' }]);
      mockGetCachePathAsync.mockResolvedValue(path);
      expect(
        (await prepareFeedPostMedia([post])).get(feedPostPreparationKey(post))?.photo_url,
      ).toBe(path ?? 'https://signed.test/photo');
    },
  );

  it('cache write failure releases the decoded image and temporary file without marking it ready', async () => {
    const post = photoPost();
    mockSignPostMedia.mockResolvedValue([{ ...post, photo_url: 'https://signed.test/photo' }]);
    mockWriteToCacheAsync.mockRejectedValueOnce(Error('cache unavailable'));
    expect(await prepareFeedPostMedia([post])).toEqual(new Map());
    expect(release).toHaveBeenCalledTimes(1);
    expect(mockDeleteTemporaryFile).toHaveBeenCalledTimes(1);
  });

  it('failed download before file creation does not attempt deletion or decoding', async () => {
    const post = photoPost();
    mockTemporaryFile.exists = false;
    mockSignPostMedia.mockResolvedValue([{ ...post, photo_url: 'https://signed.test/photo' }]);
    mockDownloadFileAsync.mockRejectedValueOnce(Error('network unavailable'));
    expect(await prepareFeedPostMedia([post])).toEqual(new Map());
    expect(mockDeleteTemporaryFile).not.toHaveBeenCalled();
    expect(mockLoadAsync).not.toHaveBeenCalled();
  });

  it('unavailable video cannot become ready while authorized video needs no image decode', async () => {
    const post = { ...photoPost(), photo_url: null, video_url: 'private/video' };
    mockSignPostMedia
      .mockResolvedValueOnce([{ ...post, video_url: null }])
      .mockResolvedValueOnce([{ ...post, video_url: 'https://signed.test/video' }]);
    expect(await prepareFeedPostMedia([post])).toEqual(new Map());
    expect((await prepareFeedPostMedia([post])).get(feedPostPreparationKey(post))?.video_url).toBe(
      'https://signed.test/video',
    );
    expect(mockLoadAsync).not.toHaveBeenCalled();
  });
});
