import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Profile } from '../../types/database';
import type { Session } from '@supabase/supabase-js';
import { useAuthStore } from '../../stores/useAuthStore';
import { useOwnedShopItems } from '../../hooks/useShop';
import { ThemeProvider, useTheme } from '../../contexts/ThemeContext';
import {
  ACCENT_THEME_CATALOG,
  DEFAULT_ACCENT_THEME,
  DEFAULT_APP_THEME,
} from '../../constants/theme';

jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: require('zustand').create(() => ({
    session: null,
    profile: null,
    updateProfile: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('../../hooks/useShop', () => ({ useOwnedShopItems: jest.fn() }));
const ownedHook = jest.mocked(useOwnedShopItems);
const initial = useAuthStore.getState();
const session = (id = 'member-a') => ({ user: { id } }) as Session;
const profile = (extra: Partial<Profile> = {}) =>
  ({
    id: 'member-a',
    app_theme: 'light',
    appearance_mode: 'light',
    accent_theme: 'doji_orange',
    ...extra,
  }) as Profile;
const setOwned = (items: { item_key: string }[] | undefined, fetched = true) =>
  ownedHook.mockReturnValue({ data: items, isFetched: fetched } as ReturnType<
    typeof useOwnedShopItems
  >);
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState(initial, true);
  jest.mocked(initial.updateProfile).mockResolvedValue();
  setOwned([]);
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
  jest.mocked(AsyncStorage.setItem).mockResolvedValue();
  jest.mocked(AsyncStorage.multiRemove).mockResolvedValue();
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

test('missing theme provider fails explicitly', () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect(() => renderHook(useTheme)).toThrow('useTheme must be used within ThemeProvider');
  } finally {
    error.mockRestore();
  }
});

test('signed-out appearance is default and deletes legacy cross-account preferences', async () => {
  setOwned(undefined, false);
  const { result } = renderHook(useTheme, { wrapper: ThemeProvider });
  await flush();
  expect(result.current).toMatchObject({
    preference: DEFAULT_APP_THEME,
    accentTheme: DEFAULT_ACCENT_THEME,
    isDark: true,
  });
  expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
    '@doit/last-app-theme',
    '@doit/last-accent-theme',
  ]);
  expect(AsyncStorage.getItem).not.toHaveBeenCalled();
});

