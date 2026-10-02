import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Linking, Modal, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppUpdatePrompt } from '../../components/system/AppUpdatePrompt';
import { AppAnnouncementPrompt } from '../../components/system/AppAnnouncementPrompt';
import { AppIconBadgeSync } from '../../components/notifications/AppIconBadgeSync';
import { AppDialog } from '../../components/ui/AppDialog';
import { ChangePasswordSheet } from '../../components/settings/ChangePasswordSheet';
import { KeyboardToolbarProvider } from '../../contexts/KeyboardToolbarContext';
import { updateDismissalKey, type MobileReleasePolicy } from '../../lib/appUpdate';
import type { AppAnnouncement } from '../../hooks/useAppAnnouncement';
import Toast from 'react-native-toast-message';

let mockPolicy: MobileReleasePolicy | null;
let mockAnnouncement: AppAnnouncement | null;
let mockPath = '/feed';
let mockUser: string | undefined = 'member';
let mockBadge = { badgeCount: 3, prefsHydrated: true };
const mockConstants = {
  nativeAppVersion: '1.0.8' as string | null,
  nativeBuildVersion: '23' as string | null,
  expoConfig: {
    version: '1.0.8',
    ios: { buildNumber: '101' },
    android: { versionCode: 23 },
  } as Record<string, unknown> | null,
};
const mockRouter = { replace: jest.fn() },
  mockRecord = jest.fn(),
  mockAnnouncementEnabled = jest.fn(),
  mockSetBadge = jest.fn(),
  mockUpdatePassword = jest.fn();
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: require('../../constants/theme').lightColors }),
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
);
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPath,
  useFocusEffect: jest.fn(),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  get default() {
    return mockConstants;
  },
}));
jest.mock('../../hooks/useAppUpdatePolicy', () => ({
  useAppUpdatePolicy: () => ({ data: mockPolicy }),
}));
jest.mock('../../hooks/useAppAnnouncement', () => ({
  useAppAnnouncement: (enabled: boolean) => {
    mockAnnouncementEnabled(enabled);
    return { data: enabled ? mockAnnouncement : null, recordAction: mockRecord };
  },
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ session: mockUser ? { user: { id: mockUser } } : null }),
}));
jest.mock('../../contexts/NotificationCenterContext', () => ({
  useNotificationCenterContext: () => mockBadge,
}));
jest.mock('expo-notifications', () => ({
  setBadgeCountAsync: (...args: unknown[]) => mockSetBadge(...args),
}));
jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { updateUser: (...args: unknown[]) => mockUpdatePassword(...args) } },
}));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
const originalPlatform = Platform.OS;
const policy = (required = false): MobileReleasePolicy => ({
  platform: 'android',
  latest_version: '1.0.8',
  latest_build: 24,
  minimum_version: '1.0.8',
  minimum_build: required ? 24 : 23,
  store_url: 'https://play.google.com/store/apps/details?id=com.doit.challengeapp',
  update_message: null,
  updated_at: '2026-10-01T00:00:00Z',
});
let openURL: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  Platform.OS = 'android';
  mockPolicy = policy();
  mockPath = '/feed';
  mockUser = 'member';
  mockBadge = { badgeCount: 3, prefsHydrated: true };
  mockAnnouncement = {
    id: 'campaign',
    title: 'New ideas',
    body: 'Suggest your daily challenge',
    cta_label: 'Suggest',
    cta_url: '/(app)/suggest-challenge',
  };
  Object.assign(mockConstants, {
    nativeAppVersion: '1.0.8',
    nativeBuildVersion: '23',
    expoConfig: { version: '1.0.8', ios: { buildNumber: '101' }, android: { versionCode: 23 } },
  });
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
  jest.mocked(AsyncStorage.setItem).mockResolvedValue();
  mockRecord.mockResolvedValue(undefined);
  mockSetBadge.mockResolvedValue(true);
  mockUpdatePassword.mockResolvedValue({ error: null });
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});
afterEach(() => {
  openURL.mockRestore();
  Platform.OS = originalPlatform;
  jest.useRealTimers();
});

