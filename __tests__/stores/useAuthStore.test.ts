import { useAuthStore } from '../../stores/useAuthStore';
import { supabase } from '../../lib/supabase';
import { mergeNotificationPreferences } from '../../lib/notificationPreferences';

jest.mock('../../lib/supabase');

const mockFrom = supabase.from as jest.Mock;

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
      const mockProfile = { id: 'user-1', username: 'testuser', xp: 100 };
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockProfile, error: null }),
      };
      mockFrom.mockReturnValue(chain);

      await useAuthStore.getState().fetchProfile('user-1');

      expect(mockFrom).toHaveBeenCalledWith('profiles');
      expect(useAuthStore.getState().profile).toEqual({
        ...mockProfile,
        app_theme: 'midnight',
        notification_preferences: mergeNotificationPreferences(undefined),
      });
    });

    it('sets profile to null when not found', async () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
      mockFrom.mockReturnValue(chain);

      await useAuthStore.getState().fetchProfile('nonexistent');
      expect(useAuthStore.getState().profile).toBeNull();
    });

    it('does not throw on error, logs in dev', async () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'connection failed' },
        }),
      };
      mockFrom.mockReturnValue(chain);

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
        maybeSingle: jest.fn().mockResolvedValue({ data: updated, error: null }),
      };
      mockFrom.mockReturnValue(chain);

      useAuthStore.setState({
        session: { user: { id: 'user-1' } } as any,
        profile: { id: 'user-1', username: 'testuser', display_name: 'Old Name' } as any,
      });

      await useAuthStore.getState().updateProfile({ display_name: 'New Name' });
      expect(useAuthStore.getState().profile).toEqual({
        ...updated,
        app_theme: 'midnight',
        notification_preferences: mergeNotificationPreferences(undefined),
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
