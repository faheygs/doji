import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Linking, Share } from 'react-native';
import ReportProblem from '../../app/(app)/profile/report-problem';
import { KeyboardToolbarProvider } from '../../contexts/KeyboardToolbarContext';
const mockBack = jest.fn();
let mockActor = 'member';
let mockDark = false;
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, canGoBack: () => true }), useLocalSearchParams: () => ({}),
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('../../stores/useAuthStore', () => ({ useAuthStore: Object.assign(
  (select: (state: unknown) => unknown) => select({ session: { user: { id: mockActor } } }),
  { getState: () => ({ session: { user: { id: mockActor } } }) },
) }));
jest.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ colors: require('../../constants/theme')[mockDark ? 'darkColors' : 'lightColors'] }) }));
jest.mock('../../lib/mobileDiagnosticContext', () => ({ mobileDiagnosticSnapshot: () => ({
  installation_id: 'diag:installation-123456', session_id: `diag:session-${mockActor}-123456`,
  email: 'private@example.com', token: 'private-secret',
}) }));
jest.mock('../../lib/releaseIdentity', () => ({ mobileReleaseIdentity: () => ({ platform: 'ios', appVersion: '1.0.9', nativeBuildNumber: '104' }) }));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));
const screen = () => <KeyboardToolbarProvider><ReportProblem /></KeyboardToolbarProvider>;
beforeEach(() => {
  jest.clearAllMocks();
  mockActor = 'member'; mockDark = false; mockBack.mockClear();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction });
});
afterEach(() => jest.restoreAllMocks());
test.each([false, true])('preview is selectable, theme-compatible and never sends on mount (dark=%s)', dark => {
  mockDark = dark;
  const ui = render(screen());
  expect(ui.getByLabelText('Diagnostic details').props.selectable).toBe(true);
  expect(ui.getByText(/Build: 104/)).toBeTruthy();
  expect(Linking.openURL).not.toHaveBeenCalled(); expect(Share.share).not.toHaveBeenCalled();
  fireEvent.press(ui.getByLabelText('Back')); expect(mockBack).toHaveBeenCalled();
});
test('email opens a draft containing only the preview and never claims submission', async () => {
  const ui = render(screen());
  await act(async () => fireEvent.press(ui.getByText('Email support')));
  const url = jest.mocked(Linking.openURL).mock.calls[0][0];
  expect(url).toMatch(/^mailto:support@dojipro.com\?/);
  expect(decodeURIComponent(url)).toContain(ui.getByLabelText('Diagnostic details').props.children);
  expect(url).not.toMatch(/private/);
  expect(ui.queryByText(/report (sent|submitted)/i)).toBeNull();
});
test('no email app has a usable copy/address fallback and no raw error details', async () => {
  jest.mocked(Linking.openURL).mockRejectedValue(new Error('private native failure'));
  const ui = render(screen());
  await act(async () => fireEvent.press(ui.getByText('Email support')));
  expect(ui.getByText(/Could not open an email app/)).toBeTruthy();
  expect(ui.getByText('support@dojipro.com')).toBeTruthy();
  expect(ui.queryByText(/private native/)).toBeNull();
});
test('share cancellation is not reported as a sent report', async () => {
  const ui = render(screen());
  await act(async () => fireEvent.press(ui.getByText('Share diagnostic details')));
  expect(Share.share).toHaveBeenCalledWith({ title: 'Doji diagnostic details', message: ui.getByLabelText('Diagnostic details').props.children });
  expect(ui.queryByText(/report (sent|submitted)/i)).toBeNull();
});
test('share failure retains the selectable reference', async () => {
  jest.mocked(Share.share).mockRejectedValue(new Error('private'));
  const ui = render(screen());
  await act(async () => fireEvent.press(ui.getByText('Share diagnostic details')));
  expect(ui.getByText(/Could not open sharing/)).toBeTruthy();
  expect(ui.getByLabelText('Diagnostic details').props.selectable).toBe(true);
});
test('account change prevents sharing stale references and refreshes the preview', async () => {
  const ui = render(screen()); mockActor = 'next';
  await act(async () => fireEvent.press(ui.getByText('Email support')));
  expect(Linking.openURL).not.toHaveBeenCalled();
  ui.rerender(screen());
  expect(ui.getByLabelText('Diagnostic details').props.children).toContain('diag:session-next-123456');
  expect(ui.getByLabelText('Diagnostic details').props.children).not.toContain('diag:session-member-123456');
});
test('rapid repeated taps open only one composer', async () => {
  let finish!: () => void;
  jest.mocked(Linking.openURL).mockImplementation(() => new Promise(resolve => { finish = () => resolve(undefined); }));
  const ui = render(screen());
  await act(async () => { fireEvent.press(ui.getByText('Email support')); fireEvent.press(ui.getByText('Email support')); });
  expect(Linking.openURL).toHaveBeenCalledTimes(1);
  await act(async () => finish());
});
