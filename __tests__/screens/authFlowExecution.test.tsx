import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Login from '../../app/(auth)/login';
import Username from '../../app/(auth)/username';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { KeyboardToolbarProvider } from '../../contexts/KeyboardToolbarContext';
import { AuthModeBackButton } from '../../components/auth/AuthModeBackButton';
import { LegacyAgeFallbackInput } from '../../components/auth/LegacyAgeFallbackInput';
import { legalAcceptanceMetadata } from '../../lib/legal';

const mockAuth = {
  signInWithPassword: jest.fn(),
  signUp: jest.fn(),
  resetPasswordForEmail: jest.fn(),
  refreshSession: jest.fn(),
};
const mockCommand = jest.fn(),
  mockFetchProfile = jest.fn(),
  mockUpload = jest.fn(),
  mockRemove = jest.fn();
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
let mockSession: { user: { id: string; user_metadata: { birth_date?: string } } } | null;
let mockAvailability = { isOkForSubmit: true, status: 'available', errorMessage: '' };
let mockSelectPhoto: (uri: string) => void, mockPhotoError: (value: string) => void;
let mockDark = false;
jest.mock('../../lib/supabase', () => ({
  supabase: {
    get auth() {
      return mockAuth;
    },
  },
}));
jest.mock('../../lib/commandGateway', () => ({
  executeCommand: (...args: unknown[]) => mockCommand(...args),
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: () => ({ session: mockSession, fetchProfile: mockFetchProfile }),
}));
jest.mock('../../hooks/useUsernameAvailability', () => ({
  ...jest.requireActual('../../hooks/useUsernameAvailability'),
  useUsernameAvailability: () => mockAvailability,
}));
jest.mock('../../hooks/useProfilePhotoPicker', () => ({
  useProfilePhotoPicker: (onSelect: typeof mockSelectPhoto, onError: typeof mockPhotoError) => {
    mockSelectPhoto = onSelect;
    mockPhotoError = onError;
    return () => onSelect('file://synthetic.jpg');
  },
}));
jest.mock('../../utils/upload', () => ({
  uploadAvatar: (...args: unknown[]) => mockUpload(...args),
  removePublicStorageObject: (...args: unknown[]) => mockRemove(...args),
}));
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: require('../../constants/theme')[mockDark ? 'darkColors' : 'lightColors'],
  }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useFocusEffect: jest.fn(),
  Stack: { Screen: () => null },
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
);
const clients: QueryClient[] = [];
const shell = (node: React.ReactNode) => {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  clients.push(client);
  return (
    <QueryClientProvider client={client}>
      <KeyboardToolbarProvider>{node}</KeyboardToolbarProvider>
    </QueryClientProvider>
  );
};
const input = (ui: ReturnType<typeof render>, label: string, text: string) =>
  act(() => {
    const field = ui
      .UNSAFE_getAllByType(Input)
      .find((x) => String(x.props.label).startsWith(label));
    if (!field) throw new Error(`Missing field ${label}`);
    field.props.onChangeText(text);
  });
const submit = async (ui: ReturnType<typeof render>) => {
  await act(async () => ui.UNSAFE_getByType(Button).props.onPress());
};
const credentials = (ui: ReturnType<typeof render>) => {
  input(ui, 'Email', ' MEMBER@EXAMPLE.TEST ');
  input(ui, 'Password', 'synthetic-password');
};
const signup = (ui: ReturnType<typeof render>) => {
  fireEvent.press(ui.getByLabelText('Sign up'));
  fireEvent.changeText(ui.getByPlaceholderText('MM/DD/YYYY'), '01011990');
  fireEvent.press(ui.getByText('Continue'));
  credentials(ui);
  input(ui, 'Confirm password', 'synthetic-password');
  fireEvent.press(ui.getByLabelText('Agree to the Terms of Use'));
  fireEvent.press(ui.getByLabelText('Agree to the Privacy Policy'));
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockDark = false;
  mockSession = { user: { id: 'member', user_metadata: { birth_date: '1990-01-01' } } };
  mockAvailability = { isOkForSubmit: true, status: 'available', errorMessage: '' };
  mockAuth.signInWithPassword.mockResolvedValue({ error: null });
  mockAuth.signUp.mockResolvedValue({ data: { session: {} }, error: null });
  mockAuth.resetPasswordForEmail.mockResolvedValue({ error: null });
  mockAuth.refreshSession.mockResolvedValue({});
  mockFetchProfile.mockResolvedValue(undefined);
  mockCommand.mockResolvedValue({
    data: { avatar_url: 'https://example.test/avatar.jpg' },
    error: null,
  });
  mockUpload.mockResolvedValue('https://example.test/avatar.jpg');
  mockRemove.mockResolvedValue(undefined);
});
afterEach(() => {
  clients.splice(0).forEach((x) => x.clear());
  jest.useRealTimers();
});

