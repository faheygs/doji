import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AccentThemeKey, AppColors, ThemeName } from '../constants/theme';
import {
  buildThemedColors,
  ACCENT_THEME_CATALOG,
  isDarkTheme,
  DEFAULT_APP_THEME,
  DEFAULT_ACCENT_THEME,
  normalizeAppTheme,
  normalizeAccentTheme,
  resolveAccentTheme,
  isAccentThemeKey,
} from '../constants/theme';
import { useAuthStore } from '../stores/useAuthStore';
import { useOwnedShopItems } from '../hooks/useShop';

export type ThemePreference = ThemeName;

type ThemeContextValue = {
  colors: AppColors;
  preference: ThemePreference;
  accentTheme: AccentThemeKey;
  /** Persists appearance + accent when logged in. */
  setPreference: (p: ThemePreference) => Promise<void>;
  setAccentTheme: (key: AccentThemeKey) => Promise<void>;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const LAST_THEME_STORAGE_KEY = '@doit/last-app-theme';
const LAST_ACCENT_STORAGE_KEY = '@doit/last-accent-theme';

function ownedThemeKeysFromItems(items: { item_key: string }[]): AccentThemeKey[] {
  return items.map((o) => o.item_key).filter(isAccentThemeKey);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const profile = useAuthStore((s) => s.profile);
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;
  const { data: owned = [], isFetched: ownedFetched } = useOwnedShopItems(userId);
  const ownedThemeKeys = useMemo(() => ownedThemeKeysFromItems(owned), [owned]);

  const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_APP_THEME);
  const [accentTheme, setAccentThemeState] = useState<AccentThemeKey>(DEFAULT_ACCENT_THEME);

  useEffect(() => {
    void AsyncStorage.getItem(LAST_THEME_STORAGE_KEY).then((raw) => {
      if (useAuthStore.getState().profile) return;
      setPreferenceState(normalizeAppTheme(raw === null ? undefined : raw));
    });
    void AsyncStorage.getItem(LAST_ACCENT_STORAGE_KEY).then((raw) => {
      if (useAuthStore.getState().profile) return;
      setAccentThemeState(normalizeAccentTheme(raw ?? undefined));
    });
  }, []);

  // When a new session loads, the profile-sync effect below applies the
  // correct theme from the profile. No reset is needed on logout — the
  // user's last-used theme from AsyncStorage stays active on the auth
  // screens, and a new user logging in gets their own profile theme.

  useEffect(() => {
    if (!profile) return;
    const mode = normalizeAppTheme(profile.appearance_mode ?? profile.app_theme);
    const accent =
      ownedFetched || !userId
        ? resolveAccentTheme(profile.accent_theme, ownedThemeKeys)
        : normalizeAccentTheme(profile.accent_theme);
    setPreferenceState(mode);
    setAccentThemeState(accent);
    void AsyncStorage.setItem(LAST_THEME_STORAGE_KEY, mode).catch(() => {});
    void AsyncStorage.setItem(LAST_ACCENT_STORAGE_KEY, accent).catch(() => {});
  }, [
    profile,
    ownedThemeKeys,
    ownedFetched,
    userId,
  ]);

  useEffect(() => {
    if (!profile?.id || !userId || !ownedFetched) return;
    const stored = normalizeAccentTheme(profile.accent_theme);
    const resolved = resolveAccentTheme(profile.accent_theme, ownedThemeKeys);
    if (stored === resolved) return;
    void useAuthStore.getState().updateProfile({ accent_theme: resolved });
  }, [profile?.id, profile?.accent_theme, ownedThemeKeys, ownedFetched, userId]);

  const persistTheme = useCallback(
    async (mode: ThemePreference, accent: AccentThemeKey, persistAccent: boolean) => {
      const { session: s, updateProfile } = useAuthStore.getState();
      setPreferenceState(mode);
      setAccentThemeState(accent);
      void AsyncStorage.setItem(LAST_THEME_STORAGE_KEY, mode).catch(() => {});
      void AsyncStorage.setItem(LAST_ACCENT_STORAGE_KEY, accent).catch(() => {});
      if (!s?.user?.id) return;
      await updateProfile({
        appearance_mode: mode,
        app_theme: mode,
        ...(persistAccent ? { accent_theme: accent } : {}),
      });
    },
    [],
  );

  const setPreference = useCallback(
    async (p: ThemePreference) => {
      await persistTheme(p, accentTheme, false);
    },
    [accentTheme, persistTheme],
  );

  const setAccentTheme = useCallback(
    async (key: AccentThemeKey) => {
      await persistTheme(preference, key, true);
    },
    [preference, persistTheme],
  );

  const accentHex = ACCENT_THEME_CATALOG[accentTheme]?.color ?? ACCENT_THEME_CATALOG.doji_orange.color;
  const colors = buildThemedColors(preference, accentHex);
  const dark = isDarkTheme(preference);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors,
      preference,
      accentTheme,
      setPreference,
      setAccentTheme,
      isDark: dark,
    }),
    [colors, preference, accentTheme, setPreference, setAccentTheme, dark],
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
