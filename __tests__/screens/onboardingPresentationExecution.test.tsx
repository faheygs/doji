import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { BackHandler, TouchableOpacity } from 'react-native';
import { lightColors, darkColors } from '../../constants/theme';
import HowItWorks from '../../app/(onboarding)/how-it-works';
import Notifications from '../../app/(onboarding)/notifications';
import OnboardingIndex from '../../app/(onboarding)/index';
import Welcome from '../../app/(auth)/welcome';
import RootIndex from '../../app/index';
import NotFound from '../../app/+not-found';
import Terms from '../../app/(auth)/terms';
import Privacy from '../../app/(auth)/privacy';
import AppTerms from '../../app/(app)/legal/terms';
import AppPrivacy from '../../app/(app)/legal/privacy';
import { AuthModeBackButton } from '../../components/auth/AuthModeBackButton';
import { AuthLegalLinks } from '../../components/auth/AuthLegalLinks';
import { LegalConsentCheckbox } from '../../components/auth/LegalConsentCheckbox';
import { SignupAgeStep } from '../../components/auth/SignupAgeStep';
import { LegacyAgeFallbackInput } from '../../components/auth/LegacyAgeFallbackInput';
import { ROUTES } from '../../lib/routes';
import { TERMS_SECTIONS, PRIVACY_SECTIONS } from '../../lib/legalDocuments';

