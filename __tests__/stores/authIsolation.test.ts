import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../../types/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../../stores/useAuthStore';
import { supabase } from '../../lib/supabase';
import { executeCommand } from '../../lib/commandGateway';
import { runMemberRead } from '../../lib/runMemberRead';
import { waitForProfileRetry, profileCacheKey } from '../../lib/profileFetchPolicy';
import { shouldAutoCompleteOnboarding } from '../../lib/onboardingGate';
import { filterContent } from '../../lib/contentFilter';
import { unregisterCurrentPushInstallation } from '../../lib/pushNotifications';
import { queryClient } from '../../lib/queryClient';
import { queryCacheStorageKey } from '../../lib/queryPersistence';
import { reportOperationalFailure } from '../../lib/telemetry';

jest.mock('../../lib/supabase');
jest.mock('../../lib/commandGateway', () => ({ executeCommand: jest.fn() }));
jest.mock('../../lib/runMemberRead', () => ({ runMemberRead: jest.fn() }));
jest.mock('../../lib/profileFetchPolicy', () => ({
  ...jest.requireActual('../../lib/profileFetchPolicy'),
  waitForProfileRetry: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../lib/onboardingGate', () => ({ shouldAutoCompleteOnboarding: jest.fn() }));
jest.mock('../../lib/contentFilter', () => ({ filterContent: jest.fn() }));
jest.mock('../../lib/pushNotifications', () => ({ unregisterCurrentPushInstallation: jest.fn() }));
jest.mock('../../lib/realtimeClient', () => ({ closeRealtimeConnection: jest.fn() }));
jest.mock('../../lib/queryClient', () => ({ queryClient: { clear: jest.fn() } }));
jest.mock('../../lib/telemetry', () => ({ reportOperationalFailure: jest.fn() }));

const session = (id = 'member-a', role = 'authenticated') => ({ user: { id, role } }) as Session;
const profile = (extra: Partial<Profile> = {}) =>
  ({
    id: 'member-a',
    username: 'synthetic',
    onboarding_completed_at: '2026-01-01',
    ...extra,
  }) as Profile;
const read = jest.mocked(runMemberRead);
const command = jest.mocked(executeCommand);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    session: session(),
    profile: null,
    isLoading: false,
    isProfileLoading: false,
    profileLoadState: 'idle',
  });
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
  jest.mocked(AsyncStorage.setItem).mockResolvedValue();
  jest.mocked(AsyncStorage.removeItem).mockResolvedValue();
  jest.mocked(shouldAutoCompleteOnboarding).mockReturnValue(false);
  jest.mocked(filterContent).mockReturnValue({ ok: true });
  jest.mocked(waitForProfileRetry).mockResolvedValue();
  jest.mocked(unregisterCurrentPushInstallation).mockResolvedValue();
  jest.mocked(reportOperationalFailure).mockImplementation(() => {});
  read.mockResolvedValue({ data: profile(), error: null });
  command.mockResolvedValue({ data: profile(), error: null });
  jest.mocked(supabase.auth.signOut).mockResolvedValue({ error: null });
});

test('logout clears only the previous member caches and resets presentation', () => {
  useAuthStore.getState().setProfile(profile());
  useAuthStore.getState().setSession(null);
  expect(queryClient.clear).toHaveBeenCalled();
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith(profileCacheKey('member-a'));
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith(queryCacheStorageKey('member-a'));
  expect(useAuthStore.getState()).toMatchObject({
    session: null,
    profile: null,
    profileLoadState: 'idle',
  });
});

test('clearing a profile preserves the active gate but signed-out state is idle', () => {
  useAuthStore.setState({ profileLoadState: 'error' });
  useAuthStore.getState().setProfile(null);
  expect(useAuthStore.getState().profileLoadState).toBe('error');
  useAuthStore.setState({ session: null });
  useAuthStore.getState().setProfile(null);
  expect(useAuthStore.getState().profileLoadState).toBe('idle');
});

test('push cleanup failure cannot prevent local-only member sign-out', async () => {
  jest.mocked(unregisterCurrentPushInstallation).mockRejectedValueOnce(Error('offline'));
  await useAuthStore.getState().signOut();
  expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(useAuthStore.getState().session).toBeNull();
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith(profileCacheKey('member-a'));
});

test('employee sign-out does not unregister a member push endpoint', async () => {
  useAuthStore.setState({ session: session('employee', 'doji_employee') });
  await useAuthStore.getState().signOut();
  expect(unregisterCurrentPushInstallation).not.toHaveBeenCalled();
  expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
});

test('already signed-out cleanup does not remove a fabricated account cache', async () => {
  useAuthStore.setState({ session: null });
  await useAuthStore.getState().signOut();
  expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
});

test('concurrent profile refreshes share one request', async () => {
  const pending = deferred<{ data: Profile; error: null }>();
  read.mockReturnValueOnce(pending.promise);
  const first = useAuthStore.getState().fetchProfile('member-a');
  const second = useAuthStore.getState().fetchProfile('member-a');
  expect(second).toBe(first);
  pending.resolve({ data: profile(), error: null });
  await Promise.all([first, second]);
  expect(read).toHaveBeenCalledTimes(1);
});

test('corrupt cache is discarded and server profile replaces it', async () => {
  jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce('{broken');
  await useAuthStore.getState().fetchProfile('member-a');
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith(profileCacheKey('member-a'));
  expect(useAuthStore.getState()).toMatchObject({
    profile: { id: 'member-a' },
    profileLoadState: 'ready',
  });
});

