import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lightColors, darkColors } from '../../constants/theme';
import { SPARKS_BUY_IN_COST } from '../../constants/sparks';
import { ChallengeBanner } from '../../components/challenge/ChallengeBanner';
import { ChallengeTimer } from '../../components/challenge/ChallengeTimer';
import { CountdownRing } from '../../components/challenge/CountdownRing';
import { UpcomingDojiBanner } from '../../components/challenge/UpcomingDojiBanner';
import { ChallengeTypeGlyph } from '../../components/challenge/ChallengeTypeGlyph';
import { KeyboardToolbarProvider } from '../../contexts/KeyboardToolbarContext';
import { challengeEntryHref } from '../../lib/routes';
import type { Challenge, ChallengeType, UserEvent } from '../../types/database';

let mockColors = lightColors;
let mockSparks = 500;
let mockEligible = true;
let mockUntil = 0;
let mockRemaining = 120;
let mockExpire: (() => void) | undefined;
const mockBuy = jest.fn();
const mockRouter = { push: jest.fn() };
jest.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ colors: mockColors }) }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
);
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useFocusEffect: jest.fn() }));
jest.mock('../../hooks/useSparks', () => ({ useSparksBalance: () => mockSparks }));
jest.mock('../../hooks/useBuyIn', () => ({
  useBuyInToday: () => ({ buyIn: mockBuy, eligible: mockEligible, isPending: false }),
}));
jest.mock('../../hooks/useServerCountdown', () => ({
  useServerCountdown: (date: string | undefined, options?: { onExpire?: () => void }) => {
    if (options?.onExpire) mockExpire = options.onExpire;
    return date === 'fires' ? mockUntil : mockRemaining;
  },
}));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));
const challenge = (type: ChallengeType = 'photo'): Challenge =>
  ({
    id: 'synthetic',
    type,
    title: 'Daily prompt',
    description: 'Try something new',
    xp_reward: 75,
    participant_count: 4,
  }) as Challenge;
const event = (overrides: Partial<UserEvent> = {}): UserEvent =>
  ({
    id: 'event',
    status: 'pending',
    expires_at: '2099-01-01T00:00:00Z',
    daily_event: { fires_at: 'fires' },
    challenge: challenge(),
    buy_in_at: null,
    ...overrides,
  }) as UserEvent;
const shell = (node: React.ReactNode) => <KeyboardToolbarProvider>{node}</KeyboardToolbarProvider>;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockColors = lightColors;
  mockSparks = 500;
  mockEligible = true;
  mockUntil = 0;
  mockRemaining = 120;
  mockBuy.mockResolvedValue(undefined);
  mockExpire = undefined;
});
afterEach(() => jest.useRealTimers());

