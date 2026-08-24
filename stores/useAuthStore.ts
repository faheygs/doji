import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { executeCommand } from '../lib/commandGateway';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../types/database';
import { mergeNotificationPreferences } from '../lib/notificationPreferences';
import { normalizeAppTheme } from '../constants/theme';
import { shouldAutoCompleteOnboarding } from '../lib/onboardingGate';
import { newCommandId } from '../lib/idempotency';
import { filterContent } from '../lib/contentFilter';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { queryClient } from '../lib/queryClient';
import { createRequestSignal } from '../lib/requestSignal';

// Startup, foreground reconciliation, and both realtime transports can all ask
// for the same profile at once. Share that request instead of repeatedly
// aborting/restarting it (which previously kept the auth gate busy).
let activeProfileFetch: { userId: string; requestId: symbol; promise: Promise<void> } | null = null;
const PROFILE_CACHE_PREFIX = '@doji/profile-cache:';
const QUERY_CACHE_STORAGE_KEY = 'doji-query-cache-v2';
const profileCacheKey = (userId: string) => `${PROFILE_CACHE_PREFIX}${userId}`;

function persistProfile(profile: Profile) {
  void AsyncStorage.setItem(profileCacheKey(profile.id), JSON.stringify(profile)).catch(() => {});
}

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isProfileLoading: boolean;
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
  isProfileLoading: false,

  setSession: (session) => {
    const prevId = get().session?.user?.id;
    const nextId = session?.user?.id;
    if (!session) {
      queryClient.clear();
      void AsyncStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
      if (prevId) void AsyncStorage.removeItem(profileCacheKey(prevId));
      set({ session: null, profile: null, isProfileLoading: false });
      return;
    }
    if (nextId !== prevId) {
      queryClient.clear();
      void AsyncStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
      if (prevId) void AsyncStorage.removeItem(profileCacheKey(prevId));
      set({ session, profile: null, isProfileLoading: true });
      return;
    }
    set({ session });
  },
  setProfile: (profile) => {
    set({ profile });
    if (profile) persistProfile(profile);
  },
  setLoading: (isLoading) => set({ isLoading }),

  signOut: async () => {
    const signedOutUserId = get().session?.user?.id;
    try {
      const { unregisterCurrentPushInstallation } = await import('../lib/pushNotifications');
      await unregisterCurrentPushInstallation();
    } catch {
      // Signing out must still succeed if token cleanup is temporarily offline.
      // A later registration atomically transfers ownership away from this user.
    }
    await supabase.auth.signOut();
    queryClient.clear();
    await AsyncStorage.removeItem('doji-query-cache-v2');
    if (signedOutUserId) await AsyncStorage.removeItem(profileCacheKey(signedOutUserId));
    set({ session: null, profile: null, isProfileLoading: false });
  },

  fetchProfile: (userId: string) => {
    if (activeProfileFetch?.userId === userId) return activeProfileFetch.promise;

    const requestId = Symbol(userId);
    const promise = Promise.resolve().then(async () => {
      if (get().profile?.id !== userId) {
        try {
          const raw = await AsyncStorage.getItem(profileCacheKey(userId));
          const cached = raw ? JSON.parse(raw) as Profile : null;
          if (cached?.id === userId && get().session?.user?.id === userId) {
            set({
              profile: {
                ...cached,
                app_theme: normalizeAppTheme(cached.app_theme),
                notification_preferences: mergeNotificationPreferences(
                  cached.notification_preferences,
                ),
              },
              isProfileLoading: false,
              isLoading: false,
            });
          }
        } catch {
          void AsyncStorage.removeItem(profileCacheKey(userId));
        }
      }
      if (get().session?.user?.id !== userId) {
        if (activeProfileFetch?.requestId === requestId) activeProfileFetch = null;
        return;
      }
      if (get().profile?.id !== userId) set({ isProfileLoading: true });
      const request = createRequestSignal(undefined, 6_000);
      try {
        const { data, error } = await supabase
          .rpc('get_own_profile')
          .abortSignal(request.signal);

        if (error) {
          if (__DEV__) console.warn('[fetchProfile]', error.message);
          if (get().session?.user?.id === userId) {
            set({ isProfileLoading: false, isLoading: false });
          }
          return;
        }

      if (get().session?.user?.id !== userId) {
        if (activeProfileFetch?.requestId === requestId) activeProfileFetch = null;
        return;
      }
        if (!data) {
          set({ profile: null });
          return;
        }

        let profile: Profile = {
        ...data,
        app_theme: normalizeAppTheme((data as Profile).app_theme),
        notification_preferences: mergeNotificationPreferences(
          (data as Profile).notification_preferences,
        ),
        };

        if (shouldAutoCompleteOnboarding(profile)) {
        const completedAt = profile.created_at ?? new Date().toISOString();
        const { data: patched, error: patchErr } = await executeCommand('update_own_profile', {
          p_patch: { onboarding_completed_at: completedAt },
          p_idempotency_key: newCommandId('profile-onboarding'),
        });

        if (!patchErr && patched) {
          profile = {
            ...patched,
            app_theme: normalizeAppTheme((patched as Profile).app_theme),
            notification_preferences: mergeNotificationPreferences(
              (patched as Profile).notification_preferences,
            ),
          };
        } else {
          profile = { ...profile, onboarding_completed_at: completedAt };
        }
        }

        if (get().session?.user?.id === userId) {
          set({ profile });
          persistProfile(profile);
        }
      } finally {
        request.cleanup();
        if (activeProfileFetch?.requestId === requestId) activeProfileFetch = null;
        if (get().session?.user?.id === userId) {
          set({ isProfileLoading: false, isLoading: false });
        }
      }
    });

    activeProfileFetch = { userId, requestId, promise };
    return promise;
  },

  updateProfile: async (updates) => {
    const { session } = get();
    if (!session?.user?.id) throw new Error('Not authenticated');

    for (const field of ['username', 'display_name', 'bio'] as const) {
      const value = updates[field];
      if (typeof value !== 'string') continue;
      const result = filterContent(value);
      if (!result.ok) throw new Error(result.reason);
    }

    const { data, error } = await executeCommand('update_own_profile', {
      p_patch: updates,
      p_idempotency_key: newCommandId('profile-update'),
    });

    if (error) throw error;
    if (!data) throw new Error('Profile update returned no row');
    if (get().session?.user?.id !== session.user.id) return;

    const profile: Profile = {
      ...data,
      app_theme: normalizeAppTheme((data as Profile).app_theme),
      notification_preferences: mergeNotificationPreferences(data.notification_preferences),
    };
    set({ profile });
    persistProfile(profile);
  },
}));
