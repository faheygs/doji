import { createImagePreparationQueue } from '../../lib/imagePreparation';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(0); });
afterEach(() => { jest.useRealTimers(); });

test('returns the original prepared representation and clears its timer', async () => {
  const run = createImagePreparationQueue(), result = { uri: 'file:///prepared.jpg', width: 1536, height: 2048 };
  await expect(run(async () => result)).resolves.toBe(result);
  expect(jest.getTimerCount()).toBe(0);
});

test.each([Error('native failure'), undefined, null])('preserves native rejection without a retry (%s)', async (error) => {
  const run = createImagePreparationQueue(), work = jest.fn().mockRejectedValue(error);
  await expect(run(work)).rejects.toBe(error);
  expect(work).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('synchronous native exceptions release their capacity', async () => {
  const run = createImagePreparationQueue();
  await expect(run(() => { throw Error('native'); })).rejects.toThrow('native');
  await expect(run(async () => 'next')).resolves.toBe('next');
});

test('only two native jobs run; waiting work starts when a real slot settles', async () => {
  const run = createImagePreparationQueue(), first = deferred<string>(), second = deferred<string>();
  const third = jest.fn().mockResolvedValue('third');
  const a = run(() => first.promise), b = run(() => second.promise), c = run(third);
  await flush(); expect(third).not.toHaveBeenCalled();
  first.resolve('first'); await a; await flush();
  await expect(c).resolves.toBe('third');
  second.resolve('second'); await b;
  expect(jest.getTimerCount()).toBe(0);
});

test('queue is bounded and queued deadlines count from arrival, not native start', async () => {
  const run = createImagePreparationQueue(), native = deferred<string>();
  const work = jest.fn(() => native.promise);
  const outcomes = Array.from({ length: 6 }, () => run(work).catch((error: unknown) => error));
  await flush(); expect(work).toHaveBeenCalledTimes(2);
  await expect(run(work)).rejects.toMatchObject({ code: 'DOJI_IMAGE_PREPARATION_BUSY' });
  await jest.advanceTimersByTimeAsync(15_000);
  for (const outcome of outcomes) await expect(outcome).resolves.toMatchObject({ code: 'DOJI_IMAGE_PREPARATION_TIMEOUT' });
  expect(work).toHaveBeenCalledTimes(2);
  native.resolve('late'); await flush();
  expect(work).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
});

test.each(['resolve', 'reject'] as const)('timed-out native %s retains its slot until actual settlement', async (end) => {
  const run = createImagePreparationQueue(), first = deferred<string>(), second = deferred<string>();
  const a = run(() => first.promise).catch((error: unknown) => error);
  const b = run(() => second.promise).catch((error: unknown) => error);
  await jest.advanceTimersByTimeAsync(15_000);
  await expect(a).resolves.toMatchObject({ code: 'DOJI_IMAGE_PREPARATION_TIMEOUT' });
  await expect(b).resolves.toMatchObject({ code: 'DOJI_IMAGE_PREPARATION_TIMEOUT' });
  const next = jest.fn().mockResolvedValue('next'), c = run(next);
  await flush(); expect(next).not.toHaveBeenCalled();
  if (end === 'resolve') first.resolve('late'); else first.reject(Error('late native failure'));
  await flush(); await expect(c).resolves.toBe('next');
  second.resolve('late'); await flush();
  expect(next).toHaveBeenCalledTimes(1);
});

test.each(['resolve', 'reject'] as const)('suspension deadline rejects a late %s even before timer delivery', async (end) => {
  const run = createImagePreparationQueue(), native = deferred<string>();
  const result = run(() => native.promise).catch((error: unknown) => error);
  await flush(); jest.setSystemTime(15_001);
  if (end === 'resolve') native.resolve('late'); else native.reject(Error('late'));
  await expect(result).resolves.toMatchObject({ code: 'DOJI_IMAGE_PREPARATION_TIMEOUT' });
  expect(jest.getTimerCount()).toBe(0);
});

test('suspension before native admission prevents both queued and not-yet-started work', async () => {
  const run = createImagePreparationQueue(), first = deferred<string>(), second = deferred<string>();
  const outcomes = [run(() => first.promise), run(() => second.promise)].map((p) => p.catch((e: unknown) => e));
  await flush();
  const queued = jest.fn().mockResolvedValue('must not start');
  const waiting = run(queued).catch((e: unknown) => e);
  jest.setSystemTime(15_001);
  first.resolve('late'); second.resolve('late');
  await flush(); await Promise.all(outcomes);
  await expect(waiting).resolves.toMatchObject({ code: 'DOJI_IMAGE_PREPARATION_TIMEOUT' });
  expect(queued).not.toHaveBeenCalled();
  const notStarted = run(queued).catch((e: unknown) => e);
  jest.setSystemTime(30_002);
  await expect(notStarted).resolves.toMatchObject({ code: 'DOJI_IMAGE_PREPARATION_TIMEOUT' });
  expect(queued).not.toHaveBeenCalled();
});