describe.each(['light', 'dark'])('%s challenge presentation', (mode) => {
  beforeEach(() => {
    mockColors = mode === 'dark' ? darkColors : lightColors;
  });
  it.each([null, event({ status: 'completed' }), event({ status: 'late' })])(
    'does not offer a completed or missing participation record',
    (record) => {
      expect(render(shell(<ChallengeBanner userEvent={record} />)).toJSON()).toBeNull();
    },
  );
  it('distinguishes locked, final countdown, active, urgent and fallback content', () => {
    mockUntil = 20;
    const ui = render(shell(<ChallengeBanner userEvent={event()} />));
    expect(ui.getByText('CHALLENGE INCOMING')).toBeTruthy();
    mockUntil = 5;
    ui.rerender(shell(<ChallengeBanner userEvent={event()} />));
    expect(ui.getByText('Challenge unlocking…')).toBeTruthy();
    mockUntil = 0;
    ui.rerender(shell(<ChallengeBanner userEvent={event()} />));
    expect(ui.getByText('4 joined')).toBeTruthy();
    expect(ui.getByText('+75 XP')).toBeTruthy();
    fireEvent.press(ui.getByLabelText('Open Daily prompt. 2:00 remaining'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(app)/challenge');
    mockRemaining = 30;
    ui.rerender(shell(<ChallengeBanner userEvent={event({ challenge: undefined })} />));
    expect(ui.getByText('+50 XP')).toBeTruthy();
    expect(ui.getByText('0:30')).toHaveStyle({ color: mockColors.warning });
    mockRemaining = 0;
    ui.rerender(shell(<ChallengeBanner userEvent={event()} />));
    expect(ui.getByText('0:00')).toBeTruthy();
  });
  it.each([{ signup_day_grace: true }, { status: 'buy_in_open' as const }])(
    'allows server-authorized exception %s',
    (override) => {
      const ui = render(shell(<ChallengeBanner userEvent={event(override)} />));
      fireEvent.press(ui.getByRole('button'));
      expect(mockRouter.push).toHaveBeenCalledWith('/(app)/challenge');
    },
  );
  it('shows missed state without offering unaffordable or ineligible buy-ins', () => {
    mockEligible = false;
    const ui = render(shell(<ChallengeBanner userEvent={event({ status: 'missed' })} />));
    expect(ui.getByText("Missed today's Doji")).toBeTruthy();
    expect(ui.queryByRole('button')).toBeNull();
    mockEligible = true;
    mockSparks = 0;
    ui.rerender(shell(<ChallengeBanner userEvent={event({ status: 'missed' })} />));
    expect(ui.getByText(`Need ${SPARKS_BUY_IN_COST} Sparks`)).toBeTruthy();
    expect(ui.queryByRole('button')).toBeNull();
  });
  it.each(['photo', 'poll', 'task', 'format'] as const)(
    'confirms paid re-entry into %s only after command success',
    (type) => {
      const ui = render(
        shell(
          <ChallengeBanner userEvent={event({ status: 'missed', challenge: challenge(type) })} />,
        ),
      );
      fireEvent.press(
        ui.getByLabelText(`Missed today's Doji. Buy in for ${SPARKS_BUY_IN_COST} Sparks`),
      );
      expect(ui.getByText("Buy into today's Doji")).toBeTruthy();
      fireEvent.press(ui.getByText('Cancel'));
      expect(ui.queryByText("Buy into today's Doji")).toBeNull();
      fireEvent.press(
        ui.getByLabelText(`Missed today's Doji. Buy in for ${SPARKS_BUY_IN_COST} Sparks`),
      );
      return act(async () => {
        fireEvent.press(
          ui.getByRole('button', { name: `Buy in for ${SPARKS_BUY_IN_COST} Sparks` }),
        );
        await Promise.resolve();
        jest.advanceTimersByTime(20);
        expect(mockBuy).toHaveBeenCalledTimes(1);
        expect(mockRouter.push).toHaveBeenCalledWith(challengeEntryHref(type));
      });
    },
  );
  it.each([new Error('Not enough Sparks'), { message: 'Please retry' }, null])(
    'keeps failed buy-in open with feedback',
    async (error) => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockBuy.mockRejectedValue(error);
      const ui = render(shell(<ChallengeBanner userEvent={event({ status: 'missed' })} />));
      fireEvent.press(
        ui.getByLabelText(`Missed today's Doji. Buy in for ${SPARKS_BUY_IN_COST} Sparks`),
      );
      await act(async () => {
        fireEvent.press(
          ui.getByRole('button', { name: `Buy in for ${SPARKS_BUY_IN_COST} Sparks` }),
        );
        await Promise.resolve();
      });
      expect(ui.getByText('Buy-in did not complete')).toBeTruthy();
      expect(mockRouter.push).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    },
  );
});

describe('challenge type glyphs', () => {
  it.each([
    ['poll', 'Would you rather fly?', undefined, 'A/B'],
    ['poll', '', 'wyr', 'A/B'],
    ['poll', 'Ordinary poll', 'poll', null],
    ['format', '', undefined, 'Aa'],
    ['photo', '', undefined, null],
    ['task', '', undefined, null],
  ] as const)('renders the %s kind glyph', (type, title, pollKind, expected) => {
    const ui = render(
      <ChallengeTypeGlyph type={type} title={title} pollKind={pollKind} color="#123456" />,
    );
    if (expected) expect(ui.getByText(expected)).toBeTruthy();
    else expect(ui.queryByText('A/B')).toBeNull();
  });
});

describe('countdown presentation and reconciliation', () => {
  it.each([0, 60, 61, 600])('exposes urgency and clock text for %s seconds', (remaining) => {
    mockRemaining = remaining;
    const ui = render(<ChallengeTimer expiresAt="expires" />);
    expect(ui.getByRole('timer').props.accessibilityLiveRegion).toBe(
      remaining <= 60 ? 'polite' : 'none',
    );
    ui.rerender(<ChallengeTimer expiresAt="expires" variant="ring" />);
    expect(ui.getByRole('timer')).toBeTruthy();
    ui.rerender(<ChallengeTimer expiresAt={null} />);
    expect(ui.toJSON()).toBeNull();
  });
  it.each([-10, 0, 700])('clamps a ring at its valid bounds (%s)', (remainingSeconds) => {
    const ui = render(
      <CountdownRing
        remainingSeconds={remainingSeconds}
        totalSeconds={600}
        size={120}
        strokeWidth={4}
      />,
    );
    expect(ui.getByRole('timer').props.accessibilityLabel).toContain(
      remainingSeconds > 600 ? '10:00' : '0:00',
    );
    ui.rerender(<CountdownRing remainingSeconds={remainingSeconds} totalSeconds={0} />);
    expect(ui.getByRole('timer')).toBeTruthy();
  });
  it('invalidates authorized upcoming and participation reads when countdown expires', () => {
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue();
    mockUntil = 90;
    const ui = render(
      <QueryClientProvider client={client}>
        <UpcomingDojiBanner firesAt="fires" />
      </QueryClientProvider>,
    );
    expect(ui.getByLabelText('Doji coming soon. Starts in 1:30.')).toBeTruthy();
    act(() => {
      mockExpire?.();
      jest.runOnlyPendingTimers();
    });
    expect(invalidate).toHaveBeenCalled();
    ui.unmount();
    client.clear();
  });
});
