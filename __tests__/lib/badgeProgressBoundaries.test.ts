import {
  computeBadgeProgress,
  highestTierMetByStats,
  displayTierForCategory,
  countEarnedBadgeTiers,
  type BadgeProgressStats,
} from '../../lib/badgeProgress';
import type { BadgeTier, UserBadgeProgress } from '../../types/database';
const stats: BadgeProgressStats = {
  currentStreak: 2,
  longestStreak: 4,
  totalCompletions: 4,
  xp: 4,
  level: 4,
  reactionsReceived: 4,
  reactionsGiven: 4,
  pollVotes: 4,
  friendsCount: 4,
  challengeIdeasSubmitted: 4,
  challengeIdeasPicked: 4,
};
const criteria = [
  'streak_days',
  'completions',
  'total_xp',
  'reactions_given',
  'reactions_received',
  'poll_votes',
  'friends_count',
  'level_reached',
  'challenge_idea',
  'ideas_submitted',
  'challenge_idea_picked',
  'ideas_picked',
];
const tiers = [
  { category_id: 'one', tier: 'gold', criteria_type: 'completions', criteria_value: 10 },
  { category_id: 'one', tier: 'bronze', criteria_type: 'completions', criteria_value: 1 },
  { category_id: 'one', tier: 'silver', criteria_type: 'completions', criteria_value: 3 },
] as BadgeTier[];

test.each(criteria)(
  '%s progress clamps to target and handles unavailable stats',
  (criteria_type) => {
    expect(computeBadgeProgress({ criteria_type, criteria_value: 10 }, stats)).toMatchObject({
      current: 4,
      target: 10,
      percent: 40,
    });
    expect(computeBadgeProgress({ criteria_type, criteria_value: 1 }, stats)).toMatchObject({
      current: 1,
      target: 1,
      percent: 100,
    });
    expect(
      computeBadgeProgress({ criteria_type, criteria_value: 10 }, {} as BadgeProgressStats),
    ).toMatchObject({ current: 0, target: 10, percent: 0 });
  },
);
test('unknown criteria and missing/zero thresholds do not produce NaN', () => {
  expect(
    computeBadgeProgress(
      { criteria_type: 'unknown', criteria_value: null as unknown as number },
      stats,
    ),
  ).toEqual({ current: 0, target: 1, percent: 0, label: '0 / 1' });
  expect(
    computeBadgeProgress({ criteria_type: 'completions', criteria_value: 0 }, stats).target,
  ).toBe(1);
  expect(
    computeBadgeProgress({ criteria_type: 'total_xp', criteria_value: 10 }, { ...stats, xp: NaN })
      .percent,
  ).toBe(0);
});
test('highest tier uses canonical order without reordering server rows', () => {
  const before = [...tiers];
  expect(highestTierMetByStats(tiers, stats)).toBe('silver');
  expect(tiers).toEqual(before);
  expect(highestTierMetByStats([], stats)).toBeNull();
  expect(highestTierMetByStats(tiers, { ...stats, totalCompletions: 0 })).toBeNull();
});
test('display preserves earned database tier while allowing higher current progress', () => {
  expect(displayTierForCategory(null, tiers, null)).toBeNull();
  expect(displayTierForCategory(null, tiers, stats)).toBe('silver');
  expect(displayTierForCategory('gold', tiers, undefined)).toBe('gold');
  expect(displayTierForCategory('bronze', tiers, stats)).toBe('silver');
  expect(displayTierForCategory('gold', tiers, stats)).toBe('gold');
});
test('earned count counts tier milestones once and keeps unrelated categories separate', () => {
  const progress = [{ category_id: 'one', current_tier: 'silver' }] as UserBadgeProgress[];
  expect(countEarnedBadgeTiers([], progress, stats)).toEqual({ earned: 0, total: 0 });
  expect(countEarnedBadgeTiers(tiers, progress, null)).toEqual({ earned: 2, total: 3 });
  expect(countEarnedBadgeTiers(tiers, progress, stats)).toEqual({ earned: 2, total: 3 });
  expect(countEarnedBadgeTiers(tiers, [], null)).toEqual({ earned: 0, total: 3 });
  expect(
    countEarnedBadgeTiers(
      tiers,
      [{ category_id: 'other', current_tier: 'diamond' }] as UserBadgeProgress[],
      null,
    ),
  ).toEqual({ earned: 0, total: 3 });
});
