import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ActivityIndicator, Linking, Platform, Switch, Text } from 'react-native';
import Settings from '../../app/(app)/profile/settings';
import AccountStatus from '../../app/(app)/profile/account-status';
import NotificationSettings from '../../app/(app)/notifications';
import { ChangePasswordSheet } from '../../components/settings/ChangePasswordSheet';
import { SettingsGroup, SettingsRow } from '../../components/settings/SettingsGroup';
import { KeyboardToolbarProvider } from '../../contexts/KeyboardToolbarContext';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  phoneAlertPreferencePatch,
} from '../../lib/notificationPreferences';
import type { Profile } from '../../types/database';
import type { ModerationStatus } from '../../hooks/useModerationStatus';

const mockUpdate = jest.fn(),
  mockSignOut = jest.fn(),
  mockSetProfile = jest.fn(),
  mockDialog = jest.fn(),
  mockRegister = jest.fn(),
  mockUnregister = jest.fn(),
  mockPermission = jest.fn();
const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true };
const mockAppeal = { mutateAsync: jest.fn(), error: null as unknown, isPending: false };
let mockStatus: {
  data?: ModerationStatus;
  isLoading: boolean;
  isError: boolean;
  refetch: jest.Mock;
};
let mockProfile: Profile | null,
  mockDark = false,
  mockBlocked: number | undefined = 0;
