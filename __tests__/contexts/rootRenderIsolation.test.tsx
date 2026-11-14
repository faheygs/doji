import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../../types/database';
import { useAuthStore } from '../../stores/useAuthStore';
import { useAuthGate } from '../../hooks/useAuthGate';
import { getAuthGate } from '../../lib/authRoute';
import { ThemeProvider, useTheme } from '../../contexts/ThemeContext';
import { useOwnedShopItems } from '../../hooks/useShop';
import { DEFAULT_APP_THEME } from '../../constants/theme';

// Real Zustand subscriptions; only backend/storage boundaries are synthetic.
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: require('zustand').create(() => ({
    session: null, profile: null, isLoading: false, isProfileLoading: false,
    profileLoadState: 'ready', profileSaveState: 'idle', updateProfile: jest.fn(),
  })),
}));
jest.mock('../../hooks/useShop', () => ({ useOwnedShopItems: jest.fn() }));
const initial = useAuthStore.getState();
const session = (id = 'member-a') => ({ user: { id, role: 'authenticated' }, access_token: 'synthetic' }) as Session;
const profile = (extra: Partial<Profile> = {}) => ({
  id: 'member-a', appearance_mode: 'light', app_theme: 'light', accent_theme: 'doji_orange',
  onboarding_completed_at: '2026-01-01', is_banned: false, ...extra,
}) as Profile;
const set = (state: Partial<typeof initial>) => act(() => useAuthStore.setState(state));
beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ ...initial, session: session(), profile: profile() }, true);
  jest.mocked(useOwnedShopItems).mockReturnValue({ data: undefined, isSuccess: false } as ReturnType<typeof useOwnedShopItems>);
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
  jest.mocked(AsyncStorage.setItem).mockResolvedValue();
});
afterEach(cleanup);

test('unrelated profile fields, token rotation and save phases do not render route guards', () => {
  let renders = 0;
  const { result } = renderHook(() => { renders++; return useAuthGate(); });
  const first = result.current;
  const baseline = renders;
  for (let i = 0; i < 20; i++) {
    set({ profile: profile({ bio: `synthetic-${i}`, xp: i }),
      session: { ...session(), access_token: `synthetic-${i}` },
      profileSaveState: i % 2 ? 'idle' : 'uncertain' });
  }
  expect(renders).toBe(baseline);
  expect(result.current).toBe(first);
  expect(first.canUseApp).toBe(true);
});

test('every authorization transition still publishes the unchanged gate contract immediately', () => {
  let renders = 0;
  const { result } = renderHook(() => { renders++; return useAuthGate(); });
  const transitions: Partial<typeof initial>[] = [
    { profile: profile({ is_banned: true }) },
    { profile: profile({ onboarding_completed_at: null, created_at: new Date().toISOString(), xp: 0, total_completions: 0, total_missed: 0 }) },
    { profile: null, profileLoadState: 'missing' },
    { profileLoadState: 'error' },
    { profileLoadState: 'loading', isProfileLoading: true },
    { profile: profile(), profileLoadState: 'ready', isProfileLoading: false },
    { isLoading: true },
    { session: null, profile: null, isLoading: false },
    { session: { ...session(), user: { ...session().user, role: 'doji_employee' } } },
  ];
  for (const transition of transitions) {
    const before = renders;
    set(transition);
    const s = useAuthStore.getState();
    expect(result.current).toEqual(getAuthGate(s.isLoading, s.isProfileLoading, s.session, s.profile, s.profileLoadState));
    expect(renders).toBe(before + 1);
  }
});

test('unrelated member changes neither notify theme consumers nor rewrite appearance storage', () => {
  let renders = 0;
  const { result, rerender } = renderHook(() => { renders++; return useTheme(); }, { wrapper: ThemeProvider });
  const first = result.current;
  const baseline = renders;
  jest.mocked(AsyncStorage.setItem).mockClear();
  for (let i = 0; i < 20; i++) {
    set({ profile: profile({ bio: `synthetic-${i}`, xp: i }), session: { ...session(), access_token: `synthetic-${i}` } });
  }
  expect(renders).toBe(baseline);
  expect(result.current).toBe(first);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  // A parent render must not rebuild the colors/context identity either.
  rerender({});
  expect(result.current).toBe(first);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  set({ profile: profile({ appearance_mode: 'dark' }) });
  expect(result.current.preference).toBe('dark');
  expect(result.current.colors).not.toBe(first.colors);
});

test('an old member profile cannot supply or persist the next account appearance', async () => {
  const { result } = renderHook(useTheme, { wrapper: ThemeProvider });
  expect(result.current.preference).toBe('light');
  jest.mocked(AsyncStorage.setItem).mockClear();
  set({ session: session('member-b') });
  expect(result.current.preference).toBe(DEFAULT_APP_THEME);
  await act(async () => { await Promise.resolve(); });
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  set({ profile: profile({ id: 'member-b' }) });
  expect(result.current.preference).toBe('light');
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('@doit/app-theme/member-b', 'light');
  set({ session: null });
  expect(result.current.preference).toBe(DEFAULT_APP_THEME);
});
