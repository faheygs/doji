import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useShallow } from 'zustand/react/shallow';
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
const userThemeStorageKey = (userId: string) => `@doit/app-theme/${userId}`;
const userAccentStorageKey = (userId: string) => `@doit/accent-theme/${userId}`;
const EMPTY_OWNED_ITEMS: { item_key: string }[] = [];

export function presentedThemeForSession(
  userId: string | undefined,
  themeOwnerId: string | null,
  preference: ThemePreference,
  accentTheme: AccentThemeKey,
): { preference: ThemePreference; accentTheme: AccentThemeKey } {
  if (!userId || themeOwnerId !== userId) {
    return { preference: DEFAULT_APP_THEME, accentTheme: DEFAULT_ACCENT_THEME };
  }
  return { preference, accentTheme };
}

function ownedThemeKeysFromItems(items: { item_key: string }[]): AccentThemeKey[] {
  return items.map((o) => o.item_key).filter(isAccentThemeKey);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const profile = useAuthStore(useShallow((s) =>
    s.profile && s.profile.id === s.session?.user?.id ? {
      id: s.profile.id, appearance_mode: s.profile.appearance_mode,
      app_theme: s.profile.app_theme, accent_theme: s.profile.accent_theme,
    } : null));
  const userId = useAuthStore((s) => s.session?.user?.id);
  const { data: owned = EMPTY_OWNED_ITEMS, isSuccess: ownedFetched } = useOwnedShopItems(userId);
  const ownedThemeKeys = useMemo(() => ownedThemeKeysFromItems(owned), [owned]);

  const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_APP_THEME);
  const [accentTheme, setAccentThemeState] = useState<AccentThemeKey>(DEFAULT_ACCENT_THEME);
  const [themeOwnerId, setThemeOwnerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setPreferenceState(DEFAULT_APP_THEME);
      setAccentThemeState(DEFAULT_ACCENT_THEME);
      setThemeOwnerId(null);
      void AsyncStorage.multiRemove([LAST_THEME_STORAGE_KEY, LAST_ACCENT_STORAGE_KEY]).catch(() => {});
      return () => { cancelled = true; };
    }
    if (profile?.id === userId) return () => { cancelled = true; };

    setPreferenceState(DEFAULT_APP_THEME);
    setAccentThemeState(DEFAULT_ACCENT_THEME);
    setThemeOwnerId(null);
    void Promise.all([
      AsyncStorage.getItem(userThemeStorageKey(userId)),
      AsyncStorage.getItem(userAccentStorageKey(userId)),
    ]).then(([storedTheme, storedAccent]) => {
      if (cancelled) return;
      const auth = useAuthStore.getState();
      if (auth.session?.user?.id !== userId || auth.profile?.id === userId) return;
      setPreferenceState(normalizeAppTheme(storedTheme ?? undefined));
      setAccentThemeState(normalizeAccentTheme(storedAccent ?? undefined));
      setThemeOwnerId(userId);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [profile?.id, userId]);

  useEffect(() => {
    if (!profile) return;
    const mode = normalizeAppTheme(profile.appearance_mode ?? profile.app_theme);
    const accent =
      ownedFetched || !userId
        ? resolveAccentTheme(profile.accent_theme, ownedThemeKeys)
        : normalizeAccentTheme(profile.accent_theme);
    setPreferenceState(mode);
    setAccentThemeState(accent);
    setThemeOwnerId(userId ?? null);
    if (userId) {
      void AsyncStorage.setItem(userThemeStorageKey(userId), mode).catch(() => {});
      void AsyncStorage.setItem(userAccentStorageKey(userId), accent).catch(() => {});
    }
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
    const auth = useAuthStore.getState();
    if (auth.profileSaveState && auth.profileSaveState !== 'idle') return;
    void auth.updateProfile({ accent_theme: resolved }).catch(() => {});
  }, [profile?.id, profile?.accent_theme, ownedThemeKeys, ownedFetched, userId]);

  const persistTheme = useCallback(
    async (mode: ThemePreference, accent: AccentThemeKey, persistAccent: boolean) => {
      const { session: s, updateProfile, profileSaveState } = useAuthStore.getState();
      if (profileSaveState && profileSaveState !== 'idle') throw new Error('Retry the previous profile save first.');
      const activeUserId = s?.user?.id;
      if (!activeUserId) {
        setPreferenceState(DEFAULT_APP_THEME);
        setAccentThemeState(DEFAULT_ACCENT_THEME);
        setThemeOwnerId(null);
        return;
      }
      setPreferenceState(mode);
      setAccentThemeState(accent);
      setThemeOwnerId(activeUserId);
      void AsyncStorage.setItem(userThemeStorageKey(activeUserId), mode).catch(() => {});
      void AsyncStorage.setItem(userAccentStorageKey(activeUserId), accent).catch(() => {});
      await updateProfile({
        appearance_mode: mode,
        app_theme: mode,
        ...(persistAccent ? { accent_theme: accent } : {}),
      });
    },
    [],
  );

  const presented = presentedThemeForSession(userId, themeOwnerId, preference, accentTheme);

  const setPreference = useCallback(
    async (p: ThemePreference) => {
      await persistTheme(p, presented.accentTheme, false);
    },
    [persistTheme, presented.accentTheme],
  );

  const setAccentTheme = useCallback(
    async (key: AccentThemeKey) => {
      await persistTheme(presented.preference, key, true);
    },
    [persistTheme, presented.preference],
  );

  const accentHex = ACCENT_THEME_CATALOG[presented.accentTheme]?.color ?? ACCENT_THEME_CATALOG.doji_orange.color;
  const colors = useMemo(() => buildThemedColors(presented.preference, accentHex),
    [presented.preference, accentHex]);
  const dark = isDarkTheme(presented.preference);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors,
      preference: presented.preference,
      accentTheme: presented.accentTheme,
      setPreference,
      setAccentTheme,
      isDark: dark,
    }),
    [colors, presented.preference, presented.accentTheme, setPreference, setAccentTheme, dark],
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
