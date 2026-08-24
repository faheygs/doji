import { useAuthStore } from '../../stores/useAuthStore';
import { supabase } from '../../lib/supabase';
import { mergeNotificationPreferences } from '../../lib/notificationPreferences';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { closeRealtimeConnection } from '../../lib/realtimeClient';

jest.mock('../../lib/supabase');
jest.mock('../../lib/realtimeClient', () => ({ closeRealtimeConnection: jest.fn() }));

const mockFrom = supabase.from as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;

/** Build a chain that handles both the initial select and any subsequent update. */
function makeChain(data: unknown, error: unknown = null) {
  const chain: Record<string, jest.Mock> = {};
  ['select', 'update', 'eq', 'abortSignal'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain.maybeSingle = jest.fn().mockResolvedValue({ data, error });
  return chain;
}

function makeRpcChain(data: unknown, error: unknown = null) {
  return {
    abortSignal: jest.fn().mockResolvedValue({ data, error }),
  };
}

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      session: null,
      profile: null,
      isLoading: true,
      isProfileLoading: false,
    });
    jest.clearAllMocks();
  });

  describe('setSession', () => {
    it('updates session state', () => {
      const mockSession = { user: { id: 'user-1' }, access_token: 'token' } as any;
      useAuthStore.getState().setSession(mockSession);
      expect(useAuthStore.getState().session).toBe(mockSession);
      expect(closeRealtimeConnection).toHaveBeenCalledTimes(1);
    });

    it('recreates realtime when the authenticated account changes', () => {
      useAuthStore.setState({ session: { user: { id: 'user-1' } } as any });

      useAuthStore.getState().setSession({ user: { id: 'user-2' } } as any);

      expect(closeRealtimeConnection).toHaveBeenCalledTimes(1);
    });

    it('keeps realtime connected when only the session token refreshes', () => {
      useAuthStore.setState({ session: { user: { id: 'user-1' } } as any });

      useAuthStore.getState().setSession({ user: { id: 'user-1' } } as any);

      expect(closeRealtimeConnection).not.toHaveBeenCalled();
    });

    it('sets session to null', () => {
      useAuthStore.getState().setSession(null);
      expect(useAuthStore.getState().session).toBeNull();
    });
  });

  describe('setProfile', () => {
    it('updates profile state', () => {
      const mockProfile = { id: 'user-1', username: 'john' } as any;
      useAuthStore.getState().setProfile(mockProfile);
      expect(useAuthStore.getState().profile).toBe(mockProfile);
    });
  });

  describe('setLoading', () => {
    it('updates loading state', () => {
      useAuthStore.getState().setLoading(false);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });
  });

  describe('signOut', () => {
    it('calls supabase signOut and clears state', async () => {
      (supabase.auth.signOut as jest.Mock).mockResolvedValue({});
      useAuthStore.setState({
        session: { user: { id: 'u1' } } as any,
        profile: { id: 'u1' } as any,
      });

      await useAuthStore.getState().signOut();

      expect(supabase.auth.signOut).toHaveBeenCalled();
      expect(useAuthStore.getState().session).toBeNull();
      expect(useAuthStore.getState().profile).toBeNull();
    });
  });

  describe('fetchProfile', () => {
    it('renders the account-scoped cached profile while the server reconciles', async () => {
      const cached = {
        id: 'user-1', username: 'cached', xp: 10, onboarding_completed_at: '2026-01-01',
      };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(cached));
      let finishRequest: ((value: unknown) => void) | undefined;
      mockRpc.mockReturnValue({
        abortSignal: jest.fn(() => new Promise((resolve) => { finishRequest = resolve; })),
      });
      useAuthStore.setState({ session: { user: { id: 'user-1' } } as any });

      const pending = useAuthStore.getState().fetchProfile('user-1');
      await Promise.resolve();
      await Promise.resolve();
      expect(useAuthStore.getState().profile).toMatchObject({ id: 'user-1', username: 'cached' });
      expect(useAuthStore.getState().isLoading).toBe(false);

      finishRequest?.({ data: { ...cached, username: 'fresh' }, error: null });
      await pending;
      expect(useAuthStore.getState().profile).toMatchObject({ username: 'fresh' });
    });

    it('fetches profile and updates state', async () => {
      // onboarding_completed_at set → no auto-complete second query
      const mockProfile = {
        id: 'user-1',
        username: 'testuser',
        xp: 100,
        onboarding_completed_at: new Date().toISOString(),
      };
      mockRpc.mockReturnValue(makeRpcChain(mockProfile));
      useAuthStore.setState({ session: { user: { id: 'user-1' } } as any });

      await useAuthStore.getState().fetchProfile('user-1');

      expect(mockRpc).toHaveBeenCalledWith('get_own_profile');
      expect(useAuthStore.getState().profile).toMatchObject({
        id: 'user-1',
        username: 'testuser',
        xp: 100,
      });
    });

    it('sets profile to null when not found', async () => {
      mockRpc.mockReturnValue(makeRpcChain(null));
      useAuthStore.setState({ session: { user: { id: 'nonexistent' } } as any });

      await useAuthStore.getState().fetchProfile('nonexistent');
      expect(useAuthStore.getState().profile).toBeNull();
    });

    it('does not throw on error, logs in dev', async () => {
      mockRpc.mockReturnValue(makeRpcChain(null, { message: 'connection failed' }));
      useAuthStore.setState({ session: { user: { id: 'user-1' } } as any });

      await expect(useAuthStore.getState().fetchProfile('user-1')).resolves.not.toThrow();
    });
  });

  describe('updateProfile', () => {
    it('updates profile on server and in state', async () => {
      const updated = { id: 'user-1', username: 'testuser', display_name: 'New Name' };
      mockRpc.mockResolvedValue({ data: updated, error: null });

      useAuthStore.setState({
        session: { user: { id: 'user-1' } } as any,
        profile: { id: 'user-1', username: 'testuser', display_name: 'Old Name' } as any,
      });

      await useAuthStore.getState().updateProfile({ display_name: 'New Name' });
      expect(mockRpc).toHaveBeenCalledWith(
        'update_own_profile',
        expect.objectContaining({ p_patch: { display_name: 'New Name' } }),
      );
      expect(useAuthStore.getState().profile).toMatchObject({
        id: 'user-1',
        display_name: 'New Name',
      });
    });

    it('throws when not authenticated', async () => {
      useAuthStore.setState({ session: null });
      await expect(
        useAuthStore.getState().updateProfile({ display_name: 'Test' }),
      ).rejects.toThrow('Not authenticated');
    });

    it('throws on supabase error', async () => {
      mockRpc.mockResolvedValue({ data: null, error: new Error('RLS violation') });

      useAuthStore.setState({
        session: { user: { id: 'user-1' } } as any,
      });

      await expect(
        useAuthStore.getState().updateProfile({ display_name: 'Test' }),
      ).rejects.toThrow('RLS violation');
    });
  });
});