let mockColors = lightColors;
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => false),
};
let mockParams: { returnTo?: string } = {};
let mockPath = '/missing';
let mockReady = true;
const mockUpdate = jest.fn();
let mockAuth: {
  session: unknown;
  profile: Record<string, unknown> | null;
  isLoading: boolean;
  updateProfile: typeof mockUpdate;
};
const mockPermission = jest.fn();
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: mockColors,
    isDark: mockColors === require('../../constants/theme').darkColors,
  }),
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  usePathname: () => mockPath,
  useFocusEffect: (cb: () => void) => {
    require('react').useEffect(cb, [cb]);
  },
  Stack: { Screen: () => null },
  Redirect: ({ href }: { href: string }) =>
    require('react').createElement(require('react-native').Text, { testID: 'redirect' }, href),
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: Object.assign(
    (selector?: (state: typeof mockAuth) => unknown) => (selector ? selector(mockAuth) : mockAuth),
    { getState: () => mockAuth },
  ),
}));
jest.mock('../../hooks/useAuthGate', () => ({ useAuthGate: () => ({ ready: mockReady }) }));
jest.mock('../../lib/pushNotifications', () => ({
  requestPushPermissionAndRegisterToken: () => mockPermission(),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockColors = lightColors;
  mockParams = {};
  mockPath = '/missing';
  mockReady = true;
  mockAuth = { session: null, profile: null, isLoading: false, updateProfile: mockUpdate };
  mockUpdate.mockResolvedValue(undefined);
  mockPermission.mockResolvedValue('granted');
  mockRouter.canGoBack.mockReturnValue(false);
});

describe.each(['light', 'dark'])('%s onboarding', (mode) => {
  beforeEach(() => {
    mockColors = mode === 'dark' ? darkColors : lightColors;
  });
  it('navigates every slide, back path and direct indicator', () => {
    const ui = render(<HowItWorks />);
    fireEvent.press(ui.UNSAFE_getAllByType(TouchableOpacity)[0]);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(ui.getByText('Earn XP and Sparks')).toBeTruthy();
    fireEvent.press(ui.getByRole('button', { name: 'Next' }));
    expect(ui.getByText('Your daily challenge')).toBeTruthy();
    expect(ui.queryByText('Profile → Sparks · Shop')).toBeNull();
    fireEvent.press(ui.UNSAFE_getAllByType(TouchableOpacity)[0]);
    expect(ui.getByText('Earn XP and Sparks')).toBeTruthy();
    fireEvent.press(ui.getByLabelText('Go to slide 3'));
    expect(ui.getByText('A quick window to respond')).toBeTruthy();
    fireEvent.press(ui.getByRole('button', { name: 'Continue' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(onboarding)/notifications');
    fireEvent.press(ui.getByLabelText('Go to slide 1'));
    fireEvent.press(ui.getByLabelText('Go to slide 2'));
    fireEvent.press(ui.getByRole('button', { name: 'Next' }));
    expect(ui.getByText('A quick window to respond')).toBeTruthy();
  });
  it('welcome sends members to login and exposes both legal documents', () => {
    const ui = render(<Welcome />);
    expect(ui.getByText('Proof beats excuses.')).toBeTruthy();
    fireEvent.press(ui.getByRole('button', { name: 'Continue' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/(auth)/login');
    fireEvent.press(ui.getByText('Terms of Use'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(auth)/terms');
    fireEvent.press(ui.getByText('Privacy Policy'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(auth)/privacy');
  });
  it.each(['granted', 'denied'])(
    'persists the %s notification decision before leaving',
    async (result) => {
      mockPermission.mockResolvedValue(result);
      mockAuth.profile = { notification_preferences: { friend_requests: false } };
      const ui = render(<Notifications />);
      fireEvent.press(ui.getByRole('button', { name: 'Enable Notifications' }));
      await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith(ROUTES.feed));
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          onboarding_completed_at: expect.any(String),
          notification_preferences: expect.objectContaining({
            push_enabled: result === 'granted',
            friend_requests: false,
          }),
        }),
      );
    },
  );
  it('allows skipping without requesting device permission', async () => {
    const ui = render(<Notifications />);
    fireEvent.press(ui.getByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith(ROUTES.feed));
    expect(mockPermission).not.toHaveBeenCalled();
    expect(mockUpdate.mock.calls[0][0].notification_preferences.push_enabled).toBe(false);
  });
  it('keeps interrupted setup on screen without changing preferences or completing onboarding', async () => {
    mockPermission.mockResolvedValueOnce('deferred');
    const ui = render(<Notifications />);
    fireEvent.press(ui.getByRole('button', { name: 'Enable Notifications' }));
    await waitFor(() => expect(ui.getByText('Alert setup was interrupted. Tap Enable Notifications to try again.')).toBeTruthy());
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
  it('reports permission service failure and can recover on retry', async () => {
    mockPermission.mockResolvedValueOnce('error');
    const ui = render(<Notifications />);
    fireEvent.press(ui.getByRole('button', { name: 'Enable Notifications' }));
    await waitFor(() =>
      expect(
        ui.getByText(
          'Could not connect this phone to alerts. Check your connection and try again.',
        ),
      ).toBeTruthy(),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    fireEvent.press(ui.getByRole('button', { name: 'Enable Notifications' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith(ROUTES.feed));
  });
  it('retains setup when persistence fails and disables skip during registration', async () => {
    let finish!: (value: string) => void;
    mockPermission.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mockUpdate.mockRejectedValueOnce(new Error('offline'));
    const ui = render(<Notifications />);
    fireEvent.press(ui.getByRole('button', { name: 'Enable Notifications' }));
    expect(ui.getByRole('button', { name: 'Skip for now' })).toBeDisabled();
    await act(async () => finish('granted'));
    expect(
      ui.getByText('Could not finish setup. Check your connection and try again.'),
    ).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    fireEvent.press(ui.getByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalled());
  });
});

describe('entry route decisions', () => {
  it('waits for authoritative auth readiness', () => {
    mockReady = false;
    expect(render(<RootIndex />).toJSON()).toBeNull();
  });
  it('enters onboarding at its first slide', () => {
    expect(render(<OnboardingIndex />).getByTestId('redirect')).toHaveTextContent(
      String(ROUTES.onboardingHowItWorks),
    );
  });
  it.each([
    [null, null, ROUTES.welcome],
    [{ user: { id: 'member' } }, null, ROUTES.username],
    [{ user: { id: 'member' } }, { is_banned: true }, ROUTES.banned],
    [
      { user: { id: 'member' } },
      { onboarding_completed_at: null, created_at: new Date().toISOString() },
      ROUTES.onboardingHowItWorks,
    ],
    [{ user: { id: 'member' } }, { onboarding_completed_at: '2026-01-01' }, ROUTES.feed],
  ])('resolves auth state to %s / %s / %s', (session, profile, destination) => {
    mockAuth.session = session;
    mockAuth.profile = profile;
    expect(render(<RootIndex />).getByTestId('redirect')).toHaveTextContent(String(destination));
  });
  it.each([
    [false, null, null, ROUTES.welcome],
    [true, {}, {}, ROUTES.welcome],
    [false, {}, null, ROUTES.username],
    [false, {}, {}, ROUTES.feed],
  ])('recovers unmatched route for loading=%s', (loading, session, profile, destination) => {
    mockAuth.isLoading = loading;
    mockAuth.session = session;
    mockAuth.profile = profile;
    expect(render(<NotFound />).getByTestId('redirect')).toHaveTextContent(String(destination));
  });
  it('normalizes a legacy feed href', () => {
    mockPath = '/(app)/index';
    expect(render(<NotFound />).getByTestId('redirect')).toHaveTextContent(String(ROUTES.feed));
  });
});

describe('auth form components', () => {
  it.each(['terms', 'privacy'] as const)(
    'keeps %s consent separate from document navigation',
    (document) => {
      const onChange = jest.fn();
      const ui = render(
        <LegalConsentCheckbox checked={false} onChange={onChange} document={document} />,
      );
      const label = document === 'terms' ? 'Terms of Use' : 'Privacy Policy';
      fireEvent.press(ui.getByRole('checkbox'));
      expect(onChange).toHaveBeenCalledWith(true);
      ui.rerender(<LegalConsentCheckbox checked onChange={onChange} document={document} />);
      expect(ui.getByRole('checkbox')).toBeChecked();
      fireEvent.press(ui.getByRole('checkbox'));
      expect(onChange).toHaveBeenLastCalledWith(false);
      fireEvent.press(ui.getByText(label));
      expect(mockRouter.push).toHaveBeenCalledWith(`/(auth)/${document}`);
    },
  );
  it.each([SignupAgeStep, LegacyAgeFallbackInput])(
    'formats private birthdate input and displays errors',
    (Component) => {
      const onChange = jest.fn(),
        onBlur = jest.fn();
      const ui = render(<Component value="" onChange={onChange} onBlur={onBlur} />);
      const input = ui.getByLabelText('Date of birth');
      expect(input.props.keyboardType).toBe('number-pad');
      expect(input.props.maxLength).toBe(10);
      fireEvent.changeText(input, '01022000');
      expect(onChange).toHaveBeenCalledWith('01/02/2000');
      fireEvent(input, 'blur');
      expect(onBlur).toHaveBeenCalled();
      ui.rerender(
        <Component value="01/02/2000" error="Invalid date" onChange={onChange} onBlur={onBlur} />,
      );
      expect(ui.getByText('Invalid date')).toBeTruthy();
    },
  );
  it.each(['signIn', 'signUp'] as const)(
    'handles header and hardware back in %s mode and cleans up listener',
    (mode) => {
      const remove = jest.fn();
      let hardware!: Parameters<typeof BackHandler.addEventListener>[1];
      const spy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_, handler) => {
        hardware = handler;
        return { remove };
      });
      const onReturn = jest.fn();
      const ui = render(<AuthModeBackButton mode={mode} onReturnToSignIn={onReturn} />);
      fireEvent.press(ui.getByLabelText('Back'));
      expect(mode === 'signIn' ? mockRouter.back : onReturn).toHaveBeenCalledTimes(1);
      expect(hardware({ type: 'hardwareBackPress', timeStamp: Date.now() })).toBe(
        mode === 'signUp',
      );
      ui.unmount();
      expect(remove).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    },
  );
  it('renders uncentered legal links', () => {
    const ui = render(<AuthLegalLinks prefix="Read" />);
    fireEvent.press(ui.getByText('Privacy Policy'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(auth)/privacy');
  });
});

describe.each([
  ['terms', Terms, TERMS_SECTIONS],
  ['privacy', Privacy, PRIVACY_SECTIONS],
  ['app terms', AppTerms, TERMS_SECTIONS],
  ['app privacy', AppPrivacy, PRIVACY_SECTIONS],
] as const)('%s document', (_, Component, sections) => {
  it('renders the complete approved document and uses safe fallback navigation', () => {
    const ui = render(<Component />);
    for (const section of sections) {
      expect(ui.getByText(section.title)).toBeTruthy();
      expect(ui.getByText(section.body)).toBeTruthy();
    }
    fireEvent.press(ui.getByLabelText('Back'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(app)/profile/settings');
  });
  it('returns through navigation history', () => {
    mockColors = darkColors;
    mockRouter.canGoBack.mockReturnValue(true);
    const ui = render(<Component />);
    fireEvent.press(ui.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
