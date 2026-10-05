import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Modal, Platform, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { lightColors, darkColors, type BadgeTierName } from '../../constants/theme';
import { BadgesGrid } from '../../components/gamification/BadgesGrid';
import { BadgeUnlockModal } from '../../components/gamification/BadgeUnlockModal';
import { LevelBadge } from '../../components/gamification/LevelBadge';
import { XPBar } from '../../components/gamification/XPBar';
import { CelebrationHost } from '../../components/gamification/CelebrationHost';
import { useCelebrationStore } from '../../stores/useCelebrationStore';
import type { BadgeCategory, BadgeTier, UserBadgeProgress } from '../../types/database';
import type { BadgeProgressStats } from '../../lib/badgeProgress';
import { sparksForBadgeTier } from '../../constants/sparks';

let mockColors = lightColors;
jest.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ colors: mockColors }) }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
const platform = Platform.OS;
const category: BadgeCategory = {
  id: 'completions',
  name: 'Finisher',
  emoji: '',
  description: 'Complete daily challenges.',
  sort_order: 0,
};
const tier = (name: BadgeTierName = 'bronze', value = 1, criteria = 'completions'): BadgeTier => ({
  id: name,
  category_id: category.id,
  tier: name,
  criteria_value: value,
  criteria_type: criteria,
  sort_order: 0,
});
const stats: BadgeProgressStats = {
  currentStreak: 0,
  longestStreak: 0,
  totalCompletions: 0,
  xp: 0,
  level: 1,
  reactionsReceived: 0,
  reactionsGiven: 0,
  pollVotes: 0,
  friendsCount: 0,
  challengeIdeasSubmitted: 0,
  challengeIdeasPicked: 0,
};
const progress: UserBadgeProgress = {
  user_id: 'synthetic',
  category_id: category.id,
  current_tier: 'bronze',
  unlocked_at: '2026-09-01T00:00:00Z',
};
beforeEach(() => {
  jest.clearAllMocks();
  mockColors = lightColors;
  useCelebrationStore.setState({ badge: null });
});
afterEach(() => {
  Platform.OS = platform;
});

describe.each(['light', 'dark'])('%s badge progress', (mode) => {
  beforeEach(() => {
    mockColors = mode === 'dark' ? darkColors : lightColors;
  });
  it('shows locked progress, handles measured layout and all dismissal routes', () => {
    const ui = render(
      <BadgesGrid
        categories={[category]}
        tiers={[tier('silver', 10), tier('bronze', 2)]}
        progress={[]}
        progressStats={{ ...stats, totalCompletions: 1 }}
      />,
    );
    const grid = ui.UNSAFE_getAllByType(View).find((node) => node.props.onLayout)!;
    fireEvent(grid, 'layout', { nativeEvent: { layout: { width: 330 } } });
    fireEvent(grid, 'layout', { nativeEvent: { layout: { width: 330 } } });
    fireEvent.press(ui.getByText('Finisher'));
    expect(ui.getByText('LOCKED')).toBeTruthy();
    expect(ui.getByText('1 / 2 challenges')).toBeTruthy();
    fireEvent.press(ui.getByLabelText('Close'));
    expect(ui.queryByText('LOCKED')).toBeNull();
    fireEvent.press(ui.getByText('Finisher'));
    fireEvent.press(ui.getByLabelText('Dismiss'));
    expect(ui.queryByText('LOCKED')).toBeNull();
    fireEvent.press(ui.getByText('Finisher'));
    fireEvent(ui.UNSAFE_getByType(Modal), 'requestClose');
    expect(ui.queryByText('LOCKED')).toBeNull();
  });
  it('combines persisted tier with live progress toward the next tier', () => {
    const ui = render(
      <BadgesGrid
        categories={[category]}
        tiers={[tier(), tier('silver', 10)]}
        progress={[progress]}
        progressStats={{ ...stats, totalCompletions: 4 }}
      />,
    );
    fireEvent.press(ui.getByText('Finisher'));
    expect(ui.getByText('NEXT: SILVER')).toBeTruthy();
    expect(ui.getByText('4 / 10 challenges')).toBeTruthy();
    expect(ui.getByText(/BRONZE ·/)).toBeTruthy();
  });
  it('shows locally met criteria before persisted tier catches up', () => {
    const ui = render(
      <BadgesGrid
        categories={[category]}
        tiers={[tier(), tier('silver', 10)]}
        progress={[]}
        progressStats={{ ...stats, totalCompletions: 2 }}
      />,
    );
    fireEvent.press(ui.getByText('Finisher'));
    expect(ui.getByText('BRONZE · CRITERIA MET')).toBeTruthy();
    expect(ui.getByText('NEXT: SILVER')).toBeTruthy();
  });
  it('does not invent a next tier once all criteria are met', () => {
    const ui = render(
      <BadgesGrid categories={[category]} tiers={[tier()]} progress={[progress]} />,
    );
    fireEvent.press(ui.getByText('Finisher'));
    expect(ui.queryByText(/NEXT:/)).toBeNull();
    expect(ui.getByText('Complete 1 challenge')).toBeTruthy();
  });
  it('supports read-only and empty-catalog categories without detail interactions', () => {
    const ui = render(<BadgesGrid categories={[category]} tiers={[]} progress={[]} readOnly />);
    fireEvent.press(ui.getByText('Finisher'));
    expect(ui.UNSAFE_queryByType(Modal)).toBeNull();
    ui.rerender(<BadgesGrid categories={[category]} tiers={[]} progress={[]} />);
    fireEvent.press(ui.getByText('Finisher'));
    expect(ui.getByText('LOCKED')).toBeTruthy();
  });
});