test('signed-out preference actions cannot write a profile', async () => {
  const { result } = renderHook(useTheme, { wrapper: ThemeProvider });
  await act(async () => {
    await result.current.setPreference('light');
    await result.current.setAccentTheme('doji_orange');
  });
  expect(result.current.preference).toBe(DEFAULT_APP_THEME);
  expect(initial.updateProfile).not.toHaveBeenCalled();
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

test.each([
  ['light', 'light'],
  [null, DEFAULT_APP_THEME],
  ['invalid', DEFAULT_APP_THEME],
] as const)('restores only the signed-in account cache (%s)', async (stored, expected) => {
  useAuthStore.setState({ session: session() });
  jest
    .mocked(AsyncStorage.getItem)
    .mockImplementation(async (key) => (key.includes('app-theme/') ? stored : null));
  const { result } = renderHook(useTheme, { wrapper: ThemeProvider });
  await flush();
  expect(result.current.preference).toBe(expected);
  expect(result.current.accentTheme).toBe(DEFAULT_ACCENT_THEME);
  expect(AsyncStorage.getItem).toHaveBeenCalledWith('@doit/app-theme/member-a');
  expect(AsyncStorage.getItem).toHaveBeenCalledWith('@doit/accent-theme/member-a');
  expect(initial.updateProfile).not.toHaveBeenCalled();
});

test('current server profile takes precedence over cache and uses legacy appearance fallback', async () => {
  useAuthStore.setState({ session: session(), profile: profile({ appearance_mode: undefined }) });
  const { result } = renderHook(useTheme, { wrapper: ThemeProvider });
  await flush();
  expect(result.current.preference).toBe('light');
  expect(result.current.isDark).toBe(false);
  expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('@doit/app-theme/member-a', 'light');
});

test('late cache response after account switch cannot change the new account theme', async () => {
  useAuthStore.setState({ session: session() });
  const cached = deferred<string | null>();
  jest
    .mocked(AsyncStorage.getItem)
    .mockImplementation((key) =>
      key.endsWith('/member-a') ? cached.promise : Promise.resolve(null),
    );
  const { result } = renderHook(useTheme, { wrapper: ThemeProvider });
  await act(async () => {
    useAuthStore.setState({ session: session('member-b'), profile: null });
  });
  await act(async () => cached.resolve('light'));
  expect(result.current.preference).toBe(DEFAULT_APP_THEME);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

test('cache completion cannot replace a profile that arrived while loading', async () => {
  useAuthStore.setState({ session: session() });
  const cached = deferred<string | null>();
  jest.mocked(AsyncStorage.getItem).mockReturnValue(cached.promise);
  const { result } = renderHook(useTheme, { wrapper: ThemeProvider });
  act(() => useAuthStore.setState({ profile: profile() }));
  await act(async () => cached.resolve('dark'));
  expect(result.current.preference).toBe('light');
});

test('pending storage restoration is ignored after unmount', async () => {
  useAuthStore.setState({ session: session() });
  const cached = deferred<string | null>();
  jest.mocked(AsyncStorage.getItem).mockReturnValue(cached.promise);
  const { unmount } = renderHook(useTheme, { wrapper: ThemeProvider });
  unmount();
  await act(async () => cached.resolve('light'));
  expect(initial.updateProfile).not.toHaveBeenCalled();
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

test('cache read and legacy cleanup failures do not prevent default presentation', async () => {
  jest.mocked(AsyncStorage.multiRemove).mockRejectedValue(Error('storage unavailable'));
  const { result } = renderHook(useTheme, { wrapper: ThemeProvider });
  await flush();
  jest.mocked(AsyncStorage.getItem).mockRejectedValue(Error('storage unavailable'));
  act(() => useAuthStore.setState({ session: session() }));
  await flush();
  expect(result.current.preference).toBe(DEFAULT_APP_THEME);
});

test('profile persistence failure does not prevent server-owned appearance presentation', async () => {
  jest.mocked(AsyncStorage.setItem).mockRejectedValue(Error('disk full'));
  useAuthStore.setState({ session: session(), profile: profile() });
  const { result } = renderHook(useTheme, { wrapper: ThemeProvider });
  await flush();
  expect(result.current.preference).toBe('light');
});

test('preference update uses the atomic profile boundary without re-equipping an accent', async () => {
  useAuthStore.setState({ session: session(), profile: profile() });
  const { result } = renderHook(useTheme, { wrapper: ThemeProvider });
  await act(async () => result.current.setPreference('dark'));
  expect(initial.updateProfile).toHaveBeenCalledWith({
    appearance_mode: 'dark',
    app_theme: 'dark',
  });
  expect(result.current.isDark).toBe(true);
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('@doit/app-theme/member-a', 'dark');
});

test('accent update persists appearance and chosen accent together', async () => {
  useAuthStore.setState({ session: session(), profile: profile() });
  const { result } = renderHook(useTheme, { wrapper: ThemeProvider });
  await act(async () => result.current.setAccentTheme('doji_orange'));
  expect(initial.updateProfile).toHaveBeenCalledWith({
    appearance_mode: 'light',
    app_theme: 'light',
    accent_theme: 'doji_orange',
  });
});

test('storage write failure does not prevent an authorized profile update', async () => {
  useAuthStore.setState({ session: session(), profile: profile() });
  jest.mocked(AsyncStorage.setItem).mockRejectedValue(Error('disk full'));
  const { result } = renderHook(useTheme, { wrapper: ThemeProvider });
  await act(async () => result.current.setPreference('dark'));
  expect(initial.updateProfile).toHaveBeenCalledTimes(1);
  expect(result.current.preference).toBe('dark');
});

test('profile update rejection reaches the caller rather than claiming saved success', async () => {
  useAuthStore.setState({ session: session(), profile: profile() });
  jest.mocked(initial.updateProfile).mockRejectedValueOnce(Error('offline'));
  const { result } = renderHook(useTheme, { wrapper: ThemeProvider });
  await act(async () => {
    await expect(result.current.setPreference('dark')).rejects.toThrow('offline');
  });
});

test('sign-out removes the previous account appearance immediately', async () => {
  useAuthStore.setState({ session: session(), profile: profile() });
  const { result } = renderHook(useTheme, { wrapper: ThemeProvider });
  expect(result.current.preference).toBe('light');
  act(() => useAuthStore.setState({ session: null, profile: null }));
  expect(result.current.preference).toBe(DEFAULT_APP_THEME);
  await flush();
});

test('owned premium accent is shown only after matching the ownership result', async () => {
  const premium = Object.values(ACCENT_THEME_CATALOG).find((item) => item.key !== 'doji_orange')!;
  setOwned([{ item_key: premium.key }, { item_key: 'not-a-theme' }]);
  useAuthStore.setState({ session: session(), profile: profile({ accent_theme: premium.key }) });
  const { result } = renderHook(useTheme, { wrapper: ThemeProvider });
  await flush();
  expect(result.current.accentTheme).toBe(premium.key);
  expect(initial.updateProfile).not.toHaveBeenCalled();
});

test('pending ownership does not erase an accent; resolved missing ownership restores default', async () => {
  const premium = Object.values(ACCENT_THEME_CATALOG).find((item) => item.key !== 'doji_orange')!;
  setOwned([], false);
  useAuthStore.setState({ session: session(), profile: profile({ accent_theme: premium.key }) });
  const { result, rerender } = renderHook(useTheme, { wrapper: ThemeProvider });
  expect(result.current.accentTheme).toBe(premium.key);
  expect(initial.updateProfile).not.toHaveBeenCalled();
  setOwned([], true);
  rerender({});
  await flush();
  expect(result.current.accentTheme).toBe(DEFAULT_ACCENT_THEME);
  expect(initial.updateProfile).toHaveBeenCalledWith({ accent_theme: DEFAULT_ACCENT_THEME });
});
