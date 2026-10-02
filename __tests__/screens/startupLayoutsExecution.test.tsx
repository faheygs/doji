import React from 'react';
import 'react-native-gesture-handler/jestSetup';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Appearance, Platform, Text } from 'react-native';
import * as Sentry from '@sentry/react-native';
import * as Splash from 'expo-splash-screen';
import { Stack, Tabs } from 'expo-router';
import Root from '../../app/_layout';
import AppLayout from '../../app/(app)/_layout';
import AuthLayout from '../../app/(auth)/_layout';
import AdminLayout from '../../app/(app)/admin/_layout';
import OnboardingLayout from '../../app/(onboarding)/_layout';
import MemberLayout from '../../app/(app)/member/_layout';
import PostLayout from '../../app/(app)/post/_layout';
import PostIdLayout from '../../app/(app)/post/[id]/_layout';
import TabLayout from '../../app/(app)/(tabs)/_layout';
import { AppUpdatePrompt } from '../../components/system/AppUpdatePrompt';
import { AppAnnouncementPrompt } from '../../components/system/AppAnnouncementPrompt';
import { buildToastConfig } from '../../components/ui/toastTheme';
import { lightColors, darkColors } from '../../constants/theme';
import type { Session } from '@supabase/supabase-js';
const mockLoad = jest.fn(),
  mockUnsubscribe = jest.fn(),
  mockRealtime = jest.fn(),
  mockNotifications = jest.fn(),
  mockOperational = jest.fn();
let mockAuthEvent: ((event: string, session: Session | null) => void) | undefined;
const mockAuth = {
  session: null as Session | null,
  profile: null as { is_admin: boolean } | null,
  isLoading: false,
  setSession: jest.fn(),
  setLoading: jest.fn(),
  fetchProfile: jest.fn(),
  signOut: jest.fn(),
};
const mockGate = {
  ready: true,
  signedIn: true,
  hasProfile: true,
  canUseApp: true,
  canUseBannedScreen: false,
  mustFinishOnboarding: false,
  canUseAuthGroup: false,
  isEmployee: false,
  profileLoadFailed: false,
};
let mockFonts: [boolean, Error | null] = [true, null],
  mockDark = false;
const mockRouter = { replace: jest.fn() };
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: (component: unknown) => component,
  captureException: jest.fn(),
}));
jest.mock('expo-font', () => ({ ...jest.requireActual('expo-font'), useFonts: () => mockFonts }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../lib/initialSessionBootstrap', () => ({
  ...jest.requireActual('../../lib/initialSessionBootstrap'),
  initialSessionBootstrap: { get: () => mockLoad() },
}));
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (callback: typeof mockAuthEvent) => {
        mockAuthEvent = callback;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
    },
  },
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: Object.assign(
    (selector?: (s: typeof mockAuth) => unknown) => (selector ? selector(mockAuth) : mockAuth),
    { getState: () => mockAuth },
  ),
}));
jest.mock('../../hooks/useAuthGate', () => ({ useAuthGate: () => mockGate }));
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: require('../../constants/theme')[mockDark ? 'darkColors' : 'lightColors'],
    isDark: mockDark,
  }),
}));
jest.mock('../../hooks/useNativeNotifications', () => ({
  useNativeNotifications: (value: boolean) => mockNotifications(value),
}));
jest.mock('../../hooks/useDomainRealtime', () => ({
  useDomainRealtime: (value: unknown) => mockRealtime(value),
}));
jest.mock('../../lib/telemetry', () => ({
  recordOperationalFailure: (...args: unknown[]) => mockOperational(...args),
}));
jest.mock('../../components/AppProviders', () => ({
  AppProviders: ({ children }: { children: React.ReactNode }) =>
    require('react').createElement(
      require('../../contexts/KeyboardToolbarContext').KeyboardToolbarProvider,
      null,
      children,
    ),
}));
jest.mock('../../components/notifications/AppIconBadgeSync', () => ({
  AppIconBadgeSync: () => null,
}));
jest.mock('../../components/system/AppUpdatePrompt', () => ({ AppUpdatePrompt: () => null }));
jest.mock('../../components/system/AppAnnouncementPrompt', () => ({
  AppAnnouncementPrompt: () => null,
}));
jest.mock('../../components/gamification/CelebrationHost', () => ({ CelebrationHost: () => null }));
jest.mock('../../contexts/ReportFlowContext', () => ({
  ReportFlowProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  const navigator = ({ children, ...props }: { children: React.ReactNode }) =>
    React.createElement(View, props, children);
  const screen = () => null;
  const protectedGroup = ({ children, guard }: { children: React.ReactNode; guard: boolean }) =>
    guard ? children : null;
  return {
    Stack: Object.assign(navigator, { Screen: screen, Protected: protectedGroup }),
    Tabs: Object.assign(
      ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
      { Screen: screen },
    ),
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
    DarkTheme: { colors: {} },
    DefaultTheme: { colors: {} },
    useRouter: () => mockRouter,
    usePathname: () => '/profile',
  };
});
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
);
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
const session = { user: { id: 'member' } } as Session;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
  mockFonts = [true, null];
  mockDark = false;
  mockLoad.mockReset().mockResolvedValue(null);
  mockAuth.session = null;
  mockAuth.profile = null;
  mockAuth.isLoading = false;
  mockAuth.fetchProfile.mockResolvedValue(undefined);
  Object.assign(mockGate, {
    ready: true,
    signedIn: true,
    hasProfile: true,
    canUseApp: true,
    canUseBannedScreen: false,
    mustFinishOnboarding: false,
    canUseAuthGroup: false,
    isEmployee: false,
    profileLoadFailed: false,
  });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});
