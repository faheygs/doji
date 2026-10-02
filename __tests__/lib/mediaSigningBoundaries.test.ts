import type { Post, Report } from '../../types/database';
const mockBatch = jest.fn(),
  mockSingle = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: {
    storage: {
      from: jest.fn(() => ({ createSignedUrls: mockBatch, createSignedUrl: mockSingle })),
    },
  },
}));
let media: typeof import('../../lib/postMedia');
const originalTransforms = process.env.EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED;
const ref = (path: string) =>
  `https://storage.test/storage/v1/object/authenticated/post-media/${path}`;
const post = (path = 'photo.jpg') =>
  ({ id: 'p', photo_url: ref(path), front_photo_url: null, video_url: null }) as Post;
async function flush<T>(promise: Promise<T>): Promise<T> {
  await jest.advanceTimersByTimeAsync(24);
  return promise;
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(1000000);
  jest.resetModules();
  media = require('../../lib/postMedia');
  delete process.env.EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED;
  mockBatch.mockReset().mockImplementation(async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}` })),
    error: null,
  }));
  mockSingle.mockReset().mockImplementation(async (path: string) => ({
    data: { signedUrl: `https://signed.test/${path}` },
    error: null,
  }));
});
afterEach(() => {
  jest.useRealTimers();
  if (originalTransforms === undefined) delete process.env.EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED;
  else process.env.EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED = originalTransforms;
});
test.each([undefined, null, '', ref(''), ref('%ZZ'), 'https://cdn.test/image'])(
  'non-object media %p has no private cache key',
  (value) => expect(media.postMediaCacheKey(value)).toBeUndefined(),
);
test('cache key decodes object paths and ignores rotating tokens/fragments', () => {
  expect(media.postMediaCacheKey(ref('member%2Fphoto%20one.jpg?token=secret#fragment'))).toBe(
    'post-media:member/photo one.jpg',
  );
  expect(media.hasPrivatePostMedia(post())).toBe(true);
  expect(media.hasPrivatePostMedia({ ...post(), photo_url: null })).toBe(false);
});
test('plain media passes through without signing and source records remain unchanged', async () => {
  const value = { ...post(), photo_url: 'https://cdn.test/image' };
  expect(await media.signPostMedia([value])).toEqual([value]);
  expect(await media.signPostMedia([])).toEqual([]);
  expect(mockBatch).not.toHaveBeenCalled();
});
test.each([
  { data: null, error: null },
  { data: [], error: Error('denied') },
  { data: [{ path: 'photo.jpg' }, { signedUrl: 'invalid' }], error: null },
])('missing/error signing result %p never exposes a private reference', async (response) => {
  mockBatch.mockResolvedValue(response);
  const source = post();
  const [signed] = await flush(media.signPostMedia([source]));
  expect(signed.photo_url).toBeNull();
  expect(source.photo_url).toBe(ref('photo.jpg'));
});
test('cache serves unchanged authorized paths until the one-minute refresh boundary', async () => {
  await flush(media.signPostMedia([post()]));
  await media.signPostMedia([post()]);
  expect(mockBatch).toHaveBeenCalledTimes(1);
  jest.setSystemTime(1000000 + 840000 + 24);
  mockBatch.mockResolvedValue({
    data: [{ path: 'photo.jpg', signedUrl: 'https://signed.test/new' }],
    error: null,
  });
  const [signed] = await flush(media.signPostMedia([post()]));
  expect(mockBatch).toHaveBeenCalledTimes(2);
  expect(signed.photo_url).toBe('https://signed.test/new');
});
test('transforms affect images only; video remains original and duplicate references coalesce', async () => {
  process.env.EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED = 'true';
  const source = { ...post(), front_photo_url: ref('photo.jpg'), video_url: ref('video.mp4') };
  const [signed] = await flush(media.signPostMedia([source], 'thumbnail'));
  expect(mockBatch).toHaveBeenCalledWith(['video.mp4'], 900);
  expect(mockSingle).toHaveBeenCalledTimes(1);
  expect(mockSingle).toHaveBeenCalledWith('photo.jpg', 900, {
    transform: { width: 360, height: 360, resize: 'cover', quality: 82 },
  });
  expect(signed.front_photo_url).toBe(signed.photo_url);
  expect(signed.video_url).toBe('https://signed.test/video.mp4');
});
test.each([
  { data: null, error: null },
  { data: {}, error: null },
  { data: null, error: Error('denied') },
])('failed transformation/fallback %p leaves media unavailable', async (response) => {
  process.env.EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED = 'true';
  mockSingle.mockResolvedValue(response);
  const [signed] = await flush(media.signPostMedia([post()], 'feed'));
  expect(mockSingle).toHaveBeenCalledTimes(2);
  expect(signed.photo_url).toBeNull();
});
test('report snapshots sign only their authorized post and preserve absent posts', async () => {
  const reports = [
    { id: 'with', post: post() },
    { id: 'without', post: null },
  ] as Report[];
  const signed = await flush(media.signReportMedia(reports));
  expect(signed[0].post?.photo_url).toBe('https://signed.test/photo.jpg');
  expect(signed[1].post).toBeNull();
  expect(reports[0].post?.photo_url).toBe(ref('photo.jpg'));
});
test('signing cache evicts the oldest entry but retains a recently used entry at its 2000-entry bound', async () => {
  await flush(media.signPostMedia(Array.from({ length: 2000 }, (_, i) => post(`${i}.jpg`))));
  await media.signPostMedia([post('0.jpg')]);
  await flush(media.signPostMedia([post('2000.jpg')]));
  mockBatch.mockClear();
  await media.signPostMedia([post('0.jpg')]);
  expect(mockBatch).not.toHaveBeenCalled();
  await flush(media.signPostMedia([post('1.jpg')]));
  expect(mockBatch).toHaveBeenCalledWith(['1.jpg'], 900);
});
