import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../../types/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../../stores/useAuthStore';
import { runMemberRead } from '../../lib/runMemberRead';
import { executeCommand } from '../../lib/commandGateway';

jest.mock('../../lib/supabase');
jest.mock('../../lib/runMemberRead', () => ({ runMemberRead: jest.fn() }));
jest.mock('../../lib/commandGateway', () => ({ executeCommand: jest.fn() }));
jest.mock('../../lib/realtimeClient', () => ({ closeRealtimeConnection: jest.fn() }));
jest.mock('../../lib/queryClient', () => ({ queryClient: { clear: jest.fn() } }));
jest.mock('../../lib/profileFetchPolicy', () => ({
  ...jest.requireActual('../../lib/profileFetchPolicy'), waitForProfileRetry: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../lib/onboardingGate', () => ({ shouldAutoCompleteOnboarding: () => false }));
jest.mock('../../lib/contentFilter', () => ({ filterContent: () => ({ ok: true }) }));
const profile = (bio = 'old') => ({ id: 'synthetic', bio }) as Profile;
const read = jest.mocked(runMemberRead<{ data: Profile | null; error: unknown }>);
const command = jest.mocked(executeCommand);
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  jest.clearAllMocks();
  read.mockReset();
  command.mockReset();
  useAuthStore.setState({ session: null });
  useAuthStore.setState({
    session: { user: { id: 'synthetic' } } as Session,
    profile: null, profileLoadState: 'idle', isLoading: false, isProfileLoading: false,
  });
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
  read.mockResolvedValue({ data: profile(), error: null });
  command.mockResolvedValue({ data: profile('saved'), error: null });
});

test.each(['old-row', 'missing', 'error', 'retryable-error'] as const)('late %s read cannot replace a newer confirmed save', async outcome => {
  const pending = deferred<{ data: Profile | null; error: unknown }>();
  read.mockReturnValueOnce(pending.promise);
  const request = useAuthStore.getState().fetchProfile('synthetic');
  await flush();
  await useAuthStore.getState().updateProfile({ bio: 'saved' });
  pending.resolve({ data: outcome === 'old-row' ? profile() : null,
    error: outcome === 'error' ? { status: 403 } : outcome === 'retryable-error' ? { status: 503 } : null });
  await request;
  expect(useAuthStore.getState()).toMatchObject({
    profile: { bio: 'saved' }, profileLoadState: 'ready', isProfileLoading: false, isLoading: false,
  });
  expect(read).toHaveBeenCalledTimes(1);
  expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
});

test('late persisted baseline cannot replace a confirmed profile or start a stale RPC', async () => {
  useAuthStore.setState({ isLoading: true, isProfileLoading: true });
  const cached = deferred<string | null>();
  jest.mocked(AsyncStorage.getItem).mockReturnValueOnce(cached.promise);
  const request = useAuthStore.getState().fetchProfile('synthetic');
  await flush();
  useAuthStore.getState().setProfile(profile('created'));
  cached.resolve(JSON.stringify(profile()));
  await request;
  expect(useAuthStore.getState().profile?.bio).toBe('created');
  expect(useAuthStore.getState()).toMatchObject({ isLoading: false, isProfileLoading: false });
  expect(read).not.toHaveBeenCalled();
});

test('a request for another user cannot clear the current account loading gate', async () => {
  useAuthStore.setState({ isLoading: true, isProfileLoading: true });
  await useAuthStore.getState().fetchProfile('another-user');
  expect(useAuthStore.getState()).toMatchObject({ isLoading: true, isProfileLoading: true });
  expect(read).not.toHaveBeenCalled();
});

test('new same-account read does not join the superseded request or lose its loading ownership', async () => {
  const old = deferred<{ data: Profile; error: null }>();
  const fresh = deferred<{ data: Profile; error: null }>();
  read.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  const first = useAuthStore.getState().fetchProfile('synthetic');
  await flush();
  useAuthStore.getState().setProfile(profile('local'));
  const second = useAuthStore.getState().fetchProfile('synthetic');
  expect(second).not.toBe(first);
  await flush();
  useAuthStore.setState({ isProfileLoading: true });
  old.resolve({ data: profile('stale'), error: null });
  await first;
  expect(useAuthStore.getState().isProfileLoading).toBe(true);
  expect(useAuthStore.getState().profile?.bio).toBe('local');
  fresh.resolve({ data: profile('fresh'), error: null });
  await second;
  expect(useAuthStore.getState()).toMatchObject({ profile: { bio: 'fresh' }, isProfileLoading: false });
});

test('receipt replay starts a fresh reconciliation, not the older pre-save request', async () => {
  command.mockResolvedValueOnce({ data: null, error: { code: 'DOJI_COMMAND_TIMEOUT', message: 'unknown', details: null, hint: null } });
  await expect(useAuthStore.getState().updateProfile({ bio: 'saved' })).rejects.toMatchObject({ code: 'DOJI_COMMAND_TIMEOUT' });
  const old = deferred<{ data: Profile; error: null }>();
  read.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ data: profile('latest-server'), error: null });
  const pending = useAuthStore.getState().fetchProfile('synthetic');
  await flush();
  await useAuthStore.getState().retryProfileUpdate();
  await flush();
  old.resolve({ data: profile('stale'), error: null });
  await pending;
  expect(read).toHaveBeenCalledTimes(2);
  expect(command.mock.calls[1][1]).toEqual(command.mock.calls[0][1]);
  expect(useAuthStore.getState().profile?.bio).toBe('latest-server');
});
