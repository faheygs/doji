import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import { BuyInSheet } from '../../components/economy/BuyInSheet';
import { ProfileStreakPair } from '../../components/profile/ProfileSections';
import { SparksPill, LiveSparksPill } from '../../components/economy/SparksPill';
import { lightColors } from '../../constants/theme';
import { SPARKS_BUY_IN_COST } from '../../constants/sparks';
import type { Challenge, Profile, UserEvent } from '../../types/database';

const mockColors = lightColors;
let mockProfile: Profile | null = null;
jest.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ colors: mockColors }) }));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) => select({ profile: mockProfile }),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
// Native presentation is outside this suite; contents and footer are real.
jest.mock('../../components/ui/KeyboardSafeSheet', () => ({
  KeyboardSafeSheet: ({
    visible,
    children,
    footer,
  }: {
    visible: boolean;
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) => {
    const React = require('react');
    return visible ? React.createElement(React.Fragment, null, children, footer) : null;
  },
}));
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockProfile = null;
});
afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('buy-in confirmation', () => {
  function setup(overrides: Partial<React.ComponentProps<typeof BuyInSheet>> = {}) {
    const props = {
      visible: true,
      userEvent: null,
      challenge: null,
      sparksBalance: 1000,
      onConfirm: jest.fn(),
      onClose: jest.fn(),
      ...overrides,
    };
    return { ...render(<BuyInSheet {...props} />), props };
  }

  test.each([0, SPARKS_BUY_IN_COST - 1, SPARKS_BUY_IN_COST, 1000])(
    'balance %s respects the configured cost and nonnegative preview',
    (sparksBalance) => {
      const view = setup({ sparksBalance });
      const button = view.getByRole('button', { name: `Buy in for ${SPARKS_BUY_IN_COST} Sparks` });
      expect(button.props.accessibilityState.disabled).toBe(sparksBalance < SPARKS_BUY_IN_COST);
      const amounts = view.UNSAFE_getAllByType(SparksPill).map((node) => node.props.amount);
      expect(amounts).toEqual([
        SPARKS_BUY_IN_COST,
        Math.max(0, sparksBalance - SPARKS_BUY_IN_COST),
      ]);
      fireEvent.press(button);
      expect(view.props.onConfirm).toHaveBeenCalledTimes(
        sparksBalance >= SPARKS_BUY_IN_COST ? 1 : 0,
      );
    },
  );

  test('pending buy-in blocks repeat confirmation while preserving cancel', () => {
    const view = setup({ loading: true });
    const pending = view.getAllByRole('button').find((node) => node.props.accessibilityState.busy)!;
    expect(pending).toBeDisabled();
    fireEvent.press(pending);
    fireEvent.press(view.getByRole('button', { name: 'Cancel' }));
    expect(view.props.onConfirm).not.toHaveBeenCalled();
    expect(view.props.onClose).toHaveBeenCalledTimes(1);
  });

  test('failed buy-in remains actionable and visible to assistive technology', () => {
    const view = setup({ error: 'Try again when connected.' });
    expect(view.getByRole('alert')).toBeTruthy();
    expect(view.getByText('Buy-in did not complete')).toBeTruthy();
    expect(view.getByText('Try again when connected.')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: `Buy in for ${SPARKS_BUY_IN_COST} Sparks` }));
    expect(view.props.onConfirm).toHaveBeenCalledTimes(1);
  });

  test('current challenge title and explicit type take precedence over old user-event details', () => {
    const view = setup({
      challenge: { type: 'photo', title: 'Current photo' } as Challenge,
      userEvent: { challenge: { title: 'Old title' } } as UserEvent,
    });
    expect(view.getByText('PHOTO')).toBeTruthy();
    expect(view.getByText('Current photo')).toBeTruthy();
    expect(view.queryByText('Old title')).toBeNull();
  });

  test.each([null, { challenge: { title: 'Event title' } } as UserEvent])(
    'missing challenge has a usable title for event %j',
    (userEvent) => {
      const view = setup({ userEvent });
      expect(view.getByText(userEvent ? 'Event title' : "Today's challenge")).toBeTruthy();
      expect(view.getByText('POLL')).toBeTruthy();
    },
  );

  test('hidden sheet cannot initiate a buy-in', () => {
    const view = setup({ visible: false });
    expect(view.queryByRole('button')).toBeNull();
    expect(view.props.onConfirm).not.toHaveBeenCalled();
  });
});

describe('balance displays', () => {
  test.each([false, true])('static pill compact=%s does not claim balance gains', (compact) => {
    const view = render(<SparksPill amount={1500} compact={compact} />);
    expect(view.getByText('1,500')).toHaveStyle({ fontSize: compact ? 13 : 14 });
    expect(view.queryByRole('button')).toBeNull();
    view.rerender(<SparksPill amount={1600} compact={compact} />);
    expect(view.getByText('1,600')).toBeTruthy();
    expect(view.queryByText('+100')).toBeNull();
  });

  test('interactive pill forwards the press without changing the balance', () => {
    const onPress = jest.fn();
    const view = render(<SparksPill amount={500} onPress={onPress} />);
    fireEvent.press(view.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(view.getByText('500')).toBeTruthy();
  });

  test('live balance uses the member store, defaults safely and labels only new gains', () => {
    const view = render(<LiveSparksPill />);
    expect(view.getByText('0')).toBeTruthy();
    mockProfile = { sparks: 500 } as Profile;
    view.rerender(<LiveSparksPill />);
    expect(view.getByText('500')).toBeTruthy();
    expect(view.getByText('+500')).toBeTruthy();
    act(() => jest.advanceTimersByTime(760));
    expect(view.queryByText('+500')).toBeNull();
    mockProfile = { sparks: 450 } as Profile;
    view.rerender(<LiveSparksPill />);
    expect(view.getByText('450')).toBeTruthy();
    expect(view.queryByText('+50')).toBeNull();
  });

  test('successive profile gains replace the label and reset its clear timer', () => {
    const onPress = jest.fn();
    const view = render(
      <ProfileStreakPair currentStreak={2} bestStreak={5} sparks={1000} onPressShop={onPress} />,
    );
    fireEvent.press(view.getByRole('button', { name: 'Open Shop, 1,000 Sparks' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(view.queryByText('+1000')).toBeNull();
    view.rerender(
      <ProfileStreakPair currentStreak={2} bestStreak={5} sparks={1100} onPressShop={onPress} />,
    );
    expect(view.getByText('+100')).toBeTruthy();
    act(() => jest.advanceTimersByTime(500));
    view.rerender(
      <ProfileStreakPair currentStreak={2} bestStreak={5} sparks={1150} onPressShop={onPress} />,
    );
    expect(view.queryByText('+100')).toBeNull();
    expect(view.getByText('+50')).toBeTruthy();
    act(() => jest.advanceTimersByTime(260));
    expect(view.getByText('+50')).toBeTruthy();
    act(() => jest.advanceTimersByTime(500));
    expect(view.queryByText('+50')).toBeNull();
    expect(view.getByRole('button', { name: 'Open Shop, 1,150 Sparks' })).toBeTruthy();
  });

  test('unmount cancels pending gain cleanup', () => {
    const view = render(<SparksPill amount={0} trackGain />);
    view.rerender(<SparksPill amount={5} trackGain />);
    expect(view.getByText('+5')).toBeTruthy();
    const clear = jest.spyOn(global, 'clearTimeout');
    view.unmount();
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });
});
