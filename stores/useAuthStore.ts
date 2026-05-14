import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../types/database';
import { mergeNotificationPreferences } from '../lib/notificationPreferences';
import { normalizeAppTheme } from '../constants/theme';

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  fetchProfile: (userId: string) => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  isLoading: true,

  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setLoading: (isLoading) => set({ isLoading }),

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, profile: null });
  },

  fetchProfile: async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      if (__DEV__) console.warn('[fetchProfile]', error.message);
      return;
    }

    set({
      profile: data
        ? {
            ...data,
            app_theme: normalizeAppTheme((data as Profile).app_theme),
            notification_preferences: mergeNotificationPreferences(
              (data as Profile).notification_preferences,
            ),
          }
        : null,
    });
  },

  updateProfile: async (updates) => {
    const { session } = get();
    if (!session?.user?.id) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', session.user.id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Profile update returned no row');

    set({
      profile: {
        ...data,
        app_theme: normalizeAppTheme((data as Profile).app_theme),
        notification_preferences: mergeNotificationPreferences(data.notification_preferences),
      },
    });
  },
}));
