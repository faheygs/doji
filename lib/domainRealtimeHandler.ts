import type { QueryClient } from '@tanstack/react-query';
import type { DojiRealtimeEvent } from './realtimeClient';
import { realtimeQueryRoots } from './realtimeQueryRoots';
import { refreshActivePostEngagement } from './postEngagement';
import { useAuthStore } from '../stores/useAuthStore';

type HandlerContext = {
  event: DojiRealtimeEvent;
  userId: string;
  queryClient: QueryClient;
  invalidateRoots: (...roots: string[]) => void;
};

/** Map identifier-only realtime hints to authoritative query reconciliation. */
export function handleDomainRealtimeEvent({
  event,
  userId,
  queryClient,
  invalidateRoots,
}: HandlerContext): void {
  if (event.type.startsWith('doji.')) {
    invalidateRoots('upcomingDoji', 'userEvent', 'feed', 'notificationCenter');
    return;
  }
  if (event.type.startsWith('poll.vote.') || event.type.startsWith('poll.vote_like.')) {
    invalidateRoots(...realtimeQueryRoots(event.type));
    return;
  }
  if (event.type.startsWith('user_event.')) {
    invalidateRoots('userEvent', 'feed');
    return;
  }
  if (event.type.startsWith('shop.ownership.')) {
    invalidateRoots('ownedShopItems');
    void useAuthStore.getState().fetchProfile(userId);
    return;
  }
  if (event.type.startsWith('account.profile.')) {
    void useAuthStore.getState().fetchProfile(userId);
    invalidateRoots('profile');
    return;
  }
  if (event.type.startsWith('social.friendship.')) {
    invalidateRoots(
      'friends',
      'friendRequests',
      'friendship',
      'friendCount',
      'profileFriends',
      'feed',
      'notificationCenter',
    );
    return;
  }
  if (event.type.startsWith('social.block.')) {
    invalidateRoots('blockedUsers', 'isBlocked', 'profile', 'feed');
    return;
  }
  if (event.type.startsWith('notification.')) {
    handleNotificationEvent(event, queryClient, invalidateRoots);
    return;
  }
  if (event.type === 'profile.updated' || event.type.startsWith('profile.presentation.')) {
    const changedUserId = stringPayload(event, 'userId');
    if (changedUserId === userId) void useAuthStore.getState().fetchProfile(userId);
    invalidateRoots(
      'profile',
      'searchUsers',
      'friends',
      'friendRequests',
      'profileFriends',
      'pollVotersDetail',
      'leaderboard',
      'comments',
      'reactions',
      'notificationCenter',
      'feed',
    );
    return;
  }
  if (event.type.startsWith('profile.stats.')) {
    if (stringPayload(event, 'userId') === userId) {
      void useAuthStore.getState().fetchProfile(userId);
    }
    invalidateRoots('profile', 'friends', 'leaderboard');
    return;
  }
  if (event.type === 'badge.updated') {
    invalidateRoots('userBadges', 'userBadgeProgress', 'profile');
    if (stringPayload(event, 'userId') === userId) {
      void useAuthStore.getState().fetchProfile(userId);
    }
    return;
  }
  if (event.type === 'leaderboard.updated') {
    invalidateRoots('leaderboard');
    return;
  }
  if (event.type.startsWith('moderation.report.')) {
    invalidateRoots('admin');
    return;
  }
  const roots = realtimeQueryRoots(event.type);
  if (roots.length > 0) invalidateRoots(...roots);
}

function handleNotificationEvent(
  event: DojiRealtimeEvent,
  queryClient: QueryClient,
  invalidateRoots: (...roots: string[]) => void,
): void {
  const roots = ['notificationCenter'];
  const postId = stringPayload(event, 'postId');
  const isReaction = event.type.startsWith('notification.reaction');
  const isComment =
    event.type.startsWith('notification.comment.') ||
    event.type.startsWith('notification.comment_reply.');
  const isCommentLike = event.type.startsWith('notification.comment_like');

  if (postId && (isReaction || isComment)) {
    void refreshActivePostEngagement(queryClient, postId).catch((error) => {
      if (__DEV__) console.warn('[realtime] engagement refresh failed', postId, error);
    });
  }
  if (postId && (isComment || isCommentLike)) {
    void queryClient.invalidateQueries(
      {
        predicate: (query) =>
          query.queryKey[0] === 'comments' && query.queryKey[1] === postId,
        refetchType: 'active',
      },
      { cancelRefetch: false },
    );
  }
  if (postId && isReaction) {
    void queryClient.invalidateQueries(
      {
        predicate: (query) =>
          query.queryKey[0] === 'reactions' && query.queryKey[1] === postId,
        refetchType: 'active',
      },
      { cancelRefetch: false },
    );
  }
  if (event.type.startsWith('notification.friend_activity.')) {
    roots.push('pollResults', 'pollVotersDetail', 'feed');
  }
  if (event.type.startsWith('notification.suggestion.')) {
    roots.push('mySuggestions', 'challengeSuggestionCounts');
  }
  if (event.type.startsWith('notification.badge.')) {
    roots.push('userBadges', 'userBadgeProgress', 'profile');
  }
  invalidateRoots(...roots);
}

function stringPayload(event: DojiRealtimeEvent, key: string): string | undefined {
  const value = event.payload[key];
  return typeof value === 'string' ? value : undefined;
}
