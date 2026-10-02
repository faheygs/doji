import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ActivityIndicator, Linking } from 'react-native';
import Banned from '../../app/banned';
import { KeyboardToolbarProvider } from '../../contexts/KeyboardToolbarContext';
import type { ModerationStatus } from '../../hooks/useModerationStatus';
const mockStatus = {
  data: undefined as ModerationStatus | undefined,
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
};
const mockAppeal = { mutateAsync: jest.fn(), isPending: false, error: null as unknown };
const mockAuth = {
  profile: { username: 'member' } as { username: string } | null,
  signOut: jest.fn(),
};
jest.mock('../../hooks/useModerationStatus', () => ({
  useModerationStatus: () => mockStatus,
  useSubmitModerationAppeal: () => mockAppeal,
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (selector: (s: typeof mockAuth) => unknown) => selector(mockAuth),
}));
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
jest.mock('../../components/settings/DeleteAccountAction', () => ({
  DeleteAccountAction: () => null,
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
type Decision = ModerationStatus['decisions'][number];
const data = (decision: Partial<Decision> = {}, access: Record<string, unknown> = {}) =>
  ({
    account_access: {
      state: 'suspended',
      ends_at: null,
      appeal_eligible: true,
      appeal_status: null,
      decision_id: 'decision',
      title: 'Decision title',
      body: 'Decision explanation',
      ...access,
    },
    decisions: [
      {
        id: 'decision',
        state: 'active',
        appeal_eligible: true,
        user_notice: 'User notice',
        ...decision,
      },
    ],
    notices: [],
  }) as ModerationStatus;
const start = () =>
  render(
    <KeyboardToolbarProvider>
      <Banned />
    </KeyboardToolbarProvider>,
  );
beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockStatus, { data: data(), isLoading: false, isError: false });
  mockAppeal.error = null;
  mockAppeal.isPending = false;
  mockAppeal.mutateAsync.mockReset().mockResolvedValue({});
  mockAuth.profile = { username: 'member' };
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});
afterEach(() => jest.restoreAllMocks());
it.each(['loading', 'error', 'missing', 'notice', 'fallback'])(
  'shows the %s decision state',
  (mode) => {
    if (mode === 'loading') mockStatus.isLoading = true;
    if (mode === 'error') mockStatus.isError = true;
    if (mode === 'missing') mockStatus.data = undefined;
    if (mode === 'notice') mockStatus.data = data({}, { title: '', body: '' });
    if (mode === 'fallback') mockStatus.data = data({ user_notice: '' }, { body: '', title: '' });
    const ui = start();
    if (mode === 'loading') expect(ui.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    else if (mode === 'error') {
      expect(ui.getByText('Decision details unavailable')).toBeTruthy();
      fireEvent.press(ui.getByText('Try again'));
      expect(mockStatus.refetch).toHaveBeenCalled();
    } else
      expect(
        ui.getByText(
          mode === 'notice'
            ? 'User notice'
            : 'Contact support for details about this account decision.',
        ),
      ).toBeTruthy();
  },
);
it.each(['pending', 'reversed', 'upheld'])(
  'shows reviewed appeal status %s without another submission',
  (status) => {
    mockStatus.data = data({
      appeal: {
        status,
        review_reason: status === 'pending' ? '' : 'Reviewed explanation',
      } as Decision['appeal'],
    });
    const ui = start();
    expect(
      ui.getByText(status === 'pending' ? 'Appeal submitted' : 'Appeal reviewed'),
    ).toBeTruthy();
    expect(ui.queryByText('Appeal decision')).toBeNull();
  },
);
it.each([true, false])(
  'submits an appeal with success=%s and preserves a failed statement',
  async (success) => {
    const ui = start();
    fireEvent.press(ui.getByText('Appeal decision'));
    fireEvent.changeText(
      ui.getByPlaceholderText('Add context the reviewer should consider.'),
      'short',
    );
    fireEvent.press(ui.getByText('Submit appeal'));
    expect(mockAppeal.mutateAsync).not.toHaveBeenCalled();
    fireEvent.changeText(
      ui.getByPlaceholderText('Add context the reviewer should consider.'),
      '  Synthetic explanation with enough context  ',
    );
    if (!success) {
      mockAppeal.error = new Error('Please retry');
      mockAppeal.mutateAsync.mockRejectedValue(mockAppeal.error);
    }
    await act(async () => fireEvent.press(ui.getByText('Submit appeal')));
    expect(mockAppeal.mutateAsync).toHaveBeenCalledWith({
      decisionId: 'decision',
      statement: 'Synthetic explanation with enough context',
    });
    if (success) expect(ui.queryByText('Submit appeal')).toBeNull();
    else {
      ui.rerender(
        <KeyboardToolbarProvider>
          <Banned />
        </KeyboardToolbarProvider>,
      );
      expect(ui.getByText('Please retry')).toBeTruthy();
      fireEvent.press(ui.getByText('Cancel'));
      expect(ui.queryByText('Submit appeal')).toBeNull();
    }
  },
);
it.each([true, false])(
  'opens support with safe username fallback present=%s and signs out only when requested',
  (present) => {
    if (!present) mockAuth.profile = null;
    const ui = start();
    expect(mockAuth.signOut).not.toHaveBeenCalled();
    fireEvent.press(ui.getByText('Contact support'));
    expect(decodeURIComponent((Linking.openURL as jest.Mock).mock.calls[0][0])).toContain(
      `Username: @${present ? 'member' : 'unknown'}`,
    );
    fireEvent.press(ui.getByText('Sign out'));
    expect(mockAuth.signOut).toHaveBeenCalledTimes(1);
  },
);
