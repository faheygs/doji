import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { reconcileAppQueries } from '../lib/reconcileQueries';
import { useAuthStore } from '../stores/useAuthStore';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';

/**
 * User-scoped database websocket safety net.
 *
 * Ably remains the ordered domain-event transport for shared social data.
 * Subscribing every handset to every social table does not scale and caused
 * duplicate invalidation storms, so this fallback only watches rows owned by
 * the signed-in user. Connection recovery performs an authoritative catch-up.
 */
export function useAppRealtime(userId: string | undefined) {
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((state) => state.profile?.is_admin === true);

  useEffect(() => {
    if (!userId) return;

    const invalidateRoots = (...roots: string[]) =>
      scheduleQueryInvalidation(queryClient, roots);

    const channel = supabase
      .channel(`social-db:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_events',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          invalidateRoots('userEvent', 'feed');
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*', schema: 'public', table: 'user_badges', filter: `user_id=eq.${userId}`,
        },
        () => {
          invalidateRoots('userBadges');
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*', schema: 'public', table: 'user_badge_progress', filter: `user_id=eq.${userId}`,
        },
        () => {
          invalidateRoots('userBadgeProgress');
          void useAuthStore.getState().fetchProfile(userId);
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_shop_items',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          invalidateRoots('ownedShopItems');
          void useAuthStore.getState().fetchProfile(userId);
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships',
          filter: `requester_id=eq.${userId}`,
        },
        () => {
          invalidateRoots('friends', 'friendRequests', 'friendship', 'feed');
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships',
          filter: `addressee_id=eq.${userId}`,
        },
        () => {
          invalidateRoots('friends', 'friendRequests', 'friendship', 'feed');
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'blocks',
          filter: `blocker_id=eq.${userId}`,
        },
        () => {
          invalidateRoots('blockedUsers', 'isBlocked', 'profile', 'feed');
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comment_mentions',
          filter: `mentioned_user_id=eq.${userId}`,
        },
        () => {
          invalidateRoots('notificationCenter');
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notification_center_state',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          invalidateRoots('notificationCenter');
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notification_dismissals',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          invalidateRoots('notificationCenter');
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'challenge_suggestions',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          invalidateRoots('mySuggestions', 'challengeSuggestionCounts', 'notificationCenter');
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void reconcileAppQueries(queryClient, { userId, isAdmin });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isAdmin, queryClient, userId]);
}
