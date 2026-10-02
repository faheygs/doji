import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { DeleteAccountAction } from '../../components/settings/DeleteAccountAction';

const mockShowDialog = jest.fn();
const mockInvoke = jest.fn();
const mockSignOut = jest.fn();
const mockSetSession = jest.fn();
const mockReport = jest.fn();
const mockToast = jest.fn();
jest.mock('../../contexts/DialogContext', () => ({ useAppDialog: () => ({ showDialog: mockShowDialog }) }));
jest.mock('../../lib/supabase', () => ({ supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } } }));
jest.mock('../../lib/telemetry', () => ({ reportOperationalFailure: (...args: unknown[]) => mockReport(...args) }));
jest.mock('../../stores/useAuthStore', () => ({ useAuthStore: { getState: () => ({
  session: { user: { id: 'test-member' } }, signOut: mockSignOut, setSession: mockSetSession, setLoading: jest.fn(),
}) } }));
jest.mock('react-native-toast-message', () => ({ show: (...args: unknown[]) => mockToast(...args) }));
jest.mock('../../components/ui/Button', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return { Button: ({ children, onPress, disabled }: any) => <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}><Text>{children}</Text></Pressable> };
});
jest.mock('../../components/ui/InlineFeedback', () => {
  const { Text } = jest.requireActual('react-native');
  return { InlineFeedback: ({ message }: any) => <Text>{message}</Text> };
});
beforeEach(() => { jest.clearAllMocks(); mockSignOut.mockResolvedValue(undefined); });
const confirm = () => mockShowDialog.mock.calls[0][0].actions.find((action: any) => action.label === 'Delete').onPress;

test('cancel makes no request; confirm is single-flight and failure is immediate and persistent', async () => {
  let resolveRequest!: (value: unknown) => void;
  mockInvoke.mockReturnValue(new Promise(resolve => { resolveRequest = resolve; }));
  const view = render(<DeleteAccountAction />);
  fireEvent.press(view.getByText('Delete account'));
  expect(mockInvoke).not.toHaveBeenCalled();
  expect(mockShowDialog.mock.calls[0][0].actions[0].onPress).toBeUndefined();
  let request!: Promise<void>;
  await act(async () => { request = confirm()(); await confirm()(); });
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  expect(view.getByText('Deleting account…')).toBeTruthy();
  await act(async () => { resolveRequest({ error: new Error('private database detail') }); await request; });
  expect(mockShowDialog.mock.calls[1][0].title).toBe('Account deletion needs attention');
  expect(view.getByText(/We couldn’t confirm/)).toBeTruthy();
  expect(view.queryByText(/private database detail/)).toBeNull();
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(mockReport).toHaveBeenCalledWith('account', 'delete_account_failed', expect.any(Error), expect.any(Object));
});

test('confirmed deletion stays successful when local cleanup fails', async () => {
  mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
  mockSignOut.mockRejectedValue(new Error('local cleanup unavailable'));
  const view = render(<DeleteAccountAction />);
  fireEvent.press(view.getByText('Delete account'));
  await act(async () => { await confirm()(); });
  expect(mockSetSession).toHaveBeenCalledWith(null);
  expect(mockShowDialog).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenCalledWith({ type: 'success', text1: 'Account deleted' });
});