describe.each([false, true])('member auth dark=%s', (dark) => {
  beforeEach(() => {
    mockDark = dark;
  });
  it('signs in with normalized email through Supabase only', async () => {
    const ui = render(shell(<Login />));
    credentials(ui);
    await submit(ui);
    expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({
      email: 'member@example.test',
      password: 'synthetic-password',
    });
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
  it('shows auth failure and clears it when editing either credential', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({
      error: new Error('Invalid login credentials'),
    });
    const ui = render(shell(<Login />));
    credentials(ui);
    await submit(ui);
    expect(ui.getByText('Sign in failed')).toBeTruthy();
    input(ui, 'Email', 'other@example.test');
    expect(ui.queryByTestId('auth-inline-feedback')).toBeNull();
    await submit(ui);
    input(ui, 'Password', 'different');
    expect(ui.queryByTestId('auth-inline-feedback')).toBeNull();
  });
  it('enforces age and separate consents before signup', async () => {
    const ui = render(shell(<Login />));
    signup(ui);
    await submit(ui);
    expect(mockAuth.signUp).toHaveBeenCalledWith({
      email: 'member@example.test',
      password: 'synthetic-password',
      options: {
        data: { ...legalAcceptanceMetadata(new Date().toISOString()), birth_date: '1990-01-01' },
      },
    });
    expect(mockAuth.signInWithPassword).not.toHaveBeenCalled();
  });
  it('sends password-reset only for valid email and displays success', async () => {
    const ui = render(shell(<Login />));
    await act(async () => fireEvent.press(ui.getByLabelText('Forgot password')));
    expect(ui.getByText('Enter a valid email address above first.')).toBeTruthy();
    expect(mockAuth.resetPasswordForEmail).not.toHaveBeenCalled();
    credentials(ui);
    await act(async () => fireEvent.press(ui.getByLabelText('Forgot password')));
    expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledWith('member@example.test');
    expect(ui.getByText('Reset email sent')).toBeTruthy();
  });
  it('handles reset provider errors without altering login mode', async () => {
    mockAuth.resetPasswordForEmail.mockResolvedValue({ error: new Error('Network failed') });
    const ui = render(shell(<Login />));
    credentials(ui);
    await act(async () => fireEvent.press(ui.getByLabelText('Forgot password')));
    expect(ui.getByText('Could not send reset email')).toBeTruthy();
    expect(ui.getByText('Welcome back')).toBeTruthy();
  });
  it('creates one authoritative profile then refreshes session, profile and event cache', async () => {
    const ui = render(shell(<Username />));
    input(ui, 'Username', ' @Synthetic ');
    input(ui, 'Display name', ' Synthetic Member ');
    input(ui, 'Bio', ' short bio ');
    await submit(ui);
    expect(mockCommand).toHaveBeenCalledWith(
      'create_own_profile',
      expect.objectContaining({
        p_username: 'synthetic',
        p_display_name: 'Synthetic Member',
        p_bio: 'short bio',
        p_birth_date: '1990-01-01',
        p_avatar_url: null,
      }),
    );
    expect(mockAuth.refreshSession).toHaveBeenCalled();
    expect(mockFetchProfile).toHaveBeenCalledWith('member');
    expect(String(mockRouter.replace.mock.calls[0][0])).toContain('how-it-works');
  });
});
it.each([null, new Error('confirm email')])(
  'handles signup without returned session, fallback sign-in error=%s',
  async (error) => {
    mockAuth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    mockAuth.signInWithPassword.mockResolvedValue({ error });
    const ui = render(shell(<Login />));
    signup(ui);
    await submit(ui);
    expect(mockAuth.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(Boolean(ui.queryByText('Check your email'))).toBe(Boolean(error));
  },
);
it('shows signup failure independently from sign-in and resets signup state on mode switch', async () => {
  mockAuth.signUp.mockResolvedValue({ error: new Error('failed') });
  const ui = render(shell(<Login />));
  signup(ui);
  await submit(ui);
  expect(ui.getByText('Could not create account')).toBeTruthy();
  input(ui, 'Confirm password', 'different');
  expect(ui.queryByTestId('auth-inline-feedback')).toBeNull();
  fireEvent.press(ui.getByLabelText('Sign in'));
  expect(ui.getByText('Welcome back')).toBeTruthy();
  fireEvent.press(ui.getByLabelText('Sign up'));
  expect(ui.getByPlaceholderText('MM/DD/YYYY').props.value).toBe('');
});
it('returns from credentials to birthday and from birthday to sign-in', () => {
  const ui = render(shell(<Login />));
  signup(ui);
  act(() => ui.UNSAFE_getByType(AuthModeBackButton).props.onReturnToSignIn());
  expect(ui.getByText('What’s your birthday?')).toBeTruthy();
  act(() => ui.UNSAFE_getByType(AuthModeBackButton).props.onReturnToSignIn());
  expect(ui.getByText('Welcome back')).toBeTruthy();
});
it('shows invalid birthday on blur and rejects invalid age continuation', async () => {
  const ui = render(shell(<Login />));
  fireEvent.press(ui.getByLabelText('Sign up'));
  fireEvent.changeText(ui.getByPlaceholderText('MM/DD/YYYY'), '99999999');
  fireEvent(ui.getByPlaceholderText('MM/DD/YYYY'), 'blur');
  await submit(ui);
  expect(ui.getByText('What’s your birthday?')).toBeTruthy();
  expect(mockAuth.signUp).not.toHaveBeenCalled();
});
it.each(['email', 'password', 'confirmation', 'consent'])(
  'defensively rejects invalid %s submitted callbacks',
  async (field) => {
    const ui = render(shell(<Login />));
    if (field === 'confirmation' || field === 'consent') signup(ui);
    else credentials(ui);
    if (field === 'email') input(ui, 'Email', 'bad');
    if (field === 'password') input(ui, 'Password', 'x');
    if (field === 'confirmation') input(ui, 'Confirm password', 'other');
    if (field === 'consent') fireEvent.press(ui.getByLabelText('Agree to the Privacy Policy'));
    await submit(ui);
    expect(ui.getByTestId('auth-inline-feedback')).toBeTruthy();
    expect(mockAuth.signUp).not.toHaveBeenCalled();
    expect(mockAuth.signInWithPassword).not.toHaveBeenCalled();
  },
);
it('holds profile setup until username and session are valid', async () => {
  const ui = render(shell(<Username />));
  input(ui, 'Username', 'synthetic');
  mockAvailability.isOkForSubmit = false;
  ui.rerender(shell(<Username />));
  await submit(ui);
  mockAvailability.isOkForSubmit = true;
  mockAvailability.status = 'checking';
  ui.rerender(shell(<Username />));
  await submit(ui);
  mockAvailability.status = 'available';
  mockSession = null;
  ui.rerender(shell(<Username />));
  await submit(ui);
  expect(mockCommand).not.toHaveBeenCalled();
});
it('supports legacy age verification and surfaces invalid age', async () => {
  mockSession!.user.user_metadata = {};
  const ui = render(shell(<Username />));
  input(ui, 'Username', 'synthetic');
  act(() => ui.UNSAFE_getByType(LegacyAgeFallbackInput).props.onBlur());
  await submit(ui);
  expect(mockCommand).not.toHaveBeenCalled();
  act(() => ui.UNSAFE_getByType(LegacyAgeFallbackInput).props.onChange('01/01/1990'));
  await submit(ui);
  expect(mockCommand).toHaveBeenCalledWith(
    'create_own_profile',
    expect.objectContaining({ p_display_name: 'synthetic', p_bio: null }),
  );
});
it.each(['invalid', 'taken', 'error'])('shows username availability %s feedback', (status) => {
  mockAvailability = { status, isOkForSubmit: false, errorMessage: 'Unavailable handle' };
  const ui = render(shell(<Username />));
  expect(ui.getByText('Unavailable handle')).toBeTruthy();
});
it.each(['Display name', 'Bio'])(
  'filters unsafe %s before issuing profile command',
  async (label) => {
    const ui = render(shell(<Username />));
    input(ui, 'Username', 'synthetic');
    input(ui, label, 'fuck');
    await submit(ui);
    expect(mockCommand).not.toHaveBeenCalled();
    input(ui, label, 'safe content');
    await submit(ui);
    expect(mockCommand).toHaveBeenCalled();
  },
);
it.each(['accepted', 'existing', 'conflict', 'error', 'thrown'])(
  'cleans up only orphan uploads: %s',
  async (outcome) => {
    const ui = render(shell(<Username />));
    input(ui, 'Username', 'synthetic');
    fireEvent.press(ui.getByLabelText('Add profile photo'));
    expect(ui.getByLabelText('Change profile photo')).toBeTruthy();
    if (outcome === 'existing')
      mockCommand.mockResolvedValue({ data: { avatar_url: 'https://example.test/original.jpg' } });
    if (outcome === 'conflict') mockCommand.mockResolvedValue({ error: { code: '23505' } });
    if (outcome === 'error') mockCommand.mockResolvedValue({ error: { code: 'unavailable' } });
    if (outcome === 'thrown') mockCommand.mockRejectedValue(new Error('network'));
    await submit(ui);
    expect(mockUpload).toHaveBeenCalledWith('member', 'file://synthetic.jpg');
    expect(mockRemove).toHaveBeenCalledTimes(outcome === 'accepted' ? 0 : 1);
    if (outcome === 'conflict') {
      expect(ui.getByText('That username was just taken. Pick another.')).toBeTruthy();
      input(ui, 'Username', 'different');
      expect(ui.queryByText('That username was just taken. Pick another.')).toBeNull();
    }
    if (outcome === 'error' || outcome === 'thrown')
      expect(ui.getByTestId('profile-setup-error')).toBeTruthy();
  },
);
it('keeps photo-picker errors visible and limits bio length', () => {
  const ui = render(shell(<Username />));
  act(() => mockPhotoError('Photo denied'));
  expect(ui.getByText('Photo denied')).toBeTruthy();
  input(ui, 'Bio', 'a'.repeat(200));
  expect(ui.getByDisplayValue('a'.repeat(150))).toBeTruthy();
  expect(ui.queryByText('Photo denied')).toBeNull();
});
