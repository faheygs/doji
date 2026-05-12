import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppColors, ThemeName } from '../constants/theme';
import { themeMap, isDarkTheme } from '../constants/theme';

const STORAGE_KEY = '@doit/theme-preference';

export type ThemePreference = ThemeName;

type ThemeContextValue = {
  colors: AppColors;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const VALID_THEMES: ThemeName[] = ['coral', 'ocean', 'midnight', 'forest'];

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('midnight');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && VALID_THEMES.includes(stored as ThemeName)) {
        setPreferenceState(stored as ThemeName);
        return;
      }
      setPreferenceState('midnight');
      AsyncStorage.setItem(STORAGE_KEY, 'midnight').catch(() => {});
    });
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    AsyncStorage.setItem(STORAGE_KEY, p).catch(() => {});
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
