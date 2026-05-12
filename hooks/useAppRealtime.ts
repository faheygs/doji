import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import Toast from 'react-native-toast-message';
import { supabase } from '../lib/supabase';
import { scheduleLocalNotificationIfAllowed } from '../lib/localPush';
import { useAuthStore } from '../stores/useAuthStore';

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

    const invalidateFriendGraph = () => {
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'friendship' });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'notificationCenter',
      });
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
        (payload: RealtimePostgresChangesPayload<{ user_id?: string; id?: string }>) => {
          scheduleFeedInvalidate();
          if (payload.eventType === 'DELETE') {
            queryClient.invalidateQueries({ queryKey: ['profilePosts'] });
            const postId = (payload.old as { id?: string } | undefined)?.id;
            if (postId) {
              queryClient.invalidateQueries({ queryKey: ['comments', postId] });
            }
            return;
          }
          const row = payload.new as { user_id?: string; id?: string } | undefined;
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
            scheduleLocalNotificationIfAllowed(
              'Friend request',
              'Someone wants to connect on Doji.',
              { type: 'FRIEND_REQUEST' },
            );
          }
          if (payload.eventType === 'UPDATE' && n?.requester_id === userId) {
            if (n.status === 'accepted') {
              Toast.show({ type: 'success', text1: 'Friend request accepted' });
              scheduleLocalNotificationIfAllowed(
                "You're friends",
                'Your friend request was accepted.',
                { type: 'FRIEND_ACCEPTED' },
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
          scheduleFeedInvalidate();
          invalidateNotificationCenter();
          const row = (payload.new ?? payload.old) as { post_id?: string; user_id?: string } | undefined;
          if (row?.post_id) {
            queryClient.invalidateQueries({ queryKey: ['reactions', row.post_id] });
            queryClient.invalidateQueries({ queryKey: ['post', row.post_id] });
          }
          if (
            payload.eventType === 'INSERT' &&
            row?.post_id &&
            row.user_id &&
            row.user_id !== userId
          ) {
            void (async () => {
              const { data } = await supabase
                .from('posts')
                .select('user_id')
                .eq('id', row.post_id!)
                .maybeSingle();
              if (data?.user_id === userId) {
                scheduleLocalNotificationIfAllowed(
                  'New reaction',
                  'Someone reacted to your post.',
                  { type: 'REACTION', postId: row.post_id },
                );
              }
            })();
          }
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
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_events' },
        (payload: RealtimePostgresChangesPayload<{ user_id?: string }>) => {
          queryClient.invalidateQueries({ queryKey: ['userEvent', 'today'] });
          scheduleFeedInvalidate();
          invalidateNotificationCenter();
          const row = payload.new as { user_id?: string } | undefined;
          if (payload.eventType === 'INSERT' && row?.user_id === userId) {
            scheduleLocalNotificationIfAllowed(
              'Challenge ready',
              "Today's challenge is waiting — open Doji to jump in.",
              { type: 'CHALLENGE' },
            );
          }
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
          queryClient.invalidateQueries({ queryKey: ['pollResults'] });
          queryClient.invalidateQueries({ queryKey: ['userEvent', 'today'] });
          scheduleFeedInvalidate();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'poll_options' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['pollResults'] });
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
        { event: '*', schema: 'public', table: 'user_badges' },
        (payload: RealtimePostgresChangesPayload<{ user_id?: string; badge_id?: string }>) => {
          queryClient.invalidateQueries({ queryKey: ['userBadges'] });
          queryClient.invalidateQueries({ queryKey: ['profile'] });
          const row = payload.new as { user_id?: string; badge_id?: string } | undefined;
          if (payload.eventType === 'INSERT' && row?.user_id === userId) {
            scheduleLocalNotificationIfAllowed(
              '🏆 Badge Earned!',
              `You just unlocked a new badge: ${row.badge_id}`,
              { type: 'BADGE_EARNED', badgeId: row.badge_id },
            );
            Toast.show({
              type: 'success',
              text1: '🏆 Badge Earned!',
              text2: `You unlocked: ${row.badge_id}`,
            });
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