let mockFocus: (() => void) | undefined;
const mockConstants = {
  expoConfig: { version: '1.0.8' } as { version: string } | null,
  nativeBuildVersion: '101' as string | null,
};
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: Object.assign(
    () => ({ profile: mockProfile, updateProfile: mockUpdate, signOut: mockSignOut }),
    { getState: () => ({ profile: mockProfile, setProfile: mockSetProfile }) },
  ),
}));
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: require('../../constants/theme')[mockDark ? 'darkColors' : 'lightColors'],
  }),
}));
jest.mock('../../contexts/DialogContext', () => ({
  useAppDialog: () => ({ showDialog: mockDialog }),
}));
jest.mock('../../hooks/useBlockUser', () => ({
  useBlockedUserCount: () => ({ data: mockBlocked }),
}));
jest.mock('../../hooks/useModerationStatus', () => ({
  useModerationStatus: () => mockStatus,
  useSubmitModerationAppeal: () => mockAppeal,
}));
jest.mock('../../lib/pushNotifications', () => ({
  requestPushPermissionAndRegisterToken: (...args: unknown[]) => mockRegister(...args),
  unregisterCurrentPushInstallation: () => mockUnregister(),
}));
jest.mock('expo-notifications', () => ({ getPermissionsAsync: () => mockPermission() }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  get default() {
    return { ...jest.requireActual('expo-constants').default, ...mockConstants };
  },
}));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/telemetry', () => ({ reportOperationalFailure: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/profile/settings',
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void) => {
    mockFocus = cb;
  },
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
);
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Heavy: 'heavy', Light: 'light' },
}));
const shell = (node: React.ReactNode) => <KeyboardToolbarProvider>{node}</KeyboardToolbarProvider>;
type Decision = NonNullable<ModerationStatus>['decisions'][number];
const decision = (overrides: Partial<Decision> = {}): Decision =>
  ({
    id: 'decision',
    action: 'remove',
    state: 'active',
    content_kind: 'post',
    policy_code: 'harassment',
    severity: 'medium',
    user_notice: 'Synthetic notice',
    decided_at: '2026-10-01T12:00:00Z',
    appeal_eligible: true,
    appeal: null,
    account_action: null,
    ...overrides,
  }) as Decision;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockProfile = {
    id: 'member',
    username: 'synthetic',
    display_name: 'Synthetic',
    notification_preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
  } as Profile;
  mockDark = false;
  mockBlocked = 0;
  mockFocus = undefined;
  mockConstants.expoConfig = { version: '1.0.8' };
  mockConstants.nativeBuildVersion = '101';
  mockStatus = {
    data: { account_access: null, notices: [], decisions: [] },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  mockAppeal.error = null;
  mockAppeal.isPending = false;
  mockAppeal.mutateAsync.mockResolvedValue(undefined);
  mockUpdate.mockResolvedValue(undefined);
  mockSignOut.mockResolvedValue(undefined);
  mockRegister.mockResolvedValue('granted');
  mockPermission.mockResolvedValue({ status: 'granted' });
  mockUnregister.mockResolvedValue(undefined);
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
describe.each([false, true])('account controls dark=%s', (dark) => {
  beforeEach(() => {
    mockDark = dark;
  });
  it('routes every settings entry without issuing account writes', async () => {
    const ui = render(shell(<Settings />));
    for (const [label, path] of [
      ['Edit profile', '/profile/edit'],
      ['Notification settings', '/notifications'],
      ['Terms of Use', '/legal/terms'],
      ['Privacy Policy', '/legal/privacy'],
      ['Account status', '/profile/account-status'],
      ['Blocked users', '/profile/blocked-users'],
      ['Themes & colors', '/profile/appearance'],
      ['Shop', '/profile/shop'],
    ]) {
      fireEvent.press(ui.getByText(label === 'Edit profile' ? /Edit profile/ : label));
      expect(String(mockRouter.push.mock.calls.at(-1)[0])).toContain(path);
    }
    fireEvent.press(ui.getByText('Change password'));
    expect(ui.UNSAFE_getByType(ChangePasswordSheet).props.visible).toBe(true);
    act(() => ui.UNSAFE_getByType(ChangePasswordSheet).props.onClose());
    expect(ui.UNSAFE_getByType(ChangePasswordSheet).props.visible).toBe(false);
    await act(async () => fireEvent.press(ui.getByText('Help & support')));
    expect(Linking.openURL).toHaveBeenCalledWith('https://dojipro.com/support/');
    await act(async () => fireEvent.press(ui.getByText('Sign out')));
    expect(mockSignOut).toHaveBeenCalled();
    fireEvent.press(ui.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(ui.getByText('Doji 1.0.8 (101)')).toBeTruthy();
  });
  it('shows loading/error/healthy account status and bounded retry', () => {
    mockStatus.isLoading = true;
    const ui = render(shell(<AccountStatus />));
    expect(ui.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    mockStatus.isLoading = false;
    mockStatus.isError = true;
    ui.rerender(shell(<AccountStatus />));
    fireEvent.press(ui.getByText('Try again'));
    expect(mockStatus.refetch).toHaveBeenCalled();
    mockStatus.isError = false;
    mockStatus.data = undefined;
    ui.rerender(shell(<AccountStatus />));
    expect(ui.getByText('No active policy issues')).toBeTruthy();
    fireEvent.press(ui.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalled();
  });
  it('submits appeal against the exact decision only with a complete statement', async () => {
    mockStatus.data!.decisions = [decision()];
    const ui = render(shell(<AccountStatus />));
    expect(ui.getByText('1 active policy issue')).toBeTruthy();
    fireEvent.press(ui.getByText('Appeal decision'));
    fireEvent.press(ui.getByText('Submit appeal'));
    expect(mockAppeal.mutateAsync).not.toHaveBeenCalled();
    fireEvent.changeText(
      ui.getByPlaceholderText('Add context the reviewer should consider.'),
      '  A detailed synthetic appeal statement.  ',
    );
    await act(async () => fireEvent.press(ui.getByText('Submit appeal')));
    expect(mockAppeal.mutateAsync).toHaveBeenCalledWith({
      decisionId: 'decision',
      statement: 'A detailed synthetic appeal statement.',
    });
    expect(ui.queryByText('Submit appeal')).toBeNull();
  });
  it('keeps failed appeal draft and clears on cancel', async () => {
    mockStatus.data!.decisions = [decision()];
    mockAppeal.error = new Error('Retry later');
    mockAppeal.mutateAsync.mockRejectedValue(new Error('Retry later'));
    const ui = render(shell(<AccountStatus />));
    fireEvent.press(ui.getByText('Appeal decision'));
    fireEvent.changeText(
      ui.getByPlaceholderText('Add context the reviewer should consider.'),
      'Detailed synthetic appeal text',
    );
    await act(async () => fireEvent.press(ui.getByText('Submit appeal')));
    expect(ui.getByDisplayValue('Detailed synthetic appeal text')).toBeTruthy();
    expect(ui.getByText('Retry later')).toBeTruthy();
    fireEvent.press(ui.getByText('Cancel'));
    fireEvent.press(ui.getByText('Appeal decision'));
    expect(ui.getByPlaceholderText('Add context the reviewer should consider.').props.value).toBe(
      '',
    );
  });
});
it('renders fallback identity, version and blocked count', () => {
  mockProfile!.display_name = '';
  mockBlocked = 2;
  mockConstants.expoConfig = null;
  mockConstants.nativeBuildVersion = null;
  const ui = render(shell(<Settings />));
  expect(ui.getByText('synthetic')).toBeTruthy();
  expect(ui.getByText('2 blocked')).toBeTruthy();
  expect(ui.getByText('Doji 1.0.0')).toBeTruthy();
  mockProfile = null;
  mockBlocked = undefined;
  ui.rerender(shell(<Settings />));
  expect(ui.getByText('Manage blocked accounts')).toBeTruthy();
});
it('shared settings supports static rows and custom icon/right slots', () => {
  const ui = render(
    <SettingsGroup>
      <SettingsRow label="Static" danger icon={<Text>Icon</Text>} right={<Text>Value</Text>} />
      <SettingsRow label="No arrow" showChevron={false} isLast />
    </SettingsGroup>,
  );
  expect(ui.getByText('Value')).toBeTruthy();
  expect(ui.queryByRole('button')).toBeNull();
});
it.each(['temporarily_restricted', 'suspended'] as const)(
  'renders %s access with explicit or fallback notice',
  (state) => {
    mockStatus.data!.account_access = {
      state,
      decision_id: 'decision',
      ends_at: '2026-10-03T00:00:00Z',
      title: null,
      body: 'Restriction details',
      appeal_eligible: true,
      appeal_status: null,
    };
    const ui = render(shell(<AccountStatus />));
    expect(ui.getByText('Restriction details')).toBeTruthy();
    for (const ends_at of [null, 'invalid']) {
      mockStatus.data!.account_access = { ...mockStatus.data!.account_access, body: null, ends_at };
      ui.rerender(shell(<AccountStatus />));
      expect(ui.queryByText('Restriction details')).toBeNull();
    }
  },
);
it('renders warnings, restrictions, suspensions, inactive decisions and resolved appeals', () => {
  mockStatus.data!.decisions = [
    decision({
      id: 'warning',
      account_action: { action: 'warning' } as Decision['account_action'],
    }),
    decision({
      id: 'restriction',
      decided_at: 'bad date',
      account_action: {
        action: 'temporary_restriction',
        state: 'expired',
        ends_at: '2026-09-01T00:00:00Z',
      } as Decision['account_action'],
    }),
    decision({
      id: 'ban',
      account_action: { action: 'permanent_ban' } as Decision['account_action'],
    }),
    decision({
      id: 'resolved',
      state: 'reversed',
      appeal: { status: 'reversed', review_reason: 'Reversed on review' } as Decision['appeal'],
    }),
    decision({
      id: 'pending',
      state: 'superseded' as Decision['state'],
      appeal: { status: 'pending', review_reason: null } as Decision['appeal'],
    }),
    decision({ id: 'clean', action: 'no_violation', appeal_eligible: false }),
  ];
  const ui = render(shell(<AccountStatus />));
  for (const label of [
    '3 active policy issues',
    'Warning',
    'Temporary restriction',
    'Account suspension',
    'Appeal Reversed',
    'Reversed on review',
    'Your appeal is awaiting an independent review.',
  ])
    expect(ui.getByText(label)).toBeTruthy();
  mockStatus.data!.decisions = [
    decision({
      account_action: {
        action: 'temporary_restriction',
        state: 'active',
        ends_at: '2026-10-03T00:00:00Z',
      } as Decision['account_action'],
    }),
  ];
  ui.rerender(shell(<AccountStatus />));
  expect(ui.getByText(/Scheduled to end/)).toBeTruthy();
});
describe.each(['ios', 'android', 'web'] as const)('%s notification preferences', (platform) => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', platform);
  });
  it('refreshes permission and renders platform-appropriate controls', async () => {
    const ui = render(<NotificationSettings />);
    await act(async () => mockFocus?.());
    if (platform === 'web') {
      expect(mockPermission).not.toHaveBeenCalled();
      expect(ui.queryByLabelText('Alerts on this phone')).toBeNull();
    } else {
      expect(mockPermission).toHaveBeenCalled();
      expect(ui.getByLabelText('Alerts on this phone')).toBeTruthy();
    }
    fireEvent.press(ui.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalled();
  });
  if (platform !== 'web') {
    it.each(['doji_live', 'friend_requests', 'mentions_replies', 'reviews_account'] as const)(
      'persists canonical %s preference patch',
      async (key) => {
        const ui = render(<NotificationSettings />);
        await act(async () => mockFocus?.());
        const index =
          ['doji_live', 'friend_requests', 'mentions_replies', 'reviews_account'].indexOf(key) + 1;
        await act(async () =>
          fireEvent(ui.UNSAFE_getAllByType(Switch)[index], 'valueChange', false),
        );
        expect(mockUpdate).toHaveBeenCalledWith({
          notification_preferences: {
            ...DEFAULT_NOTIFICATION_PREFERENCES,
            ...phoneAlertPreferencePatch(key, false),
          },
        });
      },
    );
    it('rolls back rejected category writes', async () => {
      mockUpdate.mockRejectedValue(new Error('offline'));
      const ui = render(<NotificationSettings />);
      await act(async () => mockFocus?.());
      await act(async () => fireEvent(ui.UNSAFE_getAllByType(Switch)[1], 'valueChange', false));
      expect(ui.getByText('Could not save that notification setting. Try again.')).toBeTruthy();
      expect(ui.UNSAFE_getAllByType(Switch)[1].props.value).toBe(
        DEFAULT_NOTIFICATION_PREFERENCES.doji_live,
      );
    });
    it.each(['granted', 'denied', 'error', 'throw'])('handles enable result %s', async (result) => {
      if (result === 'throw') mockRegister.mockRejectedValue(new Error('native'));
      else mockRegister.mockResolvedValue(result);
      const ui = render(<NotificationSettings />);
      await act(async () =>
        fireEvent(ui.getByLabelText('Alerts on this phone'), 'valueChange', true),
      );
      expect(mockRegister).toHaveBeenCalledWith('member');
      if (result === 'granted')
        expect(ui.getByText('Alerts are enabled on this phone.')).toBeTruthy();
      else if (result === 'denied') {
        expect(mockDialog).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Allow notifications' }),
        );
        await act(async () => mockDialog.mock.calls[0][0].actions[1].onPress());
        expect(Linking.openSettings).toHaveBeenCalled();
      } else
        expect(
          ui.getByText(
            result === 'error'
              ? 'Could not connect this phone to alerts. Try again.'
              : 'Could not enable alerts on this phone. Try again.',
          ),
        ).toBeTruthy();
    });
    it.each([false, true])('disables alerts even if token cleanup fails=%s', async (failure) => {
      if (failure) mockUnregister.mockRejectedValue(new Error('cleanup'));
      const ui = render(<NotificationSettings />);
      await act(async () =>
        fireEvent(ui.getByLabelText('Alerts on this phone'), 'valueChange', false),
      );
      expect(mockUpdate).toHaveBeenCalledWith({
        notification_preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, push_enabled: false },
      });
      expect(mockUnregister).toHaveBeenCalled();
      expect(ui.getByText('Phone alerts are turned off.')).toBeTruthy();
      expect(mockSetProfile).toHaveBeenCalledTimes(failure ? 0 : 1);
    });
    it.each([false, true])(
      'does not claim success after failed preference save when enabling=%s',
      async (enabled) => {
        mockUpdate.mockRejectedValue(new Error('denied'));
        const ui = render(<NotificationSettings />);
        await act(async () =>
          fireEvent(ui.getByLabelText('Alerts on this phone'), 'valueChange', enabled),
        );
        expect(ui.getByText('Could not save that notification setting. Try again.')).toBeTruthy();
        expect(mockUnregister).not.toHaveBeenCalled();
      },
    );
  }
});
it('does not write preferences without a member identity', async () => {
  mockProfile = null;
  mockPermission.mockResolvedValue({ status: 'denied' });
  const ui = render(<NotificationSettings />);
  await act(async () => mockFocus?.());
  await act(async () => fireEvent(ui.getByLabelText('Alerts on this phone'), 'valueChange', true));
  expect(mockUpdate).not.toHaveBeenCalled();
});
