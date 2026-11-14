import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../../types/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../../stores/useAuthStore';
import { runMemberRead } from '../../lib/runMemberRead';
import { PROFILE_CACHE_WAIT_MS } from '../../lib/profileFetchPolicy';

jest.mock('../../lib/supabase');
jest.mock('../../lib/runMemberRead', () => ({ runMemberRead: jest.fn() }));
jest.mock('../../lib/realtimeClient', () => ({ closeRealtimeConnection: jest.fn() }));
jest.mock('../../lib/queryClient', () => ({ queryClient: { clear: jest.fn() } }));
jest.mock('../../lib/onboardingGate', () => ({ shouldAutoCompleteOnboarding: () => false }));
const session = (id: string) => ({ user: { id } }) as Session;
const profile = (id: string, bio: string) => ({ id, bio }) as Profile;
const read = jest.mocked(runMemberRead<{ data: Profile | null; error: unknown }>);
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
let completeDisk: (value: string | null) => void;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  read.mockReset();
  useAuthStore.setState({ session: null });
  useAuthStore.setState({ session: session('a'), profile: null, profileLoadState: 'idle',
    isLoading: true, isProfileLoading: false });
  jest.mocked(AsyncStorage.getItem).mockReturnValue(new Promise(resolve => { completeDisk = resolve; }));
});
afterEach(async () => { completeDisk(null); await flush(); jest.clearAllTimers(); jest.useRealTimers(); });

test('stalled disk yields to the authorized server read and cannot replace its later result', async () => {
  read.mockResolvedValue({ data: profile('a', 'server'), error: null });
  const pending = useAuthStore.getState().fetchProfile('a');
  await flush();
  expect(read).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(PROFILE_CACHE_WAIT_MS);
  await pending;
  expect(useAuthStore.getState()).toMatchObject({ profile: { bio: 'server' },
    profileLoadState: 'ready', isLoading: false, isProfileLoading: false });
  completeDisk(JSON.stringify(profile('a', 'old disk')));
  await flush();
  expect(useAuthStore.getState().profile?.bio).toBe('server');
  expect(read).toHaveBeenCalledTimes(1);
});

test('A to B to A never joins or applies the earlier lifetime disk snapshot', async () => {
  const first = useAuthStore.getState().fetchProfile('a');
  await flush();
  useAuthStore.getState().setSession(session('b'));
  useAuthStore.getState().setSession(session('a'));
  read.mockResolvedValue({ data: profile('a', 'new lifetime'), error: null });
  const current = useAuthStore.getState().fetchProfile('a');
  await current;
  expect(AsyncStorage.getItem).toHaveBeenCalledTimes(1);
  completeDisk(JSON.stringify(profile('a', 'old lifetime')));
  await first;
  expect(useAuthStore.getState().profile?.bio).toBe('new lifetime');
  expect(read).toHaveBeenCalledTimes(1);
});

test('disk timeout does not authorize the account or turn a server failure into missing', async () => {
  read.mockResolvedValue({ data: null, error: { status: 403, message: 'forbidden' } });
  const pending = useAuthStore.getState().fetchProfile('a');
  await flush();
  await jest.advanceTimersByTimeAsync(PROFILE_CACHE_WAIT_MS);
  await pending;
  expect(useAuthStore.getState()).toMatchObject({ profile: null, profileLoadState: 'error', isLoading: false });
});