it.each(['signed out', 'member'])(
  'restores %s before activating the appropriate services',
  async (mode) => {
    mockLoad.mockResolvedValue(mode === 'member' ? session : null);
    mockGate.canUseApp = mode === 'member';
    mockDark = mode === 'member';
    const ui = render(<Root />);
    await act(async () => {});
    expect(mockAuth.setSession).toHaveBeenCalledWith(mode === 'member' ? session : null);
    if (mode === 'member') expect(mockAuth.fetchProfile).toHaveBeenCalledWith('member');
    else expect(mockAuth.setLoading).toHaveBeenCalledWith(false);
    expect(mockNotifications).toHaveBeenCalledWith(mode === 'member');
    expect(Splash.hideAsync).toHaveBeenCalledTimes(1);
    expect(ui.UNSAFE_getByType(AppUpdatePrompt).props.enabled).toBe(true);
    expect(ui.UNSAFE_getByType(AppAnnouncementPrompt).props.enabled).toBe(mode === 'member');
    ui.unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  },
);
it.each(['timeout', 'failure'])(
  'recovers from session %s without clearing an existing identity',
  async (mode) => {
    let resolve!: (s: Session | null) => void;
    if (mode === 'timeout')
      mockLoad.mockImplementation(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      );
    else mockLoad.mockRejectedValueOnce(new Error('restore failed'));
    const ui = render(<Root />);
    await act(async () => {
      jest.advanceTimersByTime(8001);
    });
    expect(ui.getByText("Couldn't finish loading Doji")).toBeTruthy();
    expect(mockAuth.setSession).not.toHaveBeenCalled();
    if (mode === 'timeout') {
      expect(mockOperational).toHaveBeenCalledWith(
        'startup',
        'session_restore_timeout',
        expect.any(Error),
      );
      await act(async () => resolve(session));
    } else {
      expect(Sentry.captureException).toHaveBeenCalled();
      mockLoad.mockResolvedValue(session);
      fireEvent.press(ui.getByLabelText('Try again'));
      await act(async () => {});
    }
    expect(mockAuth.setSession).toHaveBeenCalledWith(session);
    expect(ui.queryByText("Couldn't finish loading Doji")).toBeNull();
  },
);
it('prioritizes a newer auth event over the delayed startup snapshot and ignores work after unmount', async () => {
  let resolve!: (s: Session | null) => void;
  mockLoad.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const ui = render(<Root />);
  act(() => mockAuthEvent?.('SIGNED_IN', session));
  await act(async () => resolve(null));
  expect(mockAuth.setSession.mock.calls).toEqual([[session]]);
  ui.unmount();
  act(() => mockAuthEvent?.('SIGNED_OUT', null));
  expect(mockAuth.setSession).toHaveBeenCalledTimes(1);
});
it.each(['employee', 'profile error', 'profile without session', 'not ready'])(
  'renders the %s gate safely',
  async (mode) => {
    mockGate.isEmployee = mode === 'employee';
    mockGate.profileLoadFailed = mode.startsWith('profile');
    mockGate.ready = mode !== 'not ready';
    mockAuth.session = mode === 'profile error' ? session : null;
    const ui = render(<Root />);
    await act(async () => {});
    if (mode === 'employee') {
      fireEvent.press(ui.getByLabelText('Sign out of this device'));
      expect(mockAuth.signOut).toHaveBeenCalled();
    } else if (mode.startsWith('profile')) {
      fireEvent.press(ui.getByLabelText('Try again'));
      expect(mockAuth.fetchProfile).toHaveBeenCalledTimes(mode === 'profile error' ? 1 : 0);
    } else expect(ui.UNSAFE_queryByType(Stack)).toBeNull();
  },
);
it.each(['deadline', 'error', 'loaded', 'unmount', 'web'])(
  'settles the font %s path',
  async (mode) => {
    mockFonts = [mode === 'loaded', mode === 'error' ? new Error('font unavailable') : null];
    if (mode === 'web') jest.replaceProperty(Platform, 'OS', 'web');
    const ui = render(<Root />);
    if (mode === 'unmount') {
      ui.unmount();
      await act(async () => jest.advanceTimersByTime(3000));
      expect(mockLoad).not.toHaveBeenCalled();
      return;
    }
    if (mode === 'deadline' || mode === 'web') {
      expect(ui.toJSON()).toBeNull();
      await act(async () => jest.advanceTimersByTime(2501));
    } else await act(async () => {});
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(Splash.hideAsync).toHaveBeenCalledTimes(mode === 'web' ? 0 : 1);
  },
);
it.each([true, false])('keeps app/auth layouts guarded until ready=%s', (ready) => {
  mockGate.ready = ready;
  mockAuth.session = ready ? session : null;
  const app = render(<AppLayout />);
  expect(mockRealtime).toHaveBeenCalledWith(ready ? 'member' : undefined);
  expect(!!app.toJSON()).toBe(ready);
  app.unmount();
  const auth = render(<AuthLayout />);
  expect(!!auth.toJSON()).toBe(ready);
});
it.each([
  [false, false],
  [true, false],
  [false, true],
])('restricts legacy staff routes loading=%s admin=%s', (loading, admin) => {
  mockAuth.isLoading = loading;
  mockAuth.profile = { is_admin: admin };
  const ui = render(<AdminLayout />);
  expect(!!ui.toJSON()).toBe(admin);
  expect(mockRouter.replace).toHaveBeenCalledTimes(!loading && !admin ? 1 : 0);
});
it.each([OnboardingLayout, MemberLayout, PostLayout, PostIdLayout])(
  'renders nested layout %# with hidden headers',
  (Layout) => {
    const ui = render(<Layout />);
    expect(ui.UNSAFE_getByType(Stack).props.screenOptions.headerShown).toBe(false);
  },
);
it.each(['ios', 'android', 'web'] as const)(
  'renders all %s tab icons and normalizes profile tab navigation',
  (platform) => {
    jest.replaceProperty(Platform, 'OS', platform);
    const ui = render(<TabLayout />);
    const screens = ui.UNSAFE_getAllByType(Tabs.Screen);
    expect(screens.map((s) => s.props.name)).toEqual([
      'index',
      'rank',
      'friends',
      'suggest-challenge',
      'profile',
    ]);
    for (const screen of screens)
      for (const focused of [false, true]) {
        const icon = render(screen.props.options.tabBarIcon({ focused }));
        expect(icon.toJSON()).toBeTruthy();
        icon.unmount();
      }
    const navigation = { navigate: jest.fn() },
      event = { preventDefault: jest.fn() };
    screens[4].props.listeners({ navigation }).tabPress(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith('profile');
  },
);
it.each(['ios', 'web'] as const)(
  'renders themed %s toast variants with optional text',
  (platform) => {
    jest.replaceProperty(Platform, 'OS', platform);
    for (const dark of [false, true])
      for (const type of ['success', 'error', 'info'])
        for (const text of [true, false]) {
          const config = buildToastConfig(dark ? darkColors : lightColors, dark);
          const ui = render(
            config[type]({
              text1: text ? 'Title' : undefined,
              text2: text ? 'Detail' : undefined,
            } as Parameters<(typeof config)[string]>[0]),
          );
          expect(ui.queryByText('Title') !== null).toBe(text);
          expect(ui.queryByText('Detail') !== null).toBe(text);
          ui.unmount();
        }
  },
);