describe('update policy dialogs', () => {
  it.each(['web', 'android', 'ios'] as const)(
    'does not prompt %s when disabled or current',
    async (os) => {
      Platform.OS = os;
      const ui = render(<AppUpdatePrompt enabled={false} />);
      await act(async () => {});
      expect(ui.toJSON()).toBeNull();
      mockPolicy = null;
      ui.rerender(<AppUpdatePrompt enabled />);
      expect(ui.toJSON()).toBeNull();
      mockPolicy = { ...policy(), latest_build: 23 };
      ui.rerender(<AppUpdatePrompt enabled />);
      expect(ui.toJSON()).toBeNull();
    },
  );
  it('requires update without permitting backdrop or system dismissal', () => {
    mockPolicy = policy(true);
    const ui = render(<AppUpdatePrompt enabled />);
    expect(ui.getByText('Update required')).toBeTruthy();
    expect(ui.queryByText('Not now')).toBeNull();
    expect(ui.getByLabelText('Close dialog')).toBeDisabled();
    expect(ui.UNSAFE_getByType(Modal).props.onRequestClose).toBeUndefined();
  });
  it.each([null, '0', String(Date.now() - 86400001), String(Date.now())])(
    'honors the optional dismissal timestamp %s',
    async (saved) => {
      jest.mocked(AsyncStorage.getItem).mockResolvedValue(saved);
      const ui = render(<AppUpdatePrompt enabled />);
      await act(async () => {});
      if (saved && Date.now() - Number(saved) < 86400000) {
        expect(ui.toJSON()).toBeNull();
        return;
      }
      expect(ui.getByText('Update available')).toBeTruthy();
      fireEvent.press(ui.getByText('Not now'));
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        updateDismissalKey('android', mockPolicy!),
        expect.any(String),
      );
      expect(ui.toJSON()).toBeNull();
    },
  );
  it.each([false, true])(
    'opens the store for required=%s without falsely dismissing mandatory policy',
    async (required) => {
      mockPolicy = policy(required);
      const ui = render(<AppUpdatePrompt enabled />);
      await act(async () => {});
      await act(async () => fireEvent.press(ui.getByText('Update now')));
      expect(openURL).toHaveBeenCalledWith(mockPolicy!.store_url);
      expect(Boolean(ui.queryByText('Update required'))).toBe(required);
      expect(AsyncStorage.setItem).toHaveBeenCalledTimes(required ? 0 : 1);
    },
  );
  it.each(['ios', 'android'] as const)(
    'explains %s store-open errors and lets the member retry',
    async (os) => {
      Platform.OS = os;
      mockPolicy = {
        ...policy(true),
        platform: os,
        latest_build: 200,
        minimum_build: 200,
        update_message: ' Custom update notice ',
      };
      openURL.mockRejectedValueOnce(new Error('not available'));
      const ui = render(<AppUpdatePrompt enabled />);
      expect(ui.getByText('Custom update notice')).toBeTruthy();
      await act(async () => fireEvent.press(ui.getByText('Update now')));
      expect(ui.getByText('Open the store to update')).toBeTruthy();
      expect(
        ui.getByText(new RegExp(`The ${os === 'ios' ? 'App Store' : 'Play Store'} did not open`)),
      ).toBeTruthy();
      await act(async () => fireEvent.press(ui.getByText('Update now')));
      expect(ui.getByText('Update required')).toBeTruthy();
    },
  );
  it('falls back to config build identity and handles storage errors', async () => {
    mockConstants.nativeAppVersion = null;
    mockConstants.nativeBuildVersion = null;
    jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('storage'));
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('storage'));
    const ui = render(<AppUpdatePrompt enabled />);
    await act(async () => {});
    expect(ui.getByText('Update available')).toBeTruthy();
    await act(async () => fireEvent.press(ui.getByText('Not now')));
    expect(ui.toJSON()).toBeNull();
  });
  it.each([true, false])(
    'ignores late storage result after unmount (resolve=%s)',
    async (success) => {
      let resolve!: (value: string | null) => void, reject!: (error: Error) => void;
      jest.mocked(AsyncStorage.getItem).mockImplementationOnce(
        () =>
          new Promise((yes, no) => {
            resolve = yes;
            reject = no;
          }),
      );
      const ui = render(<AppUpdatePrompt enabled />);
      ui.unmount();
      await act(async () => {
        if (success) resolve(null);
        else reject(new Error('storage'));
      });
      expect(openURL).not.toHaveBeenCalled();
    },
  );
  it.each(['ios', 'android'] as const)(
    'handles missing native and config identity on %s',
    async (os) => {
      Platform.OS = os;
      mockConstants.nativeAppVersion = null;
      mockConstants.nativeBuildVersion = null;
      mockConstants.expoConfig = null;
      const ui = render(<AppUpdatePrompt enabled />);
      expect(ui.getByText('Update required')).toBeTruthy();
    },
  );
});

