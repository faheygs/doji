import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppColors, ThemeName } from '../constants/theme';
import {
  themeMap,
  isDarkTheme,
  DEFAULT_APP_THEME,
  normalizeAppTheme,
} from '../constants/theme';
import { useAuthStore } from '../stores/useAuthStore';

export type ThemePreference = ThemeName;

type ThemeContextValue = {
  colors: AppColors;
  preference: ThemePreference;
  /** Persists to `profiles.app_theme` when logged in. */
  setPreference: (p: ThemePreference) => Promise<void>;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const LAST_THEME_STORAGE_KEY = '@doit/last-app-theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const profile = useAuthStore((s) => s.profile);
  const session = useAuthStore((s) => s.session);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_APP_THEME);

  useEffect(() => {
    void AsyncStorage.getItem(LAST_THEME_STORAGE_KEY).then((raw) => {
      if (useAuthStore.getState().profile) return;
      setPreferenceState(normalizeAppTheme(raw === null ? undefined : raw));
    });
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      setPreferenceState(DEFAULT_APP_THEME);
    }
  }, [session, isLoading]);

  useEffect(() => {
    if (!profile) {
      return;
    }
    const t = normalizeAppTheme(profile.app_theme);
    setPreferenceState(t);
    void AsyncStorage.setItem(LAST_THEME_STORAGE_KEY, t).catch(() => {});
  }, [profile?.id, profile?.app_theme]);

  const setPreference = useCallback(async (p: ThemePreference) => {
    const { session, updateProfile } = useAuthStore.getState();
    setPreferenceState(p);
    void AsyncStorage.setItem(LAST_THEME_STORAGE_KEY, p).catch(() => {});
    if (!session?.user?.id) {
      return;
    }
    await updateProfile({ app_theme: p });
  }, []);

  const colors = themeMap[preference];
  const dark = isDarkTheme(preference);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors,
      preference,
      setPreference,
      isDark: dark,
    }),
    [colors, preference, setPreference, dark],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
