import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  SafeAreaView,
  TouchableOpacity,
  Platform,
  InteractionManager,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { Spacing, Radius, webScrollParentStyle } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../../components/ui/Text';
import { ProfileAvatar } from '../../components/ui/ProfileAvatar';
import { PostCard } from '../../components/feed/PostCard';
import { FeedSkeleton } from '../../components/feed/FeedSkeleton';
import { SkeletonSwap } from '../../components/ui/SkeletonSwap';
import { ErrorState } from '../../components/ui/ErrorState';
import { DojiHeaderBrand } from '../../components/branding/DojiHeaderBrand';
import { NotificationSheet } from '../../components/notifications/NotificationSheet';
import { ChallengeBanner } from '../../components/challenge/ChallengeBanner';
import { UpcomingDojiBanner } from '../../components/challenge/UpcomingDojiBanner';
import { IconBell } from '../../components/icons/Icons';
import { useNotificationCenterContext } from '../../contexts/NotificationCenterContext';
import { useUserEvent } from '../../hooks/useUserEvent';
import { useUpcomingDoji } from '../../hooks/useUpcomingDoji';
import { prefetchFeedAudience, useFeed, type FeedAudience } from '../../hooks/useFeed';
import { useAuthStore } from '../../stores/useAuthStore';
import { isChallengeLive } from '../../lib/challengeDay';
import { hasUnlockedFeed } from '../../lib/participationGate';
import type { Post } from '../../types/database';
import { useFocusedRealtimeInvalidation } from '../../hooks/useFocusedRealtimeInvalidation';
import { realtimeQueryRoots } from '../../lib/realtimeQueryRoots';
export default function FeedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    postId?: string | string[];
    openComments?: string | string[];
  }>();
  const pendingPostId = useMemo(() => {
    const raw = params.postId;
    return typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined;
  }, [params.postId]);
  const pendingOpenComments = useMemo(() => {
    const raw = params.openComments;
    const val = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined;
    return val === '1' || val === 'true';
  }, [params.openComments]);
  const { colors } = useTheme();
  const [audience, setAudience] = useState<FeedAudience>('friends');
  useFocusedRealtimeInvalidation(
    'feed:public',
    realtimeQueryRoots,
    audience === 'everyone',
  );
  const [focusPostId, setFocusPostId] = useState<string | null>(null);
  const [focusOpenComments, setFocusOpenComments] = useState(false);
  const flatListRef = useRef<FlatList<Post>>(null);
  const deepLinkHandledRef = useRef<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { data: userEvent, isLoading: userEventLoading } = useUserEvent();
  const { data: upcomingDoji } = useUpcomingDoji();
  const feedUnlocked = userEventLoading ? undefined : hasUnlockedFeed(userEvent);
  const {
    data: feedPages,
    isLoading: feedLoading,
    isError: feedError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useFeed(audience, feedUnlocked, userEvent?.daily_event_id);
  const queryClient = useQueryClient();
  const profile = useAuthStore((s) => s.profile);
  const userId = useAuthStore((s) => s.session?.user?.id);
  const {
    unreadCount: notificationUnread,
    markBellOpened,
    dismissItem: dismissNotificationItem,
    clearNotificationHistory,
    items: notificationItems,
    isLoading: notificationsLoading,
    isClearing: notificationsClearing,
  } = useNotificationCenterContext();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        listHeader: {
          gap: Spacing.sm,
          paddingBottom: Spacing.xs,
        },
        feedTopBar: {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
          paddingBottom: Spacing.sm,
        },
        feedTopInner: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Spacing.md,
          paddingTop: Spacing.xs,
        },
        topActions: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
        },
        actionHit: {
          paddingVertical: Spacing.sm,
          paddingHorizontal: Spacing.xs,
        },
        bellWrap: {
          position: 'relative',
        },
        badge: {
          position: 'absolute',
          top: 2,
          right: -2,
          minWidth: 18,
          height: 18,
          borderRadius: 9,
          paddingHorizontal: 5,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.error,
          pointerEvents: 'none',
        },
        badgeText: {
          color: colors.onPrimary,
          fontSize: 11,
          fontWeight: '700',
        },
        list: {
          paddingBottom: Spacing.xxl,
        },
        empty: {
          alignItems: 'center',
          paddingTop: Spacing.xxl * 2,
          gap: Spacing.md,
          paddingHorizontal: Spacing.xl,
        },
        emptyText: {
          textAlign: 'center',
          lineHeight: 22,
        },
        audienceWrap: {
          flexDirection: 'row',
          marginHorizontal: Spacing.md,
          marginBottom: Spacing.xs,
          padding: 3,
          borderRadius: Radius.md,
          backgroundColor: colors.chipBackground,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        audienceSeg: {
          flex: 1,
          paddingVertical: Spacing.sm,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: Radius.sm,
        },
        audienceSegActive: {
          backgroundColor: colors.surfaceElevated,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
      }),
    [colors],
  );
  const outerStyle = useMemo(() => [styles.container, webScrollParentStyle], [styles.container]);
  const [refreshing, setRefreshing] = useState(false);
  const refreshWorkRef = useRef<Promise<unknown> | null>(null);
  const challengeIsLive = useMemo(() => {
    if (!userEvent?.daily_event?.fires_at) return false;
    return isChallengeLive(userEvent.daily_event.fires_at);
  }, [userEvent]);
  const posts = useMemo(() => feedPages?.pages.flat() ?? [], [feedPages]);
  useEffect(() => {
    if (!userId || !userEvent?.daily_event_id || feedUnlocked === undefined || !feedPages) return;
    const nextAudience: FeedAudience = audience === 'friends' ? 'everyone' : 'friends';
    const task = InteractionManager.runAfterInteractions(() => {
      void prefetchFeedAudience(queryClient, {
        userId,
        dailyEventId: userEvent.daily_event_id,
        audience: nextAudience,
        unlocked: feedUnlocked,
      });
    });
    return () => task.cancel();
  }, [audience, feedPages, feedUnlocked, queryClient, userEvent?.daily_event_id, userId]);
  useEffect(() => {
    if (!pendingPostId || feedLoading) return;
    if (deepLinkHandledRef.current === pendingPostId) return;

    const idx = posts.findIndex((p) => p.id === pendingPostId);
    if (idx >= 0) {
      deepLinkHandledRef.current = pendingPostId;
      setFocusPostId(pendingPostId);
      setFocusOpenComments(pendingOpenComments);
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToIndex({ index: idx, animated: true });
      });
      router.setParams({ postId: undefined, openComments: undefined, mentionCommentId: undefined });
      return;
    }
  }, [pendingPostId, pendingOpenComments, feedLoading, posts, router]);

  const shouldBlur = !hasUnlockedFeed(userEvent) && !userEventLoading;
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (!refreshWorkRef.current) {
        refreshWorkRef.current = Promise.allSettled([
          refetch({ cancelRefetch: false }),
          queryClient.refetchQueries({
            predicate: (query) => {
              const root = query.queryKey[0];
              return root === 'userEvent' || root === 'pollResults';
            },
            type: 'active',
          }),
        ]).finally(() => {
          refreshWorkRef.current = null;
        });
      }

      // Native RefreshControl otherwise spins forever when the radio changes
      // networks while a request is in flight. The authoritative queries keep
      // reconciling in the background; the UI never becomes a blocking state.
      await Promise.race([
        refreshWorkRef.current,
        new Promise<void>((resolve) => {
          setTimeout(resolve, 2_500);
        }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refetch, queryClient]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleScrollToIndexFailed = useCallback(
    (info: { averageItemLength: number; index: number }) => {
      flatListRef.current?.scrollToOffset({
        offset: Math.max(0, info.averageItemLength * info.index),
        animated: true,
      });
    },
    [],
  );

  const handleOpenProfile = useCallback(() => {
    Haptics.selectionAsync();
    router.push('/(app)/profile' as never);
  }, [router]);

  const handleOpenNotifications = useCallback(() => {
    Haptics.selectionAsync();
    setNotificationsOpen(true);
  }, []);

  const renderPost = useCallback(
    ({ item }: { item: Post }) => (
      <PostCard
        post={item}
        blurred={shouldBlur}
        feedAudience={audience}
        initialCommentsOpen={focusPostId === item.id && focusOpenComments}
      />
    ),
    [shouldBlur, audience, focusPostId, focusOpenComments],
  );

  const keyExtractorPost = useCallback((p: Post) => p.id, []);

  const refreshColors = useMemo(() => [colors.text], [colors.text]);
  const ListHeader = useCallback(
    () => (
      <View style={styles.listHeader}>
        <View style={styles.feedTopBar}>
          <View style={styles.feedTopInner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
              <DojiHeaderBrand />
            </View>
            <View style={styles.topActions}>
              <TouchableOpacity
                onPress={handleOpenNotifications}
                style={[styles.actionHit, styles.bellWrap]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={
                  notificationUnread > 0
                    ? `${notificationUnread} notification alerts`
                    : 'Notifications'
                }
              >
                <IconBell size={26} color={colors.text} />
                {notificationUnread > 0 ? (
                  <View style={styles.badge}>
                    <Text variant="bodySmall" style={styles.badgeText}>
                      {notificationUnread > 99 ? '99+' : notificationUnread}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleOpenProfile}
                style={styles.actionHit}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Your profile"
              >
                <ProfileAvatar profile={profile} size={36} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {upcomingDoji ? (
          <UpcomingDojiBanner firesAt={upcomingDoji.fires_at} />
        ) : userEventLoading ? (
          <View
            pointerEvents="none"
            style={{ paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm }}
            accessibilityLabel="Loading today's challenge"
          >
            <View
              style={{
                height: 64,
                borderRadius: Radius.md,
                backgroundColor: colors.surfaceMuted,
              }}
            />
          </View>
        ) : (
          <ChallengeBanner userEvent={userEvent ?? null} />
        )}

        <View style={styles.audienceWrap}>
          {(['friends', 'everyone'] as const).map((key) => {
            const active = audience === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => {
                  Haptics.selectionAsync();
                  setAudience(key);
                }}
                style={[styles.audienceSeg, active && styles.audienceSegActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={key === 'friends' ? 'Friends' : 'Everyone'}
              >
                <Text
                  variant="label"
                  color={active ? colors.text : colors.textTertiary}
                  style={{ fontWeight: active ? '700' : '500' }}
                >
                  {key === 'friends' ? 'Friends' : 'Everyone'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    ),
    [
      styles,
      colors,
      notificationUnread,
      profile,
      handleOpenProfile,
      handleOpenNotifications,
      userEvent,
      userEventLoading,
      upcomingDoji,
      audience,
    ],
  );

  const emptyCopy = useMemo(() => {
    if (audience === 'friends') {
      return {
        emptyHeading: 'Nothing from friends yet',
        emptyBody: 'Add friends to see their responses here.',
      };
    }
    if (!userEvent) {
      return {
        emptyHeading: 'Challenge incoming',
        emptyBody: "Today's challenge hasn't dropped yet.",
      };
    }
    if (challengeIsLive) {
      return {
        emptyHeading: 'Nothing yet',
        emptyBody: 'Be the first to respond.',
      };
    }
    return {
      emptyHeading: 'Challenge incoming',
      emptyBody: 'The challenge drops soon.',
    };
  }, [audience, userEvent, challengeIsLive]);

  const { emptyHeading, emptyBody } = emptyCopy;

  const ListEmptyComponent = useMemo(
    () => (
      <View style={styles.empty}>
        <Text variant="headingLarge">{emptyHeading}</Text>
        {emptyBody ? (
          <Text variant="body" color={colors.textSecondary} style={styles.emptyText}>
            {emptyBody}
          </Text>
        ) : null}
      </View>
    ),
    [styles.empty, styles.emptyText, colors.textSecondary, emptyHeading, emptyBody],
  );

  if (feedError) {
    return (
      <SafeAreaView style={outerStyle}>
        <ListHeader />
        <ErrorState
          title="Couldn't load your feed"
          message="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={outerStyle}>
      <SkeletonSwap
        loading={feedLoading && !refreshing && posts.length === 0}
        skeleton={
          <>
            <ListHeader />
            <FeedSkeleton />
          </>
        }
      >
        <FlatList
          ref={flatListRef}
          style={webScrollParentStyle}
          data={posts}
          keyExtractor={keyExtractorPost}
          renderItem={renderPost}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmptyComponent}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.35}
          initialNumToRender={6}
          maxToRenderPerBatch={4}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.text}
              colors={refreshColors}
            />
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        />
      </SkeletonSwap>

      <NotificationSheet
        visible={notificationsOpen}
        items={notificationItems}
        isLoading={notificationsLoading}
        isClearing={notificationsClearing}
        onDismissItem={dismissNotificationItem}
        onClearHistory={clearNotificationHistory}
        onClose={() => {
          void markBellOpened();
          setNotificationsOpen(false);
        }}
      />
    </SafeAreaView>
  );
}
