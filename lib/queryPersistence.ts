export const QUERY_CACHE_STORAGE_PREFIX = 'doji-query-cache-v3:';

/**
 * Bounded, account-scoped reads that are safe to show as a stale visual
 * baseline while Postgres reconciles. Search drafts, admin queues, mutations,
 * and other ephemeral state intentionally stay memory-only.
 */
export const PERSISTED_QUERY_ROOTS = new Set([
  'badges',
  'badgeCategories',
  'badgeTiers',
  'blockedUsers',
  'challengeSuggestionCounts',
  'commentLikes',
  'comments',
  'feed',
  'friendCount',
  'friendRequests',
  'friends',
  'friendship',
  'isBlocked',
  'leaderboard',
  'mySuggestions',
  'notificationCenter',
  'ownedShopItems',
  'pollResults',
  'pollVoteLikes',
  'pollVotersDetail',
  'pollVotesCount',
  'post',
  'profile',
  'profileFriends',
  'reactions',
  'reactionsGiven',
  'shopCatalog',
  'upcomingDoji',
  'userBadgeProgress',
  'userBadges',
  'userEvent',
]);

export const PERSISTED_QUERY_GC_MS = 60 * 60 * 1_000;

export function isPersistedQueryKey(queryKey: readonly unknown[]): boolean {
  return typeof queryKey[0] === 'string' && PERSISTED_QUERY_ROOTS.has(queryKey[0]);
}

/** Remove expiring bearer capabilities from any nested persisted result. */
export function sanitizePersistedQueryData(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.includes('/storage/v1/object/sign/') ? null : value;
  }
  if (Array.isArray(value)) return value.map(sanitizePersistedQueryData);
  if (!value || typeof value !== 'object') return value;

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(source)) {
    if ((key === 'pages' || key === 'pageParams') && Array.isArray(child)) {
      result[key] = child.slice(0, 1).map(sanitizePersistedQueryData);
    } else {
      result[key] = sanitizePersistedQueryData(child);
    }
  }
  return result;
}

export function queryCacheStorageKey(userId: string): string {
  return `${QUERY_CACHE_STORAGE_PREFIX}${userId}`;
}
