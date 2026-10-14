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
  'profilePost',
  'searchUsers',
  'friends',
  'friendRequests',
  'friendship',
  'friendCount',
  'profileFriends',
  'blockedUsers',
  'isBlocked',
  'leaderboard',
  'userBadges',
  'userBadgeProgress',
  'ownedShopItems',
  'reactionsGiven',
  'reactions',
  'comments',
  'commentLikes',
  'post',
  'mySuggestions',
  'challengeSuggestionCounts',
  'notificationCenter',
  'moderationStatus',
]);

type RecoveryState = { scope: string; inFlight: Promise<void> | null; lastStartedAt: number };
const recoveries = new WeakMap<QueryClient, RecoveryState>();
const COALESCE_WINDOW_MS = 1_500;

export function isServerRead(query: { queryKey: readonly unknown[] }, isAdmin = false): boolean {
  const root = query.queryKey[0];
  return root === 'admin' ? isAdmin : typeof root === 'string' && SERVER_QUERY_ROOTS.has(root);
}

/** Only lifecycle boundaries supersede recovery; ordinary realtime hints never cancel reads. */
export function suspendAppReads(queryClient: QueryClient, isAdmin = false): Promise<void> {
  recoveries.delete(queryClient);
  return queryClient.cancelQueries({
    predicate: query => isServerRead(query, isAdmin) && query.state.fetchStatus !== 'idle',
  });
}

/**
 * Reconcile every server-owned surface after foregrounding or reconnecting.
 * Socket events are hints; Postgres remains authoritative.
 */
export function reconcileAppQueries(
  queryClient: QueryClient,
  options: { userId?: string; isAdmin?: boolean; force?: boolean } = {},
): Promise<void> {
  const scope = JSON.stringify([options.userId, options.isAdmin === true]);
  let state = recoveries.get(queryClient);
  if (!state || state.scope !== scope) {
    state = { scope, inFlight: null, lastStartedAt: -Infinity };
    recoveries.set(queryClient, state);
  }
  if (state.inFlight) return state.inFlight;

  const now = Date.now();
  if (!options.force && now - state.lastStartedAt < COALESCE_WINDOW_MS) {
    return Promise.resolve();
  }
  state.lastStartedAt = now;

  // One cache traversal replaces dozens of overlapping invalidations. Only
  // mounted queries refetch now; inactive screens are marked stale and refresh
  // when the user actually opens them.
  state.inFlight = queryClient
    .invalidateQueries(
      {
        predicate: query => isServerRead(query, options.isAdmin),
        refetchType: 'active',
      },
      { cancelRefetch: false },
    )
    .finally(() => {
      state.inFlight = null;
    });

  return state.inFlight;
}
