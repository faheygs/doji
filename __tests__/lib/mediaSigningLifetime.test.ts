import type { Post } from '../../types/database';
const mockBatch = jest.fn(),
  mockSingle = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrls: mockBatch,
        createSignedUrl: mockSingle,
      }),
    },
  },
}));
let media: typeof import('../../lib/postMedia');
const originalTransforms = process.env.EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED;
const post = (id: string) =>
  ({
    id,
    photo_url: `https://storage.test/storage/v1/object/authenticated/post-media/${id}.jpg`,
    front_photo_url: null,
    video_url: null,
  }) as Post;
const signed = (path: string) => ({
  data: { signedUrl: `https://signed.test/${path}` },
  error: null,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.resetModules();
  media = require('../../lib/postMedia');
  process.env.EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED = 'true';
  mockBatch.mockReset().mockImplementation(async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}` })),
    error: null,
  }));
  mockSingle.mockReset().mockImplementation(async (path: string) => signed(path));
});
afterEach(() => {
  jest.useRealTimers();
  if (originalTransforms === undefined) delete process.env.EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED;
  else process.env.EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED = originalTransforms;
});

test('an image card is released without waiting for an unrelated original/video request', async () => {
  const held = deferred<unknown>();
  mockBatch.mockReturnValue(held.promise);
  void media.signPostMedia([post('slow')]);
  const ready = jest.fn();
  void media.signPostMedia([post('fast')], 'feed').then(ready);
  await jest.advanceTimersByTimeAsync(24);
  expect(ready).toHaveBeenCalledWith([
    expect.objectContaining({ photo_url: 'https://signed.test/fast.jpg' }),
  ]);
  held.resolve({ data: [], error: null });
  await jest.advanceTimersByTimeAsync(0);
});

test('a slow transformed sibling does not delay a completed card', async () => {
  const held = deferred<ReturnType<typeof signed>>();
  mockSingle.mockImplementation((path: string) =>
    path === 'slow.jpg' ? held.promise : Promise.resolve(signed(path)),
  );
  void media.signPostMedia([post('slow')], 'feed');
  const ready = jest.fn();
  void media.signPostMedia([post('fast')], 'feed').then(ready);
  await jest.advanceTimersByTimeAsync(24);
  expect(ready).toHaveBeenCalledTimes(1);
  held.resolve(signed('slow.jpg'));
  await jest.advanceTimersByTimeAsync(0);
});

test('a later mount shares the already-running object/variant request', async () => {
  const held = deferred<ReturnType<typeof signed>>();
  mockSingle.mockReturnValue(held.promise);
  const first = media.signPostMedia([post('same')], 'feed');
  await jest.advanceTimersByTimeAsync(24);
  const second = media.signPostMedia([post('same')], 'feed');
  await jest.advanceTimersByTimeAsync(24);
  expect(mockSingle).toHaveBeenCalledTimes(1);
  held.resolve(signed('same.jpg'));
  expect(await first).toEqual(await second);
});

test('native signing that ignores cancellation cannot strand callers or populate cache after expiry', async () => {
  const held = deferred<ReturnType<typeof signed>>();
  mockSingle.mockReturnValue(held.promise);
  const ready = jest.fn();
  void media.signPostMedia([post('stalled')], 'feed').then(ready);
  await jest.advanceTimersByTimeAsync(8_000);
  expect(ready).toHaveBeenCalledWith([expect.objectContaining({ photo_url: null })]);
  const duplicate = media.signPostMedia([post('stalled')], 'feed');
  await jest.advanceTimersByTimeAsync(24);
  expect(mockSingle).toHaveBeenCalledTimes(1);
  held.resolve(signed('too-late.jpg'));
  await duplicate;
  await jest.advanceTimersByTimeAsync(0);
  mockSingle.mockResolvedValue(signed('fresh.jpg'));
  const next = media.signPostMedia([post('stalled')], 'feed');
  await jest.advanceTimersByTimeAsync(24);
  expect((await next)[0].photo_url).toBe('https://signed.test/fresh.jpg');
});

test('the six-operation signing cap applies across batches and expired queued requests never start', async () => {
  const held = deferred<ReturnType<typeof signed>>();
  mockSingle.mockReturnValue(held.promise);
  const pending = [
    media.signPostMedia(
      Array.from({ length: 6 }, (_, i) => post(String(i))),
      'feed',
    ),
  ];
  await jest.advanceTimersByTimeAsync(24);
  pending.push(media.signPostMedia([post('queued')], 'feed'));
  await jest.advanceTimersByTimeAsync(24);
  expect(mockSingle).toHaveBeenCalledTimes(6);
  await jest.advanceTimersByTimeAsync(8_000);
  await Promise.all(pending);
  held.resolve(signed('late.jpg'));
  await jest.advanceTimersByTimeAsync(0);
  expect(mockSingle).toHaveBeenCalledTimes(6);
  expect(jest.getTimerCount()).toBe(0);
});

test('a late rejected transformation never starts an original-image fallback', async () => {
  const held = deferred<unknown>();
  mockSingle.mockReturnValue(held.promise);
  const pending = media.signPostMedia([post('expired')], 'feed');
  await jest.advanceTimersByTimeAsync(8_000);
  expect((await pending)[0].photo_url).toBeNull();
  held.resolve({ data: null, error: Error('late failure') });
  await jest.advanceTimersByTimeAsync(0);
  expect(mockSingle).toHaveBeenCalledTimes(1);
});

test('provider rejection is isolated and queued work starts when capacity is released', async () => {
  const held = deferred<ReturnType<typeof signed>>();
  mockSingle.mockReturnValue(held.promise);
  const first = media.signPostMedia(
    Array.from({ length: 6 }, (_, i) => post(String(i))),
    'feed',
  );
  await jest.advanceTimersByTimeAsync(24);
  const queued = media.signPostMedia([post('queued')], 'feed');
  await jest.advanceTimersByTimeAsync(24);
  mockSingle.mockRejectedValueOnce(Error('transport failed'));
  held.resolve(signed('completed.jpg'));
  await jest.advanceTimersByTimeAsync(0);
  expect(
    (await first).every((item) => item.photo_url === 'https://signed.test/completed.jpg'),
  ).toBe(true);
  expect((await queued)[0].photo_url).toBeNull();
  expect(mockSingle).toHaveBeenCalledTimes(7);
  expect(jest.getTimerCount()).toBe(0);
});
