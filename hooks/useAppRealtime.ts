import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import Toast from 'react-native-toast-message';
import { supabase } from '../lib/supabase';
import { scheduleLocalNotificationIfAllowed } from '../lib/localPush';
import { useAuthStore } from '../stores/useAuthStore';
import { useCelebrationStore } from '../stores/useCelebrationStore';
import { isBadgeTierUpgrade, tiersUnlockedUpTo } from '../lib/badgeCelebration';
import type { BadgeTierName } from '../constants/theme';
import { invalidateFriendCountQueries } from './useProfile';
import { invalidateFollowQueries } from './useFollows';

/**
 * Subscribes while authenticated so UI stays in sync with Supabase.
 * Which row events you receive follows SELECT policies (RLS) for each table.
 */

/** Coalesce many rapid Realtime events into a single feed refresh (reduces list jank). */
const FEED_INVALIDATE_DEBOUNCE_MS = 380;

export function useAppRealtime(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    let feedInvalidateTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleFeedInvalidate = () => {
      if (feedInvalidateTimer !== null) clearTimeout(feedInvalidateTimer);
      feedInvalidateTimer = setTimeout(() => {
        feedInvalidateTimer = null;
        queryClient.invalidateQueries({ queryKey: ['feed'] });
      }, FEED_INVALIDATE_DEBOUNCE_MS);
    };

    const refreshFeedReactionsNow = () => {
      void queryClient.invalidateQueries({
        queryKey: ['feed'],
        refetchType: 'active',
      });
    };

    const invalidateFriendGraph = () => {
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'friendship' });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'notificationCenter',
      });
      invalidateFriendCountQueries(queryClient);
    };

    const invalidateNotificationCenter = () => {
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'notificationCenter',
      });
    };

    const channel = supabase
      .channel(`app-realtime-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        (
          payload: RealtimePostgresChangesPayload<{
            user_id?: string | null;
            id?: string;
            is_community_poll?: boolean;
          }>,
        ) => {
          scheduleFeedInvalidate();
          if (payload.eventType === 'DELETE') {
            queryClient.invalidateQueries({ queryKey: ['profilePosts'] });
            const postId = (payload.old as { id?: string } | undefined)?.id;
            if (postId) {
              queryClient.invalidateQueries({ queryKey: ['comments', postId] });
            }
            return;
          }
          const row = payload.new as
            | { user_id?: string | null; id?: string; is_community_poll?: boolean }
            | undefined;
          if (row?.user_id) {
            queryClient.invalidateQueries({ queryKey: ['profilePosts', row.user_id] });
          }
          if (row?.id) {
            queryClient.invalidateQueries({ queryKey: ['comments', row.id] });
          }

          if (
            payload.eventType === 'INSERT' &&
            row?.id &&
            row.user_id &&
            row.user_id !== userId &&
            !row.is_community_poll
          ) {
            void (async () => {
              const posterId = row.user_id!;
              const { data: followRow } = await supabase
                .from('follows')
                .select('id')
                .eq('follower_id', userId)
                .eq('following_id', posterId)
                .eq('status', 'accepted')
                .maybeSingle();

              if (followRow) {
                scheduleLocalNotificationIfAllowed(
                  'Friend posted',
                  'Someone you follow shared something new on Doji.',
                  { type: 'FRIEND_POST', postId: row.id },
                  'friend_post',
                );
              }
            })();
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'follows' },
        (
          payload: RealtimePostgresChangesPayload<{
            follower_id?: string;
            following_id?: string;
            status?: string;
          }>,
        ) => {
          invalidateFollowQueries(queryClient, userId);
          const n = payload.new as
            | { follower_id?: string; following_id?: string; status?: string }
            | undefined;
          if (payload.eventType === 'INSERT' && n?.following_id === userId && n.status === 'pending') {
            Toast.show({
              type: 'info',
              text1: 'New follow request',
              text2: 'Open notifications to respond.',
            });
            scheduleLocalNotificationIfAllowed(
              'Follow request',
              'Someone wants to follow you on Doji.',
              { type: 'FOLLOW_REQUEST' },
              'friend_request',
            );
          }
          if (payload.eventType === 'UPDATE' && n?.follower_id === userId) {
            if (n.status === 'accepted') {
              Toast.show({ type: 'success', text1: 'Follow request accepted' });
              scheduleLocalNotificationIfAllowed(
                'Follow accepted',
                'Your follow request was accepted.',
                { type: 'FOLLOW_ACCEPTED' },
                'friend_accepted',
              );
            }
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        (
          payload: RealtimePostgresChangesPayload<{
            addressee_id?: string;
            requester_id?: string;
            status?: string;
          }>,
        ) => {
          invalidateFriendGraph();
          const n = payload.new as
            | { addressee_id?: string; requester_id?: string; status?: string }
            | undefined;
          if (payload.eventType === 'INSERT' && n?.addressee_id === userId) {
            Toast.show({
              type: 'info',
              text1: 'New friend request',
              text2: 'Open notifications to respond.',
            });
            scheduleLocalNotificationIfAllowed(
              'Friend request',
              'Someone wants to connect on Doji.',
              { type: 'FRIEND_REQUEST' },
              'friend_request',
            );
          }
          if (payload.eventType === 'UPDATE' && n?.requester_id === userId) {
            if (n.status === 'accepted') {
              Toast.show({ type: 'success', text1: 'Friend request accepted' });
              scheduleLocalNotificationIfAllowed(
                "You're friends",
                'Your friend request was accepted.',
                { type: 'FRIEND_ACCEPTED' },
                'friend_accepted',
              );
            } else if (n.status === 'blocked') {
              Toast.show({ type: 'info', text1: 'Friend request declined' });
            }
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reactions' },
        (payload: RealtimePostgresChangesPayload<{ post_id?: string; user_id?: string }>) => {
          refreshFeedReactionsNow();
          invalidateNotificationCenter();

          const rowNew = payload.new as { post_id?: string; user_id?: string } | undefined;
          const rowOld = payload.old as { post_id?: string; user_id?: string } | undefined;
          const actorId =
            payload.eventType === 'DELETE' ? rowOld?.user_id : rowNew?.user_id;
          if (actorId) {
            void queryClient.invalidateQueries({ queryKey: ['reactionsGiven', actorId] });
          }

          const row = rowNew ?? rowOld;
          if (!row?.post_id) return;

          queryClient.invalidateQueries({ queryKey: ['reactions', row.post_id] });
          queryClient.invalidateQueries({ queryKey: ['post', row.post_id] });

          void (async () => {
            const { data: postRow } = await supabase
              .from('posts')
              .select('user_id')
              .eq('id', row.post_id!)
              .maybeSingle();

            if (postRow?.user_id === userId) {
              void useAuthStore.getState().fetchProfile(userId);
            }

            if (
              payload.eventType === 'INSERT' &&
              row.user_id &&
              row.user_id !== userId &&
              postRow?.user_id === userId
            ) {
              scheduleLocalNotificationIfAllowed(
                'New reaction',
                'Someone reacted to your post.',
                { type: 'REACTION', postId: row.post_id },
                'reactions_on_my_post',
              );
            }
          })();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments' },
        (payload: RealtimePostgresChangesPayload<{ post_id?: string }>) => {
          scheduleFeedInvalidate();
          const row = (payload.new ?? payload.old) as { post_id?: string } | undefined;
          if (row?.post_id) {
            queryClient.invalidateQueries({ queryKey: ['comments', row.post_id] });
            queryClient.invalidateQueries({ queryKey: ['post', row.post_id] });
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comment_likes' },
        (payload: RealtimePostgresChangesPayload<{ comment_id?: string }>) => {
          const row = (payload.new ?? payload.old) as { comment_id?: string } | undefined;
          const cid = row?.comment_id;
          if (!cid) return;
          void (async () => {
            const { data: c } = await supabase
              .from('comments')
              .select('post_id')
              .eq('id', cid)
              .maybeSingle();
            const postId = c?.post_id as string | undefined;
            if (postId) {
              queryClient.invalidateQueries({ queryKey: ['comments', postId] });
            }
          })();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_events' },
        (payload: RealtimePostgresChangesPayload<{ user_id?: string }>) => {
          queryClient.invalidateQueries({ queryKey: ['userEvent', 'today'] });
          scheduleFeedInvalidate();
          invalidateNotificationCenter();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        (
          payload: RealtimePostgresChangesPayload<{ id?: string } | Record<string, never>>,
        ) => {
          const row = payload.new ?? payload.old;
          const touchedId =
            row && typeof row === 'object' && 'id' in row ? (row as { id?: string }).id : undefined;
          if (touchedId === userId) {
            void useAuthStore.getState().fetchProfile(userId);
          }
          queryClient.invalidateQueries({ queryKey: ['profile'] });
          queryClient.invalidateQueries({ queryKey: ['searchUsers'] });
          queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
          scheduleFeedInvalidate();
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_events' }, () => {
        queryClient.invalidateQueries({ queryKey: ['userEvent', 'today'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges' }, () => {
        queryClient.invalidateQueries({ queryKey: ['userEvent', 'today'] });
        scheduleFeedInvalidate();
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'streak_events' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['profile'] });
          queryClient.invalidateQueries({ queryKey: ['userEvent', 'today'] });
        },
      )
      // New tables for MVP redesign
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'poll_votes' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['pollVotesCount'] });
          queryClient.invalidateQueries({ queryKey: ['pollResults'] });
          queryClient.invalidateQueries({ queryKey: ['pollVotersDetail'] });
          queryClient.invalidateQueries({ queryKey: ['userEvent', 'today'] });
          scheduleFeedInvalidate();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'poll_options' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['pollResults'] });
          queryClient.invalidateQueries({ queryKey: ['pollVotersDetail'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'weekly_xp' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'challenge_suggestions' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['challengeSuggestionCounts'] });
          queryClient.invalidateQueries({ queryKey: ['pendingSuggestions'] });
          queryClient.invalidateQueries({ queryKey: ['mySuggestions'] });
          queryClient.invalidateQueries({ queryKey: ['userBadges'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_badge_progress' },
        (payload: RealtimePostgresChangesPayload<{ user_id?: string; category_id?: string; current_tier?: string }>) => {
          const row = payload.new as { user_id?: string; category_id?: string; current_tier?: string } | undefined;
          const oldRow = payload.old as { current_tier?: string } | undefined;
          const uid = row?.user_id;
          if (uid) {
            queryClient.invalidateQueries({ queryKey: ['userBadgeProgress', uid] });
            queryClient.invalidateQueries({ queryKey: ['userBadges', uid] });
          } else {
            queryClient.invalidateQueries({ queryKey: ['userBadgeProgress'] });
          }
          queryClient.invalidateQueries({ queryKey: ['profile'] });
          if (
            (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') &&
            row?.user_id === userId &&
            row.category_id &&
            row.current_tier &&
            isBadgeTierUpgrade(oldRow?.current_tier, row.current_tier)
          ) {
            scheduleLocalNotificationIfAllowed(
              'Badge Unlocked',
              `${row.category_id ?? 'Badge'} — ${row.current_tier ?? ''} tier`,
              { type: 'BADGE_EARNED', categoryId: row.category_id, tier: row.current_tier },
              'badges',
            );
            void (async () => {
              const { data: category } = await supabase
                .from('badge_categories')
                .select('name')
                .eq('id', row.category_id!)
                .maybeSingle();
              useCelebrationStore.getState().showBadgeUnlock({
                categoryId: row.category_id!,
                name: category?.name ?? row.category_id!,
                tier: row.current_tier as BadgeTierName,
                unlockedTiers: tiersUnlockedUpTo(row.current_tier!),
              });
            })();
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_badges' },
        (payload: RealtimePostgresChangesPayload<{ user_id?: string; badge_id?: string }>) => {
          const row = payload.new as { user_id?: string; badge_id?: string } | undefined;
          const uid = row?.user_id;
          if (uid) {
            queryClient.invalidateQueries({ queryKey: ['userBadges', uid] });
          } else {
            queryClient.invalidateQueries({ queryKey: ['userBadges'] });
          }
          queryClient.invalidateQueries({ queryKey: ['profile'] });
          if (payload.eventType === 'INSERT' && row?.user_id === userId) {
            scheduleLocalNotificationIfAllowed(
              'Badge Earned',
              `You just unlocked a new badge: ${row.badge_id}`,
              { type: 'BADGE_EARNED', badgeId: row.badge_id },
              'badges',
            );
          }
        },
      )
      .subscribe();

    return () => {
      if (feedInvalidateTimer !== null) clearTimeout(feedInvalidateTimer);
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
