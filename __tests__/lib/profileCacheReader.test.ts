import { createProfileCacheReader, PROFILE_CACHE_WAIT_MS } from '../../lib/profileFetchPolicy';

function deferred() {
  let resolve!: (value: string | null) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string | null>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => jest.useFakeTimers({ now: 10_000 }));
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test.each(['synthetic cache', null])('returns timely presentation (%s) without retaining a timer', async value => {
  const load = jest.fn().mockResolvedValue(value);
  const read = createProfileCacheReader(load);
  await expect(read('synthetic')).resolves.toBe(value);
  await expect(read('another')).resolves.toBe(value);
  expect(load.mock.calls).toEqual([['synthetic'], ['another']]);
  expect(jest.getTimerCount()).toBe(0);
});

test.each(['reject', 'throw'] as const)('storage %s is a cache miss, not an account failure or deletion', async mode => {
  const load = jest.fn(() => {
    if (mode === 'throw') throw Error('native unavailable');
    return Promise.reject(Error('disk unavailable'));
  });
  const read = createProfileCacheReader(load);
  await expect(read('synthetic')).resolves.toBeNull();
  await expect(read('synthetic')).resolves.toBeNull();
  expect(load).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
});

test.each(['resolve', 'reject'] as const)('timeout keeps the native slot until real %s, without late cache delivery', async outcome => {
  const pending = deferred();
  const load = jest.fn().mockReturnValueOnce(pending.promise).mockResolvedValue('fresh');
  const read = createProfileCacheReader(load);
  const first = read('account-a');
  for (let i = 0; i < 100; i++) await expect(read(i % 2 ? 'account-b' : 'account-a')).resolves.toBeNull();
  await jest.advanceTimersByTimeAsync(PROFILE_CACHE_WAIT_MS);
  await expect(first).resolves.toBeNull();
  await expect(read('account-a')).resolves.toBeNull();
  expect(load).toHaveBeenCalledTimes(1);
  if (outcome === 'resolve') pending.resolve('obsolete');
  else pending.reject(Error('late native error'));
  await Promise.resolve();
  await expect(first).resolves.toBeNull();
  await expect(read('account-b')).resolves.toBe('fresh');
  expect(jest.getTimerCount()).toBe(0);
});

test('elapsed wall time rejects a late cache result before a suspended timer runs', async () => {
  const pending = deferred();
  const read = createProfileCacheReader(() => pending.promise);
  const result = read('synthetic');
  jest.setSystemTime(10_000 + PROFILE_CACHE_WAIT_MS);
  pending.resolve('too late');
  await expect(result).resolves.toBeNull();
  expect(jest.getTimerCount()).toBe(0);
});
