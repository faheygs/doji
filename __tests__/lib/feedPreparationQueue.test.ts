import type { Post } from '../../types/database';
import { createFeedPreparationQueue } from '../../lib/feedPreparationQueue';
import { prepareFeedPostMedia } from '../../lib/feedPostPreparation';
jest.mock('../../lib/feedPostPreparation', () => ({
  FEED_POST_PREPARATION_TIMEOUT_MS: 8_000,
  feedPostPreparationKey: (post: Post) => `${post.id}:${post.photo_url}`,
  prepareFeedPostMedia: jest.fn(),
}));
const prepare = jest.mocked(prepareFeedPostMedia);
const post = (id: string) => ({ id, photo_url: `${id}.jpg` }) as Post;
const ready = (item: Post) => new Map([[`${item.id}:${item.photo_url}`, item]]);
beforeEach(() => {
  jest.useFakeTimers();
  prepare.mockReset();
});
afterEach(() => jest.useRealTimers());

test('duplicate rows share one operation and completed rows clear their fallback timers', async () => {
  prepare.mockResolvedValue(ready(post('one')));
  const onReady = jest.fn(),
    queue = createFeedPreparationQueue(onReady);
  queue.enqueue(post('one'));
  queue.enqueue(post('one'));
  expect(prepare).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(0);
  expect(onReady).toHaveBeenCalledTimes(1);
  expect(onReady).toHaveBeenCalledWith(post('one'), post('one'));
  expect(jest.getTimerCount()).toBe(0);
});

test.each(['empty', 'rejected'])(
  '%s preparation releases capacity but retains the bounded fallback',
  async (kind) => {
    if (kind === 'empty') prepare.mockResolvedValue(new Map());
    else prepare.mockRejectedValue(new Error('synthetic decode failure'));
    const onReady = jest.fn(),
      queue = createFeedPreparationQueue(onReady);
    for (const id of ['one', 'two', 'three']) queue.enqueue(post(id));
    await jest.advanceTimersByTimeAsync(0);
    expect(prepare).toHaveBeenCalledTimes(3);
    expect(onReady).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(8_000);
    expect(onReady).toHaveBeenCalledTimes(3);
    expect(jest.getTimerCount()).toBe(0);
  },
);

test('queue deadlines start on arrival, not when a native slot becomes free', async () => {
  prepare.mockImplementation(() => new Promise(() => {}));
  const onReady = jest.fn(),
    queue = createFeedPreparationQueue(onReady);
  queue.enqueue(post('one'));
  queue.enqueue(post('two'));
  await jest.advanceTimersByTimeAsync(4_000);
  queue.enqueue(post('three'));
  await jest.advanceTimersByTimeAsync(4_000);
  expect(onReady).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(4_000);
  expect(onReady).toHaveBeenCalledTimes(3);
  expect(prepare).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
});

test('reset fences old results and preserves native capacity across replacement identities', async () => {
  const resolve = new Map<string, (value: Map<string, Post>) => void>();
  prepare.mockImplementation(
    ([item]) =>
      new Promise((done) => {
        resolve.set(item.id, done);
      }),
  );
  const onReady = jest.fn(),
    queue = createFeedPreparationQueue(onReady);
  queue.enqueue(post('old-one'));
  queue.enqueue(post('old-two'));
  queue.reset();
  queue.enqueue(post('new-one'));
  queue.enqueue(post('new-two'));
  expect(prepare).toHaveBeenCalledTimes(2);
  resolve.get('old-one')?.(ready(post('old-one')));
  await jest.advanceTimersByTimeAsync(0);
  expect(prepare).toHaveBeenCalledTimes(3);
  expect(onReady).not.toHaveBeenCalled();
  resolve.get('old-two')?.(ready(post('old-two')));
  await jest.advanceTimersByTimeAsync(0);
  expect(prepare).toHaveBeenCalledTimes(4);
  queue.reset();
  resolve.get('new-one')?.(ready(post('new-one')));
  resolve.get('new-two')?.(ready(post('new-two')));
  await jest.advanceTimersByTimeAsync(0);
  expect(onReady).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});
