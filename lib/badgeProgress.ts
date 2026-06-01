import type { Badge, BadgeTier, BadgeTierName } from '@/types/database';

const TIER_ORDER: BadgeTierName[] = ['bronze', 'silver', 'gold', 'diamond'];

function tierRank(t: BadgeTierName): number {
  return TIER_ORDER.indexOf(t);
}

/** Live inputs used to derive progress toward each badge criteria. */
export type BadgeProgressStats = {
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  xp: number;
  level: number;
  reactionsReceived: number;
  reactionsGiven: number;
  pollVotes: number;
  friendsCount: number;
  /** Rows in `challenge_suggestions` for this user. */
  challengeIdeasSubmitted: number;
  /** Submissions with `selected_at` set (picked for a daily challenge). */
  challengeIdeasPicked: number;
};

export type BadgeProgress = {
  current: number;
  target: number;
  /** 0–100 */
  percent: number;
  label: string;
};

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.floor(n)));
}

/**
 * Best streak progress toward streak-day badges (matches how the DB checks current_streak).
 */
function streakProgressValue(stats: BadgeProgressStats): number {
  return Math.max(stats.currentStreak ?? 0, stats.longestStreak ?? 0);
}

/**
 * Progress for a locked badge. Unknown criteria types show `0 / target` using `criteria_value`.
 */
export function computeBadgeProgress(
  badge: Pick<Badge, 'criteria_type' | 'criteria_value'>,
  stats: BadgeProgressStats,
): BadgeProgress {
  const target = Math.max(1, badge.criteria_value ?? 1);

  switch (badge.criteria_type) {
    case 'streak_days': {
      const current = Math.min(streakProgressValue(stats), target);
      return {
        current,
        target,
        percent: clampPct((current / target) * 100),
        label: `${current} / ${target} day${target === 1 ? '' : 's'}`,
      };
    }
    case 'completions': {
      const raw = stats.totalCompletions ?? 0;
      const current = Math.min(raw, target);
      return {
        current,
        target,
        percent: clampPct((current / target) * 100),
        label: `${current} / ${target} challenge${target === 1 ? '' : 's'}`,
      };
    }
    case 'total_xp': {
      const raw = stats.xp ?? 0;
      const current = Math.min(raw, target);
      return {
        current,
        target,
        percent: clampPct((current / target) * 100),
        label: `${current.toLocaleString()} / ${target.toLocaleString()} XP`,
      };
    }
    case 'reactions_given': {
      const raw = stats.reactionsGiven ?? 0;
      const current = Math.min(raw, target);
      return {
        current,
        target,
        percent: clampPct((current / target) * 100),
        label: `${current} / ${target} reaction${target === 1 ? '' : 's'} given`,
      };
    }
    case 'reactions_received': {
      const raw = stats.reactionsReceived ?? 0;
      const current = Math.min(raw, target);
      return {
        current,
        target,
        percent: clampPct((current / target) * 100),
        label: `${current} / ${target} reaction${target === 1 ? '' : 's'} received`,
      };
    }
    case 'poll_votes': {
      const raw = stats.pollVotes ?? 0;
      const current = Math.min(raw, target);
      return {
        current,
        target,
        percent: clampPct((current / target) * 100),
        label: `${current} / ${target} poll${target === 1 ? '' : 's'}`,
      };
    }
    case 'friends_count':
    case 'followers_count': {
      const raw = stats.friendsCount ?? 0;
      const current = Math.min(raw, target);
      return {
        current,
        target,
        percent: clampPct((current / target) * 100),
        label: `${current} / ${target} friend${target === 1 ? '' : 's'}`,
      };
    }
    case 'level_reached': {
      const raw = stats.level ?? 0;
      const current = Math.min(raw, target);
      return {
        current,
        target,
        percent: clampPct((current / target) * 100),
        label: `Level ${current} / ${target}`,
      };
    }
    case 'challenge_idea':
    case 'ideas_submitted': {
      const raw = stats.challengeIdeasSubmitted ?? 0;
      const current = Math.min(raw, target);
      return {
        current,
        target,
        percent: clampPct((current / target) * 100),
        label: `${current} / ${target} idea${target === 1 ? '' : 's'} submitted`,
      };
    }
    case 'challenge_idea_picked':
    case 'ideas_picked': {
      const raw = stats.challengeIdeasPicked ?? 0;
      const current = Math.min(raw, target);
      return {
        current,
        target,
        percent: clampPct((current / target) * 100),
        label: `${current} / ${target} idea${target === 1 ? '' : 's'} picked for a daily challenge`,
      };
    }
    default: {
      return {
        current: 0,
        target,
        percent: 0,
        label: `0 / ${target}`,
      };
    }
  }
}

/** True when live stats meet or exceed a tier's criteria threshold. */
export function isTierCriteriaMet(
  tierDef: Pick<BadgeTier, 'criteria_type' | 'criteria_value'>,
  stats: BadgeProgressStats,
): boolean {
  const { current, target } = computeBadgeProgress(tierDef, stats);
  return current >= target;
}

/** Highest tier whose criteria are met by live stats (null if none). */
export function highestTierMetByStats(
  categoryTiers: BadgeTier[],
  stats: BadgeProgressStats,
): BadgeTierName | null {
  const sorted = [...categoryTiers].sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
  let highest: BadgeTierName | null = null;
  for (const tierDef of sorted) {
    if (isTierCriteriaMet(tierDef, stats)) {
      highest = tierDef.tier;
    }
  }
  return highest;
}

/** Best tier to display: max of DB-unlocked tier and stats-met tier. */
export function displayTierForCategory(
  unlockedTier: BadgeTierName | null | undefined,
  categoryTiers: BadgeTier[],
  stats: BadgeProgressStats | null | undefined,
): BadgeTierName | null {
  const statsTier = stats ? highestTierMetByStats(categoryTiers, stats) : null;
  if (!unlockedTier && !statsTier) return null;
  if (!unlockedTier) return statsTier;
  if (!statsTier) return unlockedTier;
  return tierRank(statsTier) >= tierRank(unlockedTier) ? statsTier : unlockedTier;
}
