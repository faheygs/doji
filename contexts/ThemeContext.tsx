import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const profile = useAuthStore((s) => s.profile);
  const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_APP_THEME);

  useEffect(() => {
    if (!profile) {
      setPreferenceState(DEFAULT_APP_THEME);
      return;
    }
    setPreferenceState(normalizeAppTheme(profile.app_theme));
  }, [profile?.id, profile?.app_theme]);

  const setPreference = useCallback(async (p: ThemePreference) => {
    const { session, updateProfile } = useAuthStore.getState();
    if (!session?.user?.id) {
      setPreferenceState(p);
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