describe('announcements remain optional and defer during participation', () => {
  it.each(['/challenge', '/camera', '/poll', '/task', '/format'])(
    'does not interrupt %s',
    (path) => {
      mockPath = path;
      const ui = render(<AppAnnouncementPrompt enabled />);
      act(() => jest.advanceTimersByTime(2500));
      expect(ui.toJSON()).toBeNull();
      expect(mockAnnouncementEnabled).toHaveBeenLastCalledWith(false);
    },
  );
  it('waits for the settling delay and records dismissal without a CTA', async () => {
    mockAnnouncement = { ...mockAnnouncement!, cta_label: null, cta_url: null };
    const ui = render(<AppAnnouncementPrompt enabled={false} />);
    act(() => jest.advanceTimersByTime(3000));
    expect(ui.toJSON()).toBeNull();
    ui.rerender(<AppAnnouncementPrompt enabled />);
    act(() => jest.advanceTimersByTime(2499));
    expect(ui.toJSON()).toBeNull();
    act(() => jest.advanceTimersByTime(1));
    expect(ui.getByText('New ideas')).toBeTruthy();
    fireEvent.press(ui.getByText('Not now'));
    expect(mockRecord).toHaveBeenCalledWith({ id: 'campaign', action: 'dismissed' });
    fireEvent.press(ui.getByLabelText('Close dialog'));
    expect(mockRecord).toHaveBeenCalledTimes(2);
  });
  it.each([
    '/(app)/suggest-challenge',
    '/(app)/profile/shop',
    'https://example.invalid/announcement',
    'javascript:alert(1)',
  ])('records CTA before navigating to %s', async (cta_url) => {
    mockAnnouncement = { ...mockAnnouncement!, cta_url };
    const ui = render(<AppAnnouncementPrompt enabled />);
    act(() => jest.advanceTimersByTime(2500));
    await act(async () => fireEvent.press(ui.getByText('Suggest')));
    expect(mockRecord).toHaveBeenCalledWith({ id: 'campaign', action: 'cta' });
    if (cta_url.startsWith('/')) expect(mockRouter.replace).toHaveBeenCalledWith(cta_url);
    else if (cta_url.startsWith('https:')) expect(openURL).toHaveBeenCalledWith(cta_url);
    else {
      expect(openURL).not.toHaveBeenCalled();
      expect(mockRouter.replace).not.toHaveBeenCalled();
    }
  });
});

describe('launcher badge synchronization', () => {
  it.each([
    ['web', 'member', true, 3, null],
    ['ios', undefined, true, 3, 0],
    ['android', 'member', false, 3, null],
    ['android', 'member', true, -2, 0],
    ['ios', 'member', true, 4, 4],
  ] as const)(
    'syncs %s / %s / hydrated=%s / count=%s',
    async (os, user, hydrated, count, expected) => {
      Platform.OS = os;
      mockUser = user;
      mockBadge = { badgeCount: count, prefsHydrated: hydrated };
      render(<AppIconBadgeSync />);
      await act(async () => {});
      if (expected === null) expect(mockSetBadge).not.toHaveBeenCalled();
      else expect(mockSetBadge).toHaveBeenCalledWith(expected);
    },
  );
  it('tolerates unsupported native badge APIs', async () => {
    mockSetBadge.mockRejectedValue(new Error('unsupported'));
    render(<AppIconBadgeSync />);
    await act(async () => {});
    expect(mockSetBadge).toHaveBeenCalled();
  });
  it('cancels queued native work on unmount', async () => {
    const ui = render(<AppIconBadgeSync />);
    ui.unmount();
    await act(async () => {});
    expect(mockSetBadge).not.toHaveBeenCalled();
  });
});

describe('password changes stay on the member auth boundary', () => {
  it.each([null, { message: 'Current password not accepted' }, { message: '' }])(
    'handles response %s and clears sensitive fields on close',
    async (error) => {
      const close = jest.fn();
      mockUpdatePassword.mockResolvedValue({ error });
      const ui = render(
        <KeyboardToolbarProvider>
          <ChangePasswordSheet visible onClose={close} />
        </KeyboardToolbarProvider>,
      );
      expect(ui.getByRole('button', { name: 'Update password' })).toBeDisabled();
      fireEvent.changeText(ui.getByLabelText('New password'), 'short');
      expect(ui.getByRole('button', { name: 'Update password' })).toBeDisabled();
      fireEvent.changeText(ui.getByLabelText('New password'), 'Synthetic-Password-22');
      fireEvent.changeText(ui.getByLabelText('Confirm new password'), 'different');
      expect(ui.getByRole('button', { name: 'Update password' })).toBeDisabled();
      fireEvent.changeText(ui.getByLabelText('Confirm new password'), 'Synthetic-Password-22');
      await act(async () => fireEvent.press(ui.getByRole('button', { name: 'Update password' })));
      expect(mockUpdatePassword).toHaveBeenCalledWith({ password: 'Synthetic-Password-22' });
      if (error) {
        expect(
          ui.getByText(error.message || 'Could not change your password. Try again.'),
        ).toBeTruthy();
        expect(close).not.toHaveBeenCalled();
        fireEvent.changeText(ui.getByLabelText('New password'), 'Another-password-22');
        expect(ui.queryByText('Could not change password')).toBeNull();
        fireEvent.press(ui.getByLabelText('Dismiss'));
      } else
        expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: 'Password updated' });
      expect(close).toHaveBeenCalledTimes(1);
      expect(ui.getByLabelText('New password').props.value).toBe('');
      expect(ui.getByLabelText('Confirm new password').props.value).toBe('');
    },
  );
});

it('supports destructive, cancel and optional dialog actions with no message', () => {
  const done = jest.fn();
  const ui = render(
    <AppDialog
      visible
      title="Confirm"
      onDismiss={done}
      actions={[
        { label: 'Delete', variant: 'destructive', onPress: done },
        { label: 'Cancel', variant: 'cancel', onPress: done },
        { label: 'No action' },
      ]}
    />,
  );
  fireEvent.press(ui.getByText('Delete'));
  fireEvent.press(ui.getByText('Cancel'));
  fireEvent.press(ui.getByText('No action'));
  expect(done).toHaveBeenCalledTimes(2);
});
