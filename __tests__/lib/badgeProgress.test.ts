import {
  countEarnedBadgeTiers,
  type BadgeProgressStats,
} from '../../lib/badgeProgress';
import type { BadgeTier, UserBadgeProgress } from '../../types/database';

const tiers: BadgeTier[] = [
  {
    id: 'streak_bronze',
    category_id: 'streak',
    tier: 'bronze',
    criteria_type: 'streak_days',
    criteria_value: 3,
    sort_order: 1,
  },
  {
    id: 'streak_silver',
    category_id: 'streak',
    tier: 'silver',
    criteria_type: 'streak_days',
    criteria_value: 7,
    sort_order: 2,
  },
  {
    id: 'streak_gold',
    category_id: 'streak',
    tier: 'gold',
    criteria_type: 'streak_days',
    criteria_value: 30,
    sort_order: 3,
  },
  {
    id: 'comp_bronze',
    category_id: 'completions',
    tier: 'bronze',
    criteria_type: 'completions',
    criteria_value: 1,
    sort_order: 1,
  },
];

const stats: BadgeProgressStats = {
  currentStreak: 10,
  longestStreak: 10,
  totalCompletions: 1,
  xp: 0,
  level: 1,
  reactionsReceived: 0,
  reactionsGiven: 0,
  pollVotes: 0,
  friendsCount: 0,
  challengeIdeasSubmitted: 0,
  challengeIdeasPicked: 0,
};

describe('countEarnedBadgeTiers', () => {
  it('uses total tier definitions as denominator', () => {
    const result = countEarnedBadgeTiers(tiers, [], {
      ...stats,
      currentStreak: 0,
      longestStreak: 0,
      totalCompletions: 0,
    });
    expect(result.total).toBe(4);
    expect(result.earned).toBe(0);
  });

  it('counts each met tier separately (streak bronze + silver + completions bronze)', () => {
    const result = countEarnedBadgeTiers(tiers, [], stats);
    expect(result).toEqual({ earned: 3, total: 4 });
  });

  it('counts lower tiers from DB when stats are unavailable', () => {
    const progress: UserBadgeProgress[] = [
      {
        user_id: 'u1',
        category_id: 'streak',
        current_tier: 'gold',
        unlocked_at: '2026-01-01T00:00:00.000Z',
      },
    ];
    const result = countEarnedBadgeTiers(tiers, progress, null);
    expect(result.earned).toBe(3);
    expect(result.total).toBe(4);
  });
});
