import type { QueryClient } from '@tanstack/react-query';

const SERVER_QUERY_ROOTS = new Set([
  'upcomingDoji',
  'userEvent',
  'feed',
  'pollResults',
  'pollVotersDetail',
  'pollVotesCount',
  'myPollVote',
  'pollVoteLikes',
  'profile',
  'profilePosts',
  'searchUsers',
  'friends',
  'friendRequests',
  'friendship',
  'friendCount',
  'profileFriends',
  'friendshipsBulk',
  'friendIds',
  'pendingRequests',
  'blockedUsers',
  'isBlocked',
  'leaderboard',
  'userBadges',
  'userBadgeProgress',
  'ownedShopItems',
  'reactionsGiven',
  'reactions',
  'comments',
  'post',
  'mySuggestions',
  'challengeSuggestionCounts',
  'notificationCenter',
]);

let inFlight: Promise<void> | null = null;
let lastStartedAt = 0;
const COALESCE_WINDOW_MS = 1_500;

/**
 * Reconcile every server-owned surface after foregrounding or reconnecting.
 * Socket events are hints; Postgres remains authoritative.
 */
export function reconcileAppQueries(
  queryClient: QueryClient,
  options: { userId?: string; isAdmin?: boolean; force?: boolean } = {},
): Promise<void> {
  if (inFlight) return inFlight;

  const now = Date.now();
  if (!options.force && now - lastStartedAt < COALESCE_WINDOW_MS) {
    return Promise.resolve();
  }
  lastStartedAt = now;

  // One cache traversal replaces dozens of overlapping invalidations. Only
  // mounted queries refetch now; inactive screens are marked stale and refresh
  // when the user actually opens them.
  inFlight = queryClient
    .invalidateQueries({
      predicate: (query) => {
        const root = query.queryKey[0];
        if (root === 'admin') return options.isAdmin === true;
        return typeof root === 'string' && SERVER_QUERY_ROOTS.has(root);
      },
      refetchType: 'active',
    }, { cancelRefetch: false })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