test('a cache belonging to another member is never displayed', async () => {
  jest
    .mocked(AsyncStorage.getItem)
    .mockResolvedValueOnce(JSON.stringify(profile({ id: 'member-b' })));
  read.mockResolvedValueOnce({ data: null, error: null });
  await useAuthStore.getState().fetchProfile('member-a');
  expect(useAuthStore.getState()).toMatchObject({ profile: null, profileLoadState: 'missing' });
});

test('sign-out during cache read prevents the server read entirely', async () => {
  const cached = deferred<string | null>();
  jest.mocked(AsyncStorage.getItem).mockReturnValueOnce(cached.promise);
  const pending = useAuthStore.getState().fetchProfile('member-a');
  await Promise.resolve();
  useAuthStore.getState().setSession(null);
  cached.resolve(JSON.stringify(profile()));
  await pending;
  expect(read).not.toHaveBeenCalled();
  expect(useAuthStore.getState().profile).toBeNull();
});

test.each([false, true])(
  'late profile response after account switch is ignored (error=%s)',
  async (failure) => {
    const pending = deferred<{ data: Profile | null; error: null | { status: number } }>();
    read.mockReturnValueOnce(pending.promise);
    const request = useAuthStore.getState().fetchProfile('member-a');
    await Promise.resolve();
    await Promise.resolve();
    useAuthStore.getState().setSession(session('member-b'));
    pending.resolve({ data: failure ? null : profile(), error: failure ? { status: 403 } : null });
    await request;
    expect(useAuthStore.getState()).toMatchObject({
      session: { user: { id: 'member-b' } },
      profile: null,
    });
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  },
);

test('account switch during retry prevents a second read', async () => {
  read.mockResolvedValueOnce({ data: null, error: { message: 'network' } });
  jest.mocked(waitForProfileRetry).mockImplementationOnce(async () => {
    useAuthStore.getState().setSession(session('member-b'));
  });
  await useAuthStore.getState().fetchProfile('member-a');
  expect(read).toHaveBeenCalledTimes(1);
  expect(useAuthStore.getState().profile).toBeNull();
});

test.each([Error('offline'), 'offline'])(
  'thrown read failures remain recoverable: %s',
  async (failure) => {
    read.mockRejectedValue(failure);
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await useAuthStore.getState().fetchProfile('member-a');
      expect(read).toHaveBeenCalledTimes(3);
      expect(reportOperationalFailure).toHaveBeenCalledWith(
        'startup',
        'profile_bootstrap_failed',
        expect.objectContaining({ message: 'offline' }),
        { attempts: 3, hadCachedProfile: false },
      );
      expect(useAuthStore.getState()).toMatchObject({
        profileLoadState: 'error',
        isProfileLoading: false,
        isLoading: false,
      });
    } finally {
      warning.mockRestore();
    }
  },
);

test('a diagnostic failure cannot replace the recoverable profile state', async () => {
  read.mockResolvedValue({ data: null, error: { status: 403 } });
  jest.mocked(reportOperationalFailure).mockImplementation(() => {
    throw Error('telemetry');
  });
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await expect(useAuthStore.getState().fetchProfile('member-a')).resolves.toBeUndefined();
    expect(useAuthStore.getState().profileLoadState).toBe('error');
  } finally {
    warning.mockRestore();
  }
});

test.each(['patched', 'error', 'empty'] as const)(
  'returning-member onboarding uses one atomic command (%s)',
  async (result) => {
    jest.mocked(shouldAutoCompleteOnboarding).mockReturnValue(true);
    read.mockResolvedValue({
      data: profile({ onboarding_completed_at: null, created_at: '2025-01-01' }),
      error: null,
    });
    command.mockResolvedValue({
      data: result === 'patched' ? profile({ onboarding_completed_at: '2025-01-01' }) : null,
      error: result === 'error' ? Error('offline') : null,
    });
    await useAuthStore.getState().fetchProfile('member-a');
    expect(command).toHaveBeenCalledTimes(1);
    expect(command).toHaveBeenCalledWith('update_own_profile', {
      p_patch: { onboarding_completed_at: '2025-01-01' },
      p_idempotency_key: expect.any(String),
    });
    expect(useAuthStore.getState().profile?.onboarding_completed_at).toBe('2025-01-01');
  },
);

test('late onboarding response cannot repopulate a signed-out profile', async () => {
  jest.mocked(shouldAutoCompleteOnboarding).mockReturnValue(true);
  command.mockImplementationOnce(async () => {
    useAuthStore.getState().setSession(null);
    return { data: profile(), error: null };
  });
  await useAuthStore.getState().fetchProfile('member-a');
  expect(useAuthStore.getState().profile).toBeNull();
});

test.each(['username', 'display_name', 'bio'] as const)(
  'blocked %s never reaches profile write',
  async (field) => {
    jest.mocked(filterContent).mockReturnValue({ ok: false, reason: 'Blocked content' });
    await expect(useAuthStore.getState().updateProfile({ [field]: 'synthetic' })).rejects.toThrow(
      'Blocked content',
    );
    expect(command).not.toHaveBeenCalled();
  },
);

test('missing profile write result is rejected rather than presented as success', async () => {
  command.mockResolvedValue({ data: null, error: null });
  await expect(useAuthStore.getState().updateProfile({ bio: 'synthetic' })).rejects.toThrow(
    'Profile update returned no row',
  );
});

test('late profile update cannot overwrite another signed-in member', async () => {
  command.mockImplementationOnce(async () => {
    useAuthStore.getState().setSession(session('member-b'));
    return { data: profile(), error: null };
  });
  await useAuthStore.getState().updateProfile({ bio: 'synthetic' });
  expect(useAuthStore.getState().profile).toBeNull();
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});