it.each([
  ['streak_days', 5, 'Reach a 5-day streak'],
  ['completions', 1, 'Complete 1 challenge'],
  ['completions', 2, 'Complete 2 challenges'],
  ['total_xp', 1000, 'Earn 1,000 total XP'],
  ['reactions_given', 1, 'Give 1 reaction'],
  ['reactions_given', 2, 'Give 2 reactions'],
  ['reactions_received', 1, 'Receive 1 reaction'],
  ['reactions_received', 2, 'Receive 2 reactions'],
  ['poll_votes', 1, 'Vote in 1 poll'],
  ['poll_votes', 2, 'Vote in 2 polls'],
  ['friends_count', 1, 'Have 1 friend'],
  ['friends_count', 2, 'Have 2 friends'],
  ['level_reached', 5, 'Reach level 5'],
  ['ideas_submitted', 1, 'Submit 1 challenge idea'],
  ['ideas_submitted', 2, 'Submit 2 challenge ideas'],
  ['ideas_picked', 1, 'Have 1 idea picked for a daily challenge'],
  ['ideas_picked', 2, 'Have 2 ideas picked for a daily challenge'],
  ['future_criterion', 2, 'Reach 2'],
])('explains %s criteria (%s)', (criteria, value, label) => {
  const ui = render(
    <BadgesGrid
      categories={[category]}
      tiers={[tier('bronze', Number(value), String(criteria))]}
      progress={[]}
    />,
  );
  fireEvent.press(ui.getByText('Finisher'));
  expect(ui.getByText(String(label))).toBeTruthy();
});

describe('earned celebration interaction', () => {
  it.each(['bronze', 'silver', 'gold', 'diamond'] as const)(
    'shows %s award and earned tier indicators',
    (badgeTier) => {
      const close = jest.fn();
      const ui = render(
        <BadgeUnlockModal
          categoryId="completions"
          name="Finisher"
          tier={badgeTier}
          unlockedTiers={['bronze', badgeTier]}
          onDismiss={close}
        />,
      );
      expect(ui.getByText(`+${sparksForBadgeTier(badgeTier)} Sparks`)).toBeTruthy();
      fireEvent.press(ui.getByRole('button', { name: 'Awesome!' }));
      expect(close).toHaveBeenCalledTimes(1);
      fireEvent(ui.UNSAFE_getByType(Modal), 'requestClose');
      expect(close).toHaveBeenCalledTimes(2);
    },
  );
  it('defaults the unlocked tier collection safely', () => {
    const ui = render(
      <BadgeUnlockModal categoryId="unknown" name="Unknown" tier="bronze" onDismiss={jest.fn()} />,
    );
    expect(ui.getByText('BADGE UNLOCKED')).toBeTruthy();
  });
  it('consumes the actual celebration store and dismisses the current badge', () => {
    const ui = render(<CelebrationHost />);
    expect(ui.toJSON()).toBeNull();
    act(() =>
      useCelebrationStore.getState().showBadgeUnlock({
        categoryId: 'ideas',
        name: 'Idea maker',
        tier: 'silver',
        unlockedTiers: ['bronze', 'silver'],
      }),
    );
    expect(ui.getByText('Idea maker')).toBeTruthy();
    fireEvent.press(ui.getByText('Awesome!'));
    expect(ui.toJSON()).toBeNull();
    expect(useCelebrationStore.getState().badge).toBeNull();
  });
});

describe.each(['ios', 'android', 'web'] as const)('%s XP and rank presentation', (os) => {
  beforeEach(() => {
    Platform.OS = os;
  });
  it.each([false, true])('renders level size small=%s', (small) => {
    const ui = render(<LevelBadge level={12} small={small} />);
    expect(ui.getByText('12')).toBeTruthy();
    expect(ui.UNSAFE_getByType(LinearGradient).props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ height: small ? 22 : 28 })]),
    );
  });
  it('clamps displayed progress at the full track', () => {
    const ui = render(<XPBar xp={999999} level={1} />);
    expect(ui.UNSAFE_getByType(LinearGradient).props.style).toEqual(
      expect.arrayContaining([{ width: '100%' }]),
    );
  });
});
