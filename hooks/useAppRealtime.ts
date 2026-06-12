import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import Toast from 'react-native-toast-message';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import { useCelebrationStore } from '../stores/useCelebrationStore';
import { isBadgeTierUpgrade, tiersUnlockedUpTo } from '../lib/badgeCelebration';
import type { BadgeTierName } from '../constants/theme';
import { invalidateFriendCountQueries } from './useProfile';

/**
 * Subscribes while authenticated so UI stays in sync with Supabase.
 * Which row events you receive depends on SELECT policies (RLS) for each table.
 */

/** Coalesce many rapid Realtime events into a single feed refresh (reduces list jank). */
const FEED_INVALIDATE_DEBOUNCE_MS = 380;

export function useAppRealtime(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    let live = true;
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
          }
          if (payload.eventType === 'UPDATE' && n?.requester_id === userId) {
            if (n.status === 'accepted') {
              Toast.show({ type: 'success', text1: 'Friend request accepted' });
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
            if (!live) return;
            const { data: postRow } = await supabase
              .from('posts')
              .select('user_id')
              .eq('id', row.post_id!)
              .maybeSingle();

            if (!live) return;
            if (postRow?.user_id === userId) {
              void useAuthStore.getState().fetchProfile(userId);
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
            if (!live) return;
            const { data: c } = await supabase
              .from('comments')
              .select('post_id')
              .eq('id', cid)
              .maybeSingle();
            if (!live) return;
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
          payload: RealtimePostgresChangesPayload<
            | {
                id?: string;
                equipped_border_key?: string | null;
                equipped_title_key?: string | null;
                accent_theme?: string;
              }
            | Record<string, never>
          >,
        ) => {
          const row = (payload.new ?? payload.old) as
            | {
                id?: string;
                equipped_border_key?: string | null;
                equipped_title_key?: string | null;
                accent_theme?: string;
              }
            | undefined;
          const touchedId = row?.id;
          if (touchedId === userId) {
            void useAuthStore.getState().fetchProfile(userId);
          }
          queryClient.invalidateQueries({
            predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'profile',
          });
          queryClient.invalidateQueries({ queryKey: ['searchUsers'] });
          queryClient.invalidateQueries({ queryKey: ['leaderboard'] });

          const cosmeticChanged =
            payload.eventType === 'UPDATE' &&
            row &&
            ('equipped_border_key' in (payload.new ?? {}) ||
              'equipped_title_key' in (payload.new ?? {}) ||
              'accent_theme' in (payload.new ?? {}));

          scheduleFeedInvalidate();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_shop_items' },
        (payload: RealtimePostgresChangesPayload<{ user_id?: string }>) => {
          const uid = (payload.new as { user_id?: string } | undefined)?.user_id ??
            (payload.old as { user_id?: string } | undefined)?.user_id;
          if (uid) {
            void queryClient.invalidateQueries({ queryKey: ['ownedShopItems', uid] });
          }
          if (uid === userId) {
            void useAuthStore.getState().fetchProfile(userId);
          }
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
            void (async () => {
              if (!live) return;
              const { data: category } = await supabase
                .from('badge_categories')
                .select('name')
                .eq('id', row.category_id!)
                .maybeSingle();
              if (!live) return;
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
        },
      )
      .subscribe();

    return () => {
      live = false;
      if (feedInvalidateTimer !== null) clearTimeout(feedInvalidateTimer);
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
