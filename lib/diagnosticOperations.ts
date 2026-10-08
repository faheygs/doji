import { AUTHENTICATED_COMMAND_NAMES } from '../contracts/authenticatedCommands';

const queryRoots = new Set(['feed', 'lockedFeed', 'post', 'profilePost', 'profile', 'publicProfile',
  'comments', 'commentLikes', 'postReactions', 'reactions', 'pollResults', 'pollVotersDetail', 'userEvent',
  'friends', 'friendRequests', 'friendCount', 'blockedUsers', 'leaderboard', 'notifications',
  'notificationCenter', 'friendship', 'searchUsers', 'mentionSearch', 'badges', 'shop', 'shopItems', 'userShopItems', 'moderationStatus',
  'mobileReleasePolicy', 'upcomingDoji', 'appAnnouncement', 'userBadges', 'badgeCategories',
  'badgeTiers', 'userBadgeProgress', 'challengeSuggestionCounts', 'pollVotesCount', 'reactionsGiven',
  'profileFriends', 'mySuggestions', 'pendingSuggestions', 'shopCatalog', 'ownedShopItems', 'isBlocked', 'admin']);
const commands = new Set<string>(AUTHENTICATED_COMMAND_NAMES);
export function queryFailureOperation(key: readonly unknown[]): string {
  return typeof key[0] === 'string' && queryRoots.has(key[0]) ? key[0] : 'other';
}
export function safeDiagnosticOperation(value: string): string {
  return queryRoots.has(value) || commands.has(value) ? value : 'other';
}

const reads = new Set(['get_locked_feed_previews', 'get_feed_page_snapshot_v2', 'get_leaderboard_snapshot',
  'get_my_moderation_status', 'get_notification_center_bootstrap', 'get_notification_center_snapshot',
  'get_pending_reports_snapshot', 'list_my_friends_page', 'get_post_detail', 'friend_count', 'search_profiles',
  'is_username_available', 'list_profile_friends_page', 'get_reactions_given_count', 'get_current_doji_state',
  'get_upcoming_doji_state', 'get_pending_suggestions_snapshot', 'get_mobile_release_policy',
  'get_poll_results_summary', 'get_poll_option_voters_page', 'get_post_engagement_snapshot_v2',
  'get_post_reaction_summaries', 'get_comment_like_voters_page', 'list_blocked_users_page', 'blocked_user_count',
  'get_current_profile_post', 'get_post_reaction_voters_page', 'get_comment_thread_snapshot',
  'search_mentionable_profiles', 'list_friend_requests_page', 'friend_request_count', 'get_public_profile_view']);
const tables = new Set(['posts', 'blocks', 'badges', 'user_badges', 'badge_categories', 'badge_tiers',
  'user_badge_progress', 'friendships', 'poll_votes', 'shop_items', 'user_shop_items', 'challenge_suggestions']);

/** The input URL is inspected locally only; return fixed templates, never IDs or filters. */
export function safeDiagnosticEndpoint(input: RequestInfo | URL): string {
  try {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const path = url.pathname;
    const rpc = path.match(/^\/(?:rest\/v1|commands)\/rpc\/([a-z_0-9]+)$/)?.[1];
    if (rpc && (reads.has(rpc) || commands.has(rpc))) return `rpc:${rpc}`;
    const table = path.match(/^\/rest\/v1\/([a-z_0-9]+)$/)?.[1];
    if (table && tables.has(table)) return `table:${table}`;
    for (const [pattern, label] of [
      [/^\/v1\/feed\/[^/]+$/, 'scale:feed'], [/^\/v1\/posts\/[^/]+\/engagement$/, 'scale:post_engagement'],
      [/^\/v1\/polls\/[^/]+\/summary$/, 'scale:poll_summary'], [/^\/v1\/profiles\/[^/]+$/, 'scale:public_profile'],
    ] as const) if (pattern.test(path)) return label;
  } catch { /* optional, never changes dispatch */ }
  return 'other';
}
