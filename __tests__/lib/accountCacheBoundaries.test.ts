import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadRecentProfileSearches,
  saveRecentProfileSearches,
  normalizeRecentProfileSearches,
  type RecentProfileSearch,
} from '../../lib/recentProfileSearches';
import {
  createInitialSessionBootstrap,
  initialSessionBootstrap,
  observeSessionBootstrap,
} from '../../lib/initialSessionBootstrap';
import { supabase } from '../../lib/supabase';
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { getSession: jest.fn() } } }));
const profile: RecentProfileSearch = {
  id: 'p',
  username: 'person',
  display_name: 'Person',
  avatar_url: null,
  avatar_gradient: ['#111', '#222'],
  equipped_border_key: null,
};
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});
afterEach(() => jest.useRealTimers());
test('saved profile search history is separated by member and can be cleared independently', async () => {
  await saveRecentProfileSearches('a', [profile]);
  await saveRecentProfileSearches('b', [{ ...profile, id: 'other' }]);
  expect(await loadRecentProfileSearches('a')).toEqual([profile]);
  expect(await loadRecentProfileSearches('b')).toEqual([{ ...profile, id: 'other' }]);
  expect(await loadRecentProfileSearches('new')).toEqual([]);
  await saveRecentProfileSearches('a', []);
  expect(await loadRecentProfileSearches('a')).toEqual([]);
  expect(await loadRecentProfileSearches('b')).toHaveLength(1);
});
test.each(['{', 'null', '{}', '42'])(
  'corrupt/non-list disk data %p does not become history',
  async (raw) => {
    await AsyncStorage.setItem('doji:recent-profile-searches:a', raw);
    expect(await loadRecentProfileSearches('a')).toEqual([]);
  },
);
test.each([
  null,
  'bad',
  { id: 1 },
  { username: null },
  { display_name: null },
  { avatar_url: 1 },
  { avatar_gradient: ['#111'] },
  { avatar_gradient: ['#111', 2] },
  { equipped_border_key: 1 },
])('invalid stored entry %p is discarded without losing valid neighbors', (patch) => {
  const malformed = patch && typeof patch === 'object' ? { ...profile, ...patch } : patch;
  expect(normalizeRecentProfileSearches([malformed, profile])).toEqual([profile]);
});
test('valid URLs/borders survive normalization and persisted history is capped at ten', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    ...profile,
    id: String(i),
    avatar_url: 'https://example.test/avatar',
    equipped_border_key: 'border_gold',
  }));
  expect(normalizeRecentProfileSearches(rows)).toEqual(rows.slice(0, 10));
});
test('disk errors are not mistaken for an empty successful history or successful save', async () => {
  (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(Error('read failed'));
  await expect(loadRecentProfileSearches('a')).rejects.toThrow('read failed');
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(Error('write failed'));
  await expect(saveRecentProfileSearches('a', [profile])).rejects.toThrow('write failed');
});
test.each(['resolve', 'reject'] as const)(
  'unmounted bootstrap observer ignores late %s and cancels deadline',
  async (outcome) => {
    jest.useFakeTimers();
    let settle!: () => void;
    const promise = new Promise<null>((resolve, reject) => {
      settle = () => (outcome === 'resolve' ? resolve(null) : reject(Error('late')));
    });
    const observer = { onSession: jest.fn(), onError: jest.fn(), onTimeout: jest.fn() };
    const stop = observeSessionBootstrap(promise, 100, observer);
    stop();
    settle();
    await Promise.resolve();
    jest.advanceTimersByTime(200);
    for (const callback of Object.values(observer)) expect(callback).not.toHaveBeenCalled();
  },
);
test('bootstrap rejection reports the original error and cancels its UI deadline', async () => {
  jest.useFakeTimers();
  const error = Error('auth storage unavailable');
  const observer = { onSession: jest.fn(), onError: jest.fn(), onTimeout: jest.fn() };
  observeSessionBootstrap(Promise.reject(error), 100, observer);
  await Promise.resolve();
  jest.advanceTimersByTime(200);
  expect(observer.onError).toHaveBeenCalledWith(error);
  expect(observer.onSession).not.toHaveBeenCalled();
  expect(observer.onTimeout).not.toHaveBeenCalled();
});
test('successful restoration is reused rather than taking another auth lock', async () => {
  const loader = jest.fn().mockResolvedValue(null);
  const bootstrap = createInitialSessionBootstrap(loader);
  await bootstrap.get();
  await bootstrap.get();
  expect(loader).toHaveBeenCalledTimes(1);
});
test('exported bootstrap propagates Auth failure and then returns its exact restored session', async () => {
  const error = Error('storage failed');
  const session = { user: { id: 'synthetic-member' }, access_token: 'synthetic' };
  (supabase.auth.getSession as jest.Mock)
    .mockResolvedValueOnce({ data: { session: null }, error })
    .mockResolvedValueOnce({ data: { session }, error: null });
  await expect(initialSessionBootstrap.get()).rejects.toBe(error);
  await expect(initialSessionBootstrap.get()).resolves.toBe(session);
  expect(supabase.auth.getSession).toHaveBeenCalledTimes(2);
});
