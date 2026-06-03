import { useAuthStore } from '../../stores/useAuthStore';
import { supabase } from '../../lib/supabase';
import { mergeNotificationPreferences } from '../../lib/notificationPreferences';

jest.mock('../../lib/supabase');

const mockFrom = supabase.from as jest.Mock;

/** Build a chain that handles both the initial select and any subsequent update. */
function makeChain(data: unknown, error: unknown = null) {
  const chain: Record<string, jest.Mock> = {};
  ['select', 'update', 'eq', 'abortSignal'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain.maybeSingle = jest.fn().mockResolvedValue({ data, error });
  return chain;
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
    it('fetches profile and updates state', async () => {
      // onboarding_completed_at set → no auto-complete second query
      const mockProfile = {
        id: 'user-1',
        username: 'testuser',
        xp: 100,
        onboarding_completed_at: new Date().toISOString(),
      };
      mockFrom.mockReturnValue(makeChain(mockProfile));

      await useAuthStore.getState().fetchProfile('user-1');

      expect(mockFrom).toHaveBeenCalledWith('profiles');
      expect(useAuthStore.getState().profile).toMatchObject({
        id: 'user-1',
        username: 'testuser',
        xp: 100,
      });
    });

    it('sets profile to null when not found', async () => {
      mockFrom.mockReturnValue(makeChain(null));

      await useAuthStore.getState().fetchProfile('nonexistent');
      expect(useAuthStore.getState().profile).toBeNull();
    });

    it('does not throw on error, logs in dev', async () => {
      mockFrom.mockReturnValue(makeChain(null, { message: 'connection failed' }));

      await expect(useAuthStore.getState().fetchProfile('user-1')).resolves.not.toThrow();
    });
  });

  describe('updateProfile', () => {
    it('updates profile on server and in state', async () => {
      const updated = { id: 'user-1', username: 'testuser', display_name: 'New Name' };
      const chain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        abortSignal: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: updated, error: null }),
      };
      mockFrom.mockReturnValue(chain);

      useAuthStore.setState({
        session: { user: { id: 'user-1' } } as any,
        profile: { id: 'user-1', username: 'testuser', display_name: 'Old Name' } as any,
      });

      await useAuthStore.getState().updateProfile({ display_name: 'New Name' });
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
      const chain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        abortSignal: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: new Error('RLS violation'),
        }),
      };
      mockFrom.mockReturnValue(chain);

      useAuthStore.setState({
        session: { user: { id: 'user-1' } } as any,
      });

      await expect(
        useAuthStore.getState().updateProfile({ display_name: 'Test' }),
      ).rejects.toThrow('RLS violation');
    });
  });
});
